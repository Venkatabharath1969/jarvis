from __future__ import annotations

import logging
import time
from typing import Any

import httpx
import msal

from app.config import get_settings
from app.providers.base import CalendarProvider

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
SCOPES = ["https://graph.microsoft.com/.default"]


class GraphAPIProvider(CalendarProvider):
    """CalendarProvider backed by Microsoft Graph API (live Outlook/ToDo data)."""

    def __init__(self) -> None:
        settings = get_settings()
        self._tenant_id = settings.GRAPH_TENANT_ID
        self._client_id = settings.GRAPH_CLIENT_ID
        self._client_secret = settings.GRAPH_CLIENT_SECRET
        self._user_upn = settings.GRAPH_USER_UPN

        self._app = msal.ConfidentialClientApplication(
            client_id=self._client_id,
            client_credential=self._client_secret,
            authority=f"https://login.microsoftonline.com/{self._tenant_id}",
        )
        self._token: str | None = None
        self._token_expiry: float = 0.0

    # ------------------------------------------------------------------ #
    # Token management
    # ------------------------------------------------------------------ #

    def _acquire_token(self) -> str:
        now = time.time()
        if self._token and now < self._token_expiry - 60:
            return self._token

        result = self._app.acquire_token_for_client(scopes=SCOPES)
        if "access_token" not in result:
            error = result.get("error_description", result.get("error", "unknown"))
            raise RuntimeError(f"MSAL token acquisition failed: {error}")

        self._token = result["access_token"]
        self._token_expiry = now + result.get("expires_in", 3600)
        return self._token  # type: ignore[return-value]

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._acquire_token()}",
            "Content-Type": "application/json",
        }

    # ------------------------------------------------------------------ #
    # HTTP helper with retry on 429
    # ------------------------------------------------------------------ #

    async def _get(self, url: str, params: dict[str, str] | None = None) -> Any:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, headers=self._headers(), params=params)

            if response.status_code == 401:
                logger.error("Graph API returned 401 Unauthorized for %s", url)
                return None

            if response.status_code == 403:
                raise PermissionError(
                    f"Graph API returned 403 Forbidden for {url}. "
                    "Check app permissions in Azure AD."
                )

            if response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", "5"))
                logger.warning("Graph API rate-limited; retrying after %ds", retry_after)
                import asyncio
                await asyncio.sleep(retry_after)
                response = await client.get(url, headers=self._headers(), params=params)

            response.raise_for_status()
            return response.json()

    # ------------------------------------------------------------------ #
    # CalendarProvider implementation
    # ------------------------------------------------------------------ #

    async def get_recent_meetings(self, days: int = 14) -> list[dict[str, Any]]:
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        start = (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
        end = now.strftime("%Y-%m-%dT%H:%M:%SZ")

        url = f"{GRAPH_BASE}/users/{self._user_upn}/calendarView"
        params = {
            "startDateTime": start,
            "endDateTime": end,
            "$select": "id,subject,start,end,attendees,bodyPreview",
            "$orderby": "start/dateTime desc",
            "$top": "50",
        }
        data = await self._get(url, params)
        if data is None:
            return []

        meetings: list[dict[str, Any]] = []
        for event in data.get("value", []):
            attendees = [
                {
                    "name": a.get("emailAddress", {}).get("name", ""),
                    "email": a.get("emailAddress", {}).get("address", ""),
                }
                for a in event.get("attendees", [])
            ]
            meetings.append(
                {
                    "id": event.get("id"),
                    "title": event.get("subject", "(No subject)"),
                    "meeting_date": event.get("start", {}).get("dateTime"),
                    "duration_minutes": None,  # computed from start/end if needed
                    "summary": event.get("bodyPreview", ""),
                    "attendees": attendees,
                }
            )
        return meetings

    async def get_action_items(self) -> list[dict[str, Any]]:
        url = f"{GRAPH_BASE}/users/{self._user_upn}/todo/lists"
        data = await self._get(url)
        if data is None:
            return []

        action_items: list[dict[str, Any]] = []
        for todo_list in data.get("value", []):
            list_id = todo_list.get("id")
            tasks_url = f"{GRAPH_BASE}/users/{self._user_upn}/todo/lists/{list_id}/tasks"
            tasks_data = await self._get(
                tasks_url,
                {"$filter": "status ne 'completed'", "$top": "50"},
            )
            if tasks_data is None:
                continue
            for task in tasks_data.get("value", []):
                due_raw = task.get("dueDateTime", {})
                action_items.append(
                    {
                        "id": task.get("id"),
                        "description": task.get("title", ""),
                        "due_date": due_raw.get("dateTime") if due_raw else None,
                        "status": task.get("status", "notStarted"),
                        "priority": task.get("importance", "normal"),
                        "assignee_name": self._user_upn,
                        "meeting_title": todo_list.get("displayName", ""),
                    }
                )
        return action_items

    async def get_people(self) -> list[dict[str, Any]]:
        url = f"{GRAPH_BASE}/users/{self._user_upn}/people"
        params = {"$top": "100", "$select": "displayName,scoredEmailAddresses,jobTitle,department,phones"}
        data = await self._get(url, params)
        if data is None:
            return []

        people: list[dict[str, Any]] = []
        for p in data.get("value", []):
            emails = p.get("scoredEmailAddresses", [])
            email = emails[0].get("address", "") if emails else ""
            phones = p.get("phones", [])
            phone = phones[0].get("number", "") if phones else ""
            people.append(
                {
                    "id": None,
                    "name": p.get("displayName", ""),
                    "role": p.get("jobTitle", ""),
                    "email": email,
                    "department": p.get("department", ""),
                    "phone": phone,
                }
            )
        return people

    async def semantic_search(
        self, query: str, limit: int = 5
    ) -> list[dict[str, Any]]:
        """
        Graph API does not natively support semantic search over meeting transcripts.
        Falls back to searching mail/calendar subjects via Graph Search API.
        """
        url = f"{GRAPH_BASE}/search/query"
        body = {
            "requests": [
                {
                    "entityTypes": ["event", "message"],
                    "query": {"queryString": query},
                    "from": 0,
                    "size": limit,
                }
            ]
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, headers=self._headers(), json=body)
            if response.status_code in (401, 403, 429):
                logger.warning("Graph search returned %d", response.status_code)
                return []
            response.raise_for_status()
            data = response.json()

        results: list[dict[str, Any]] = []
        for hit_container in data.get("value", []):
            for hit in hit_container.get("hitsContainers", []):
                for item in hit.get("hits", []):
                    resource = item.get("resource", {})
                    results.append(
                        {
                            "content": resource.get("bodyPreview") or resource.get("subject", ""),
                            "speaker": resource.get("sender", {})
                            .get("emailAddress", {})
                            .get("name", ""),
                            "meeting_title": resource.get("subject", ""),
                            "meeting_date": resource.get("createdDateTime"),
                        }
                    )
        return results
