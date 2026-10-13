"""
JARVIS v2 — Comprehensive test suite
Tests: suggestion engine, WS protocol, agenda fallback trigger, template quality
Run: python3 -m pytest backend/tests/ -v
"""
import pytest
import json
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture()
def mock_people_cache():
    """Pre-populate the people name cache. Used only by unit tests that import supervisor."""
    import backend.app.agents.supervisor as sup
    sup._people_names_cache = {
        "Bharath Kumar", "Anupama Singh", "Klaus Weber", "Yuki Tanaka",
        "Marcus Hoffmann", "Elena Petrov", "Heinrich Braun", "Sofia Martinez",
    }
    yield
    sup._people_names_cache = set()


# ─── Suggestion engine unit tests ────────────────────────────────────────────

class TestSuggestionEngine:

    @pytest.fixture(autouse=True)
    def _cache(self, mock_people_cache):
        pass

    def test_returns_list_of_strings(self):
        from backend.app.agents.supervisor import _generate_suggestions_from_state
        result = _generate_suggestions_from_state(
            intent="calendar_query",
            query="What meetings do I have today?",
            agent_result="- 2026-10-13 08:00: Project Delta Kickoff (with Marcus Hoffmann)",
            session_context=[],
        )
        assert isinstance(result, list)
        assert all(isinstance(s, str) for s in result)

    def test_max_4_suggestions(self):
        from backend.app.agents.supervisor import _generate_suggestions_from_state
        result = _generate_suggestions_from_state(
            intent="action_items",
            query="What are my action items?",
            agent_result="- [HIGH] Review Project Delta risk matrix — assigned to Marcus Hoffmann",
            session_context=[],
        )
        assert len(result) <= 4

    def test_no_empty_entity_slots(self):
        """Suggestions must not contain unfilled entity placeholders or double-spaces."""
        from backend.app.agents.supervisor import _generate_suggestions_from_state
        for intent in ["calendar_query", "action_items", "memory_search",
                       "availability_query", "email_query", "general"]:
            result = _generate_suggestions_from_state(
                intent=intent,
                query="some query",
                agent_result="",  # no entities extractable
                session_context=[],
            )
            for s in result:
                assert "{" not in s, f"Unfilled slot in suggestion: {s!r}"
                assert "  " not in s, f"Double-space in suggestion: {s!r}"

    def test_person_entity_extracted(self):
        """When a known person name is in the query, it appears in suggestions."""
        from backend.app.agents.supervisor import _generate_suggestions_from_state
        result = _generate_suggestions_from_state(
            intent="memory_search",
            query="What did Bharath Kumar discuss in the budget review?",
            agent_result="Bharath Kumar presented Q3 EBIT at 9.1%.",
            session_context=[],
        )
        people_mentions = [s for s in result if "Bharath Kumar" in s]
        assert len(people_mentions) >= 1, f"Expected Bharath Kumar in suggestions, got: {result}"

    def test_no_suggestions_crash_on_empty_state(self):
        """generate_suggestions must not raise on empty query/agent_result."""
        from backend.app.agents.supervisor import _generate_suggestions_from_state
        result = _generate_suggestions_from_state(
            intent="general",
            query="",
            agent_result="",
            session_context=[],
        )
        assert isinstance(result, list)

    def test_action_items_intent_person_extraction(self):
        from backend.app.agents.supervisor import _generate_suggestions_from_state
        result = _generate_suggestions_from_state(
            intent="action_items",
            query="What are overdue action items?",
            agent_result=(
                "- [CRITICAL] Approve Project Delta memo — assigned to Bharath Kumar\n"
                "- [HIGH] Q4 headcount freeze — assigned to Elena Petrov"
            ),
            session_context=[],
        )
        # Should extract Bharath Kumar (longest-first match)
        assert any("Bharath Kumar" in s or "Elena Petrov" in s for s in result)

    def test_generic_fallback_when_no_entity(self):
        """When no entity is found and entity templates are rejected, fallback to generics."""
        from backend.app.agents.supervisor import _generate_suggestions_from_state
        result = _generate_suggestions_from_state(
            intent="calendar_query",
            query="Do I have any meetings?",
            agent_result="No meetings found.",
            session_context=[],
        )
        assert len(result) >= 1
        # Should include at least one generic fallback
        generic_set = {
            "What meetings do I have today?",
            "What are my overdue action items?",
            "What should I prioritize today?",
            "Summarise my week.",
        }
        assert any(s in generic_set for s in result)

    def test_session_context_entity_inheritance(self):
        """If current query has no entity but session_context does, use context entity."""
        from backend.app.agents.supervisor import _generate_suggestions_from_state
        result = _generate_suggestions_from_state(
            intent="memory_search",
            query="What did they say?",
            agent_result="Discussion about budget.",
            session_context=[{"query": "1:1 with Bharath Kumar", "intent": "calendar_query",
                               "response": "Meeting with Bharath Kumar at 9am", "person": "Bharath Kumar"}],
        )
        # Should use Bharath Kumar from context
        assert any("Bharath Kumar" in s for s in result)


