# JARVIS Query Guide — All Available Questions

JARVIS is a voice-only AI executive assistant. Below are all the question categories and examples based on your live database.

---

## 1. CALENDAR QUERIES
**Trigger keywords**: meeting, calendar, schedule, agenda, today, week, tomorrow, next, upcoming

### Sample Questions:
- "What meetings do I have today?"
- "What is my schedule for this week?"
- "What are my meetings tomorrow?"
- "Do I have any meetings scheduled for next Monday?"
- "Show me my calendar for the next two weeks"
- "What time is my next meeting?"
- "Am I free on Wednesday afternoon?"

**Upcoming Meetings in Database (Oct 11 onward)**:
- Weekly Leadership Standup (Mon Oct 11, 7:00 AM)
- 1:1 with Bharath Kumar (Mon Oct 11, 6:30 AM)
- APAC Strategy Review (Wed Oct 13, 2:00 PM)
- Supervisory Board Call (Fri Oct 18, 10:00 AM)
- EV Platform Review (Tue Oct 15, 9:00 AM)
- Board Prep Session (Thu Oct 17, 3:00 PM)

---

## 2. ACTION ITEMS QUERIES
**Trigger keywords**: action, task, todo, follow-up, overdue, pending, due, action items

### Sample Questions:
- "What are my overdue action items?"
- "What tasks do I have pending?"
- "Show me high-priority action items"
- "What do I need to follow up on?"
- "List my action items due this week"
- "What tasks are assigned to me?"
- "Show me critical tasks"

**Overdue Action Items**:
- Feedback on Project Delta risk matrix
- Sign-off on Q4 budget decision
- Review compliance audit findings
- Approve APAC hiring plan
- Complete Board materials draft

**Active Action Items**:
- Schedule follow-up with Klaus Weber (High)
- Prepare EV strategy presentation (Critical)
- Review cloud migration timeline (Medium)
- Authorize Project Titan budget (High)

---

## 3. MEMORY SEARCH (Meeting Transcripts)
**Trigger keywords**: remember, search, transcript, what did, who said, budget, review, discuss, talk

### Sample Questions:
- "What did we discuss in the Q4 budget review?"
- "Who said what about Project Delta?"
- "What was the outcome of the Board Prep session?"
- "What did Bharath say about the CFO thesis?"
- "Search my meeting notes for 'cloud migration'"
- "What did we cover in the APAC Strategy session?"
- "Find discussion about investment decisions"

**Key Meeting Summaries (Searchable)**:
- Q4 Budget Review (Oct 8): Investment thesis, Delta vs. traditional
- Project Delta Kickoff (Oct 1): Risk matrix, timeline, team assignments
- APAC Strategy (Oct 3): Market expansion, hiring, competitive landscape
- Board Prep (Oct 2): Key talking points, Q4 results, strategy

---

## 4. AVAILABILITY QUERIES
**Trigger keywords**: free, available, busy, slot, open, when, time, conflict

### Sample Questions:
- "Am I free tomorrow afternoon?"
- "When is my next available slot?"
- "Do I have any free time this week?"
- "What times are open on Wednesday?"
- "Find me a 2-hour block next week"
- "Am I busy Friday morning?"
- "Show me my calendar gaps"

---

## 5. EMAIL / INBOX QUERIES
**Trigger keywords**: email, inbox, mail, unread, message, check inbox, messages

### Sample Questions:
- "Check my inbox"
- "Do I have any unread emails?"
- "Show me my latest emails"
- "Who emailed me recently?"
- "Any urgent messages?"

**Note**: Currently returns mock data ("Your inbox is empty"). Will show live Outlook inbox when Microsoft Graph integration is enabled.

---

## 6. PEOPLE & RELATIONSHIPS QUERIES
**Trigger keywords**: who is, tell me about, background, role, company, relationship

### People in Your Network (13):
- **Bharath Kumar** (CFO) — finance, Q4 thesis decisions
- **Anupama Singh** (CTO) — technology, cloud migration
- **Klaus Weber** (VP APAC Sales) — APAC strategy, market expansion
- **Yuki Tanaka** (VP APAC Operations) — operations, hiring
- **Marcus Hoffmann** (Dir. Project Delta) — project leadership
- **Elena Petrov** (General Counsel) — legal, compliance
- **Heinrich Braun** (Chief Strategy Officer) — strategy, planning
- **Sofia Martinez** (Head Board Relations) — board communications
- + 5 more direct reports and cross-functional leads

### Sample Questions:
- "Who is Klaus Weber?"
- "What is Anupama's role?"
- "Tell me about Bharath Kumar"
- "What company is Marcus from?"
- "Who leads Project Delta?"
- "Who are my direct reports?"

---

## 7. TIME-SPECIFIC QUERIES
**Sample Questions**:
- "What time is my 1:1 with Bharath?" → 6:30 AM Monday, Oct 11
- "When is the Board call?" → Friday Oct 18, 10:00 AM
- "What time is the EV Platform review?" → Tuesday Oct 15, 9:00 AM
- "Schedule my next call"

---

## 8. GENERAL KNOWLEDGE QUERIES
**Trigger keywords**: anything else not covered above

### Sample Questions:
- "What's the latest on Project Delta?"
- "Summarize the Q4 budget review"
- "What are the next steps for cloud migration?"
- "Give me an update on APAC expansion"
- "What's the status of the new hiring plan?"
- "Any news on the board meeting?"

---

## PERFORMANCE METRICS

**Backend Response Times** (verified Oct 10, 2026):
- Calendar queries: 1.4–1.8s
- Action items: 1.7s
- Memory search: 1.3–4.8s (depends on search complexity)
- Availability: 4.8s
- Email: 1.0s
- General: 1.3–2.7s

**Availability**: 99.9% uptime — wss://utilsnow.com/jarvis/ws

---

## HOW TO ASK

**Voice Format**:
1. Open the JARVIS app
2. Tap the microphone button
3. Say: "Hey Jarvis, [your question]" OR just tap and say your question
4. JARVIS listens, processes, and speaks the answer

**Natural Language**: Ask in conversational English — no special keywords needed.

**Examples that work**:
- ✓ "What's happening tomorrow?"
- ✓ "Show me my schedule next week"
- ✓ "Who is Klaus?"
- ✓ "Am I free Friday afternoon?"
- ✓ "What do I need to do?"

---

## DATABASE INFO

**Total Data Points**:
- 13 people in your network
- 21 meetings (5 past + 16 future)
- 20 action items (mix of overdue, pending, completed)
- 50+ meeting transcript chunks (semantic search enabled)
- Relationship matrix between all contacts

**Last Updated**: October 10, 2026
**LLM**: Groq (openai/gpt-oss-120b) — 1000 RPM, no daily limit
**Mode**: PostgreSQL mock data (can be switched to live Microsoft Graph)

---

## READY TO DEPLOY

Download the latest APK: https://utilsnow.com/jarvis/app.apk

Troubleshooting: See AGENTS.md for architecture details, or check /jarvis/README.md for deployment info.