# ─── _extract_entities unit tests ────────────────────────────────────────────

class TestExtractEntities:

    @pytest.fixture(autouse=True)
    def _cache(self, mock_people_cache):
        pass

    def test_extracts_known_person(self):
        from backend.app.agents.supervisor import _extract_entities
        entities = _extract_entities(
            query="Tell me about the meeting with Klaus Weber",
            agent_result="Klaus Weber presented the APAC plan.",
        )
        assert entities["person"] == "Klaus Weber"

    def test_prefers_longer_name(self):
        """Should match 'Bharath Kumar' not just 'Bharath'."""
        from backend.app.agents.supervisor import _extract_entities
        entities = _extract_entities(
            query="what did bharath kumar say",
            agent_result="Bharath Kumar: presented Q3 results.",
        )
        assert entities["person"] == "Bharath Kumar"

    def test_no_false_person_from_unknown_name(self):
        from backend.app.agents.supervisor import _extract_entities
        entities = _extract_entities(
            query="What is the weather like?",
            agent_result="No data available.",
        )
        assert entities["person"] == ""

    def test_extracts_meeting_title(self):
        from backend.app.agents.supervisor import _extract_entities
        entities = _extract_entities(
            query="What happened in the Q4 review?",
            agent_result=(
                "Relevant meeting notes:\n"
                "- 2026-09-30 14:00: Q4 Budget Review | Bharath Kumar: Q3 EBIT..."
            ),
        )
        assert "Q4 Budget Review" in entities["meeting"]


# ─── Intent heuristic tests ──────────────────────────────────────────────────

class TestIntentHeuristics:
    """Verify all heuristic keywords route to the correct intent when LLM is None."""

    @pytest.fixture(autouse=True)
    def _cache(self, mock_people_cache):
        pass

    @pytest.mark.asyncio
    async def test_calendar_keywords(self):
        from backend.app.agents.supervisor import classify_intent, JarvisState
        with patch("backend.app.agents.supervisor._make_llm", return_value=None):
            for kw in ("meeting", "calendar", "schedule", "agenda"):
                state: JarvisState = {
                    "messages": [], "query": f"Show me my {kw}",
                    "intent": "", "agent_result": "", "final_response": "",
                    "suggestions": [], "data_source": "", "subject_person": "",
                    "session_context": [],
                }
                result = await classify_intent(state)
                assert result["intent"] == "calendar_query", f"Failed for keyword: {kw}"

    @pytest.mark.asyncio
    async def test_action_items_keywords(self):
        from backend.app.agents.supervisor import classify_intent, JarvisState
        with patch("backend.app.agents.supervisor._make_llm", return_value=None):
            for kw in ("action", "task", "todo", "follow-up", "overdue"):
                state: JarvisState = {
                    "messages": [], "query": f"Show me my {kw}",
                    "intent": "", "agent_result": "", "final_response": "",
                    "suggestions": [], "data_source": "", "subject_person": "",
                    "session_context": [],
                }
                result = await classify_intent(state)
                assert result["intent"] == "action_items", f"Failed for keyword: {kw}"

    @pytest.mark.asyncio
    async def test_general_fallback(self):
        from backend.app.agents.supervisor import classify_intent, JarvisState
        with patch("backend.app.agents.supervisor._make_llm", return_value=None):
            state: JarvisState = {
                "messages": [], "query": "What is the capital of France?",
                "intent": "", "agent_result": "", "final_response": "",
                "suggestions": [], "data_source": "", "subject_person": "",
                "session_context": [],
            }
            result = await classify_intent(state)
            assert result["intent"] == "general"


# ─── compose_response data_source transparency tests ─────────────────────────

class TestComposeResponse:

    @pytest.fixture(autouse=True)
    def _cache(self, mock_people_cache):
        pass

    @pytest.mark.asyncio
    async def test_agenda_source_hint_in_prompt(self):
        """compose_response must include 'agenda document' hint when data_source='agenda_file'."""
        from backend.app.agents.supervisor import compose_response, JarvisState

        captured_system = []

        async def fake_ainvoke(messages):
            captured_system.append(messages[0].content)
            return MagicMock(content="Bharath has a board meeting on Monday.")

        mock_llm = MagicMock()
        mock_llm.ainvoke = fake_ainvoke

        with patch("backend.app.agents.supervisor._make_llm", return_value=mock_llm):
            state: JarvisState = {
                "messages": [],
                "query": "Is Bharath available next week?",
                "intent": "availability_query",
                "agent_result": "Board meeting Monday 9am.",
                "final_response": "",
                "suggestions": [],
                "data_source": "agenda_file",
                "subject_person": "Bharath Kumar",
                "session_context": [],
            }
            result = await compose_response(state)
            assert result["final_response"] == "Bharath has a board meeting on Monday."
            assert any("agenda document" in s for s in captured_system)

    @pytest.mark.asyncio
    async def test_no_hint_for_live_calendar(self):
        from backend.app.agents.supervisor import compose_response, JarvisState

        captured_system = []

        async def fake_ainvoke(messages):
            captured_system.append(messages[0].content)
            return MagicMock(content="You are free tomorrow.")

        mock_llm = MagicMock()
        mock_llm.ainvoke = fake_ainvoke

        with patch("backend.app.agents.supervisor._make_llm", return_value=mock_llm):
            state: JarvisState = {
                "messages": [], "query": "Am I free tomorrow?", "intent": "availability_query",
                "agent_result": "No conflicts.", "final_response": "",
                "suggestions": [], "data_source": "live_calendar",
                "subject_person": "", "session_context": [],
            }
            await compose_response(state)
            # live_calendar source should NOT inject any hint
            assert not any("agenda" in s.lower() for s in captured_system)


# ─── WebSocket integration (if backend is running) ───────────────────────────

WS_URL = "wss://utilsnow.com/jarvis/ws"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_ws_response_contains_suggestions():
    """Integration: verify WS response includes 'suggestions' list."""
    try:
        import websockets
    except ImportError:
        pytest.skip("websockets not installed")
    async with websockets.connect(WS_URL) as ws:
        await ws.send(json.dumps({"type": "query", "text": "What meetings do I have today?"}))
        raw = await asyncio.wait_for(ws.recv(), timeout=20)
        data = json.loads(raw)
        assert data["type"] == "response"
        assert "text" in data
        assert "suggestions" in data
        assert isinstance(data["suggestions"], list)
        assert len(data["suggestions"]) <= 4


@pytest.mark.asyncio
@pytest.mark.integration
async def test_ws_suggestions_entity_personalized():
    """Integration: Bharath query should produce suggestions mentioning 'Bharath Kumar'."""
    try:
        import websockets
    except ImportError:
        pytest.skip("websockets not installed")
    async with websockets.connect(WS_URL) as ws:
        await ws.send(json.dumps({"type": "query", "text": "Tell me about the 1:1 with Bharath"}))
        raw = await asyncio.wait_for(ws.recv(), timeout=20)
        data = json.loads(raw)
        suggestions = data.get("suggestions", [])
        assert any("Bharath Kumar" in s for s in suggestions), \
            f"Expected Bharath Kumar in suggestions, got: {suggestions}"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_ws_pong_response():
    """Integration: ping message should return pong."""
    try:
        import websockets
    except ImportError:
        pytest.skip("websockets not installed")
    async with websockets.connect(WS_URL) as ws:
        await ws.send(json.dumps({"type": "ping"}))
        raw = await asyncio.wait_for(ws.recv(), timeout=5)
        data = json.loads(raw)
        assert data["type"] == "pong"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_ws_empty_suggestions_on_nonsense():
    """Integration: a general query should still return a valid (possibly empty) suggestions list."""
    try:
        import websockets
    except ImportError:
        pytest.skip("websockets not installed")
    async with websockets.connect(WS_URL) as ws:
        await ws.send(json.dumps({"type": "query", "text": "xyzzy frobnicator 12345"}))
        raw = await asyncio.wait_for(ws.recv(), timeout=20)
        data = json.loads(raw)
        assert "suggestions" in data
        assert isinstance(data["suggestions"], list)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_ws_multi_turn_session_context():
    """Integration: second turn should inherit context from first turn."""
    try:
        import websockets
    except ImportError:
        pytest.skip("websockets not installed")
    async with websockets.connect(WS_URL) as ws:
        # Turn 1
        await ws.send(json.dumps({"type": "query", "text": "Tell me about Bharath Kumar"}))
        raw1 = await asyncio.wait_for(ws.recv(), timeout=20)
        data1 = json.loads(raw1)
        assert data1["type"] == "response"

        # Turn 2 — should reference Bharath from session context
        await ws.send(json.dumps({"type": "query", "text": "What did they commit to?"}))
        raw2 = await asyncio.wait_for(ws.recv(), timeout=20)
        data2 = json.loads(raw2)
        assert data2["type"] == "response"
        # Can't assert exact content but must not crash
        assert "text" in data2
