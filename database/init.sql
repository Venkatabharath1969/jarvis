-- JARVIS CEO Database — Reference date: 2026-10-10
-- PostgreSQL 16 + pgvector extension

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── TABLES ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS people (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    email       TEXT UNIQUE,
    department  TEXT,
    role        TEXT,
    company     TEXT DEFAULT 'Mercedes-Benz Group AG',
    phone       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meetings (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title            TEXT NOT NULL,
    meeting_date     TIMESTAMPTZ NOT NULL,
    duration_minutes INT DEFAULT 60,
    location         TEXT,
    meeting_type     TEXT,
    summary          TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_attendees (
    meeting_id  UUID REFERENCES meetings(id) ON DELETE CASCADE,
    person_id   UUID REFERENCES people(id)   ON DELETE CASCADE,
    PRIMARY KEY (meeting_id, person_id)
);

CREATE TABLE IF NOT EXISTS action_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description  TEXT NOT NULL,
    assignee_id  UUID REFERENCES people(id),
    meeting_id   UUID REFERENCES meetings(id),
    due_date     DATE,
    status       TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','overdue')),
    priority     TEXT DEFAULT 'medium'  CHECK (priority IN ('low','medium','high','critical')),
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS relationships (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id     UUID REFERENCES meetings(id) ON DELETE CASCADE,
    subject_type   TEXT,
    subject_id     TEXT,
    relation_type  TEXT CHECK (relation_type IN
                     ('attended','discussed','committed_to','disagreed_on','presented')),
    object_type    TEXT,
    object_id      TEXT,
    metadata       JSONB DEFAULT '{}',
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_chunks (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id       UUID REFERENCES meetings(id) ON DELETE CASCADE,
    chunk_index      INT NOT NULL,
    speaker          TEXT,
    content          TEXT NOT NULL,
    embedding        vector(1536),
    timestamp_offset INTERVAL,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meeting_chunks_hnsw_idx
    ON meeting_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ─── HELPER ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mk_vec(v float4)
RETURNS vector(1536) LANGUAGE sql IMMUTABLE AS
$$
    SELECT (
        '[' || (SELECT string_agg(v::text, ',' ORDER BY n)
                FROM generate_series(1, 1536) AS gs(n)) || ']'
    )::vector(1536)
$$;

-- ─── PEOPLE ────────────────────────────────────────────────────────────────

INSERT INTO people (id, name, email, department, role) VALUES
  ('b1000001-0000-0000-0000-000000000001','Bharath Kumar',
   'b.kumar@mercedes-benz.com','Finance','Chief Financial Officer'),
  ('b1000001-0000-0000-0000-000000000002','Anupama Singh',
   'a.singh@mercedes-benz.com','Engineering','Chief Technology Officer'),
  ('b1000001-0000-0000-0000-000000000003','Klaus Weber',
   'k.weber@mercedes-benz.com','Sales & Marketing','VP APAC Sales'),
  ('b1000001-0000-0000-0000-000000000004','Yuki Tanaka',
   'y.tanaka@mercedes-benz.com','Operations','VP APAC Operations'),
  ('b1000001-0000-0000-0000-000000000005','Marcus Hoffmann',
   'm.hoffmann@mercedes-benz.com','Engineering','Director Project Delta'),
  ('b1000001-0000-0000-0000-000000000006','Elena Petrov',
   'e.petrov@mercedes-benz.com','Legal','General Counsel'),
  ('b1000001-0000-0000-0000-000000000007','Heinrich Braun',
   'h.braun@mercedes-benz.com','Strategy','Chief Strategy Officer'),
  ('b1000001-0000-0000-0000-000000000008','Sofia Martinez',
   's.martinez@mercedes-benz.com','Executive Office','Head of Board Relations');

-- ─── MEETINGS ──────────────────────────────────────────────────────────────

INSERT INTO meetings (id, title, meeting_date, duration_minutes, location, meeting_type, summary) VALUES

  ('c2000001-0000-0000-0000-000000000001',
   'Project Delta Kickoff',
   '2026-09-27 10:00:00+02', 90, 'Stuttgart HQ, Room A3', 'internal',
   'Kick-off for Project Delta next-gen EV platform. €420M budget envelope confirmed over 24 months targeting Q3 2028 go-live. Risk matrix flagged single-source Korean battery vendor exposure.'),

  ('c2000001-0000-0000-0000-000000000002',
   'Q4 Budget Review',
   '2026-09-30 14:00:00+02', 120, 'Virtual — Teams', 'internal',
   'Q3 EBIT came in at 9.1% vs 9.8% guidance — 70bps miss driven by CNY FX headwinds. Agreement on 5% Q4 cost reduction mandate (€180M). Headcount freeze deferred pending legal review.'),

  ('c2000001-0000-0000-0000-000000000003',
   'APAC Strategy Session',
   '2026-10-02 09:00:00+08', 120, 'Singapore Regional Office', 'strategy',
   'APAC 5-year plan targeting 22% premium EV market share via 70% local content. Hyundai Motor JV discussed for A-segment EV (80k units/yr). Disagreement on Shanghai factory capacity timeline.'),

  ('c2000001-0000-0000-0000-000000000004',
   'Board Prep Session',
   '2026-10-07 16:00:00+02', 120, 'Stuttgart HQ, Boardroom', 'board',
   'Pre-board alignment on Q3 results, CSRD sustainability disclosures, and capital allocation. Board narrative on EV transition margin outlook reviewed and approved.'),

  ('c2000001-0000-0000-0000-000000000005',
   '1:1 with Bharath',
   '2026-10-08 09:30:00+02', 30, 'Executive Floor, Office 12', '1on1',
   'Bilateral: Q4 investment thesis — Project Delta €420M vs software platform €95M. Finance team headcount request for 8 FTEs in FP&A. Q4 liquidity confirmed healthy at €8.2B net.');

-- ─── ATTENDEES ─────────────────────────────────────────────────────────────

INSERT INTO meeting_attendees (meeting_id, person_id) VALUES
  ('c2000001-0000-0000-0000-000000000001','b1000001-0000-0000-0000-000000000005'),
  ('c2000001-0000-0000-0000-000000000001','b1000001-0000-0000-0000-000000000002'),
  ('c2000001-0000-0000-0000-000000000001','b1000001-0000-0000-0000-000000000006'),
  ('c2000001-0000-0000-0000-000000000001','b1000001-0000-0000-0000-000000000007'),
  ('c2000001-0000-0000-0000-000000000002','b1000001-0000-0000-0000-000000000001'),
  ('c2000001-0000-0000-0000-000000000002','b1000001-0000-0000-0000-000000000006'),
  ('c2000001-0000-0000-0000-000000000002','b1000001-0000-0000-0000-000000000007'),
  ('c2000001-0000-0000-0000-000000000002','b1000001-0000-0000-0000-000000000008'),
  ('c2000001-0000-0000-0000-000000000003','b1000001-0000-0000-0000-000000000003'),
  ('c2000001-0000-0000-0000-000000000003','b1000001-0000-0000-0000-000000000004'),
  ('c2000001-0000-0000-0000-000000000003','b1000001-0000-0000-0000-000000000007'),
  ('c2000001-0000-0000-0000-000000000003','b1000001-0000-0000-0000-000000000001'),
  ('c2000001-0000-0000-0000-000000000004','b1000001-0000-0000-0000-000000000008'),
  ('c2000001-0000-0000-0000-000000000004','b1000001-0000-0000-0000-000000000001'),
  ('c2000001-0000-0000-0000-000000000004','b1000001-0000-0000-0000-000000000006'),
  ('c2000001-0000-0000-0000-000000000004','b1000001-0000-0000-0000-000000000007'),
  ('c2000001-0000-0000-0000-000000000005','b1000001-0000-0000-0000-000000000001');

-- ─── ACTION ITEMS ──────────────────────────────────────────────────────────

INSERT INTO action_items (id, description, assignee_id, meeting_id, due_date, status, priority) VALUES
  ('d3000001-0000-0000-0000-000000000001',
   'Approve Project Delta €420M capital allocation memo and route to Supervisory Board',
   'b1000001-0000-0000-0000-000000000001','c2000001-0000-0000-0000-000000000001','2026-10-05','overdue','critical'),
  ('d3000001-0000-0000-0000-000000000002',
   'Sign off Q4 headcount freeze directive with legal carve-outs for critical roles',
   'b1000001-0000-0000-0000-000000000006','c2000001-0000-0000-0000-000000000002','2026-10-08','overdue','high'),
  ('d3000001-0000-0000-0000-000000000003',
   'Provide feedback on Project Delta risk matrix — flag battery-cell single-source exposure',
   'b1000001-0000-0000-0000-000000000005','c2000001-0000-0000-0000-000000000001','2026-10-03','overdue','high'),
  ('d3000001-0000-0000-0000-000000000004',
   'Review APAC market expansion proposal and Hyundai JV term sheet — go/no-go guidance',
   'b1000001-0000-0000-0000-000000000007','c2000001-0000-0000-0000-000000000003','2026-10-12','pending','high'),
  ('d3000001-0000-0000-0000-000000000005',
   'Review next-gen EV platform 800V technical roadmap — confirm 2028 feasibility',
   'b1000001-0000-0000-0000-000000000002','c2000001-0000-0000-0000-000000000001','2026-10-15','pending','high'),
  ('d3000001-0000-0000-0000-000000000006',
   'Schedule 30-min call with Klaus to resolve APAC JV governance structure',
   'b1000001-0000-0000-0000-000000000003','c2000001-0000-0000-0000-000000000003','2026-10-14','pending','medium'),
  ('d3000001-0000-0000-0000-000000000007',
   'Review CSRD 2026 Scope 3 sustainability KPIs for board reporting',
   'b1000001-0000-0000-0000-000000000006','c2000001-0000-0000-0000-000000000004','2026-10-11','pending','medium'),
  ('d3000001-0000-0000-0000-000000000008',
   'Finalise Q4 investment thesis: Project Delta €420M vs software platform €95M',
   'b1000001-0000-0000-0000-000000000001','c2000001-0000-0000-0000-000000000005','2026-10-17','pending','high'),
  ('d3000001-0000-0000-0000-000000000009',
   'Prepare board presentation slides — Q3 results executive narrative deck',
   'b1000001-0000-0000-0000-000000000008','c2000001-0000-0000-0000-000000000004','2026-10-09','completed','critical'),
  ('d3000001-0000-0000-0000-000000000010',
   'Confirm board agenda and distribute pre-read pack to Supervisory Board members',
   'b1000001-0000-0000-0000-000000000008','c2000001-0000-0000-0000-000000000004','2026-10-09','completed','critical');

-- ─── RELATIONSHIPS ─────────────────────────────────────────────────────────

INSERT INTO relationships (meeting_id, subject_type, subject_id, relation_type, object_type, object_id, metadata) VALUES
  ('c2000001-0000-0000-0000-000000000001','person','b1000001-0000-0000-0000-000000000005','presented','topic','Project Delta EV Platform Scope','{"budget":"€420M"}'),
  ('c2000001-0000-0000-0000-000000000001','person','b1000001-0000-0000-0000-000000000002','discussed','topic','800V Architecture Feasibility','{}'),
  ('c2000001-0000-0000-0000-000000000001','person','b1000001-0000-0000-0000-000000000005','committed_to','topic','Risk Matrix Submission','{"due":"2026-10-03"}'),
  ('c2000001-0000-0000-0000-000000000001','person','b1000001-0000-0000-0000-000000000006','discussed','topic','Korean Battery Vendor Contract Risks','{}'),
  ('c2000001-0000-0000-0000-000000000001','person','b1000001-0000-0000-0000-000000000002','disagreed_on','topic','2028 vs 2029 Go-Live Target','{"note":"CTO prefers Q1 2029 for quality assurance"}'),
  ('c2000001-0000-0000-0000-000000000002','person','b1000001-0000-0000-0000-000000000001','presented','topic','Q3 Actuals — 9.1% EBIT vs 9.8% Guidance','{}'),
  ('c2000001-0000-0000-0000-000000000002','person','b1000001-0000-0000-0000-000000000007','discussed','topic','Q4 5% Cost Reduction Mandate','{"impact":"€180M"}'),
  ('c2000001-0000-0000-0000-000000000002','person','b1000001-0000-0000-0000-000000000001','committed_to','topic','Q4 Reforecast by 2026-10-20','{"due":"2026-10-20"}'),
  ('c2000001-0000-0000-0000-000000000002','person','b1000001-0000-0000-0000-000000000006','disagreed_on','topic','Scope of Headcount Freeze Carve-outs','{"note":"Legal wants broader exemptions"}'),
  ('c2000001-0000-0000-0000-000000000002','person','b1000001-0000-0000-0000-000000000008','attended','topic','Board Communication on Q3 Miss','{}'),
  ('c2000001-0000-0000-0000-000000000003','person','b1000001-0000-0000-0000-000000000003','presented','topic','APAC 5-Year Plan — 22% EV Market Share','{}'),
  ('c2000001-0000-0000-0000-000000000003','person','b1000001-0000-0000-0000-000000000004','discussed','topic','Shanghai Factory Capacity Expansion','{"units":"+40k/year"}'),
  ('c2000001-0000-0000-0000-000000000003','person','b1000001-0000-0000-0000-000000000003','committed_to','topic','Hyundai JV Term Sheet Review','{"due":"2026-10-12"}'),
  ('c2000001-0000-0000-0000-000000000003','person','b1000001-0000-0000-0000-000000000004','disagreed_on','topic','Shanghai Capacity Timeline 2027 vs 2028','{"note":"Supply chain requires 2028"}'),
  ('c2000001-0000-0000-0000-000000000003','person','b1000001-0000-0000-0000-000000000001','attended','topic','APAC CapEx Implications for Q4 Budget','{}'),
  ('c2000001-0000-0000-0000-000000000004','person','b1000001-0000-0000-0000-000000000008','presented','topic','Board Pack v3 — Q3 Results Narrative','{}'),
  ('c2000001-0000-0000-0000-000000000004','person','b1000001-0000-0000-0000-000000000006','discussed','topic','CSRD 2026 Scope 3 Disclosure Obligations','{}'),
  ('c2000001-0000-0000-0000-000000000004','person','b1000001-0000-0000-0000-000000000001','committed_to','topic','Capital Allocation Framework Presentation','{"due":"2026-10-14"}'),
  ('c2000001-0000-0000-0000-000000000004','person','b1000001-0000-0000-0000-000000000007','disagreed_on','topic','ICE Sunset Pace — 2030 vs 2032','{"note":"CSO advocates preserving optionality to 2032"}'),
  ('c2000001-0000-0000-0000-000000000004','person','b1000001-0000-0000-0000-000000000008','committed_to','topic','Board Pack Distribution','{"due":"2026-10-09"}'),
  ('c2000001-0000-0000-0000-000000000005','person','b1000001-0000-0000-0000-000000000001','presented','topic','Finance Team Headcount Request — 8 FTEs','{"fte":8}'),
  ('c2000001-0000-0000-0000-000000000005','person','b1000001-0000-0000-0000-000000000001','discussed','topic','CapEx: Project Delta €420M vs Software €95M','{}'),
  ('c2000001-0000-0000-0000-000000000005','person','b1000001-0000-0000-0000-000000000001','committed_to','topic','Q4 Investment Thesis Decision by 2026-10-17','{"due":"2026-10-17"}'),
  ('c2000001-0000-0000-0000-000000000005','person','b1000001-0000-0000-0000-000000000001','disagreed_on','topic','Software Platform Priority vs Hardware CapEx','{"note":"CFO prefers deferring software to 2027"}'),
  ('c2000001-0000-0000-0000-000000000005','person','b1000001-0000-0000-0000-000000000001','attended','topic','Q4 Liquidity and Working Capital Update','{}');

-- ─── MEETING CHUNKS (20 rows, 4 per meeting) ───────────────────────────────

INSERT INTO meeting_chunks (meeting_id, chunk_index, speaker, content, embedding, timestamp_offset) VALUES

-- Project Delta Kickoff
('c2000001-0000-0000-0000-000000000001',1,'Marcus Hoffmann',
 'Project Delta targets 750km WLTP range on our new 800V architecture. The supply chain RFQ for battery cells closes November 15th. Capital ask is €420M over 24 months with a Q3 2028 go-live.',
 mk_vec(0.10),'00:02:15'),

('c2000001-0000-0000-0000-000000000001',2,'Anupama Singh',
 'From an engineering standpoint the 2028 go-live is extremely aggressive. Our simulation stack needs 18 months of validation alone. I strongly recommend Q1 2029 as the hard commitment date.',
 mk_vec(0.15),'00:18:44'),

('c2000001-0000-0000-0000-000000000001',3,'Elena Petrov',
 'Two of our three Korean cell vendors are subsidiaries of the same parent holding company — that is a concentration risk and a legal exposure. We need a diversification clause in supply contracts by Q1 2027.',
 mk_vec(0.20),'00:35:10'),

('c2000001-0000-0000-0000-000000000001',4,'Marcus Hoffmann',
 'Agreed on the risk matrix. Full register with RAG ratings and mitigation owners will be submitted by October 3rd. Battery diversification clause will be added to the RFQ.',
 mk_vec(0.25),'00:58:30'),

-- Q4 Budget Review
('c2000001-0000-0000-0000-000000000002',1,'Bharath Kumar',
 'Q3 group EBIT came in at 9.1%, 70 basis points below our 9.8% guidance. FX headwinds from CNY depreciation accounted for roughly €240M of the miss. Passenger Cars held at 11.2%.',
 mk_vec(0.30),'00:05:00'),

('c2000001-0000-0000-0000-000000000002',2,'Heinrich Braun',
 'To hit our full-year 9.5% EBIT commitment we need €180M of cost action in Q4. Strategy recommends marketing spend deferral, a global travel freeze, and an immediate hiring moratorium.',
 mk_vec(0.35),'00:22:15'),

('c2000001-0000-0000-0000-000000000002',3,'Elena Petrov',
 'A blanket hiring freeze may breach our Works Council Paragraph 12 framework agreement. We need a carve-out mechanism for safety-critical roles and legally mandated positions before publishing.',
 mk_vec(0.40),'00:44:30'),

('c2000001-0000-0000-0000-000000000002',4,'Bharath Kumar',
 'Agreed — Legal will draft the carve-out schedule by October 8th. The revised Q4 reforecast will be on the CFO dashboard by October 20th. No external communication before that.',
 mk_vec(0.45),'01:05:00'),

-- APAC Strategy Session
('c2000001-0000-0000-0000-000000000003',1,'Klaus Weber',
 'Premium EV segment in APAC grew 34% year-on-year. Our current 14% market share leaves significant headroom against BYD and Hyundai. The 5-year plan targets 22% via 70% local content in China and South Korea.',
 mk_vec(0.11),'00:08:00'),

('c2000001-0000-0000-0000-000000000003',2,'Yuki Tanaka',
 'The Shanghai capacity expansion from 180k to 220k units requires 28 months of construction. Starting January 2027 means first incremental units in May 2029 — not the 2028 the plan assumes.',
 mk_vec(0.22),'00:31:45'),

('c2000001-0000-0000-0000-000000000003',3,'Klaus Weber',
 'The Hyundai JV on an A-segment EV for Korea and Southeast Asia could add 80k units annually at breakeven within 3 years. We need a term sheet response by October 12th or they move to Stellantis.',
 mk_vec(0.33),'00:52:10'),

('c2000001-0000-0000-0000-000000000003',4,'Bharath Kumar',
 'APAC expansion is competing directly with Project Delta for our CapEx envelope. I need a prioritisation decision from the CEO before releasing funding approvals. This cannot wait until November board.',
 mk_vec(0.44),'01:18:00'),

-- Board Prep Session
('c2000001-0000-0000-0000-000000000004',1,'Sofia Martinez',
 'Board pack version three is finalised. Key messages: Q3 miss is timing not structural; EV transition remains on track; Q4 cost programme reinforces our capital discipline commitment.',
 mk_vec(0.16),'00:10:00'),

('c2000001-0000-0000-0000-000000000004',2,'Elena Petrov',
 'Under CSRD 2026 we must disclose Scope 3 with reasonable assurance. Our current methodology has a plus-minus 12% confidence interval — external auditors will challenge this at the March filing.',
 mk_vec(0.27),'00:38:20'),

('c2000001-0000-0000-0000-000000000004',3,'Heinrich Braun',
 'Accelerating ICE sunset to 2030 carries significant reputational risk in Germany and the US. I recommend the board narrative preserves strategic optionality to 2032 without committing publicly.',
 mk_vec(0.38),'00:55:00'),

('c2000001-0000-0000-0000-000000000004',4,'Bharath Kumar',
 'Capital allocation framework confirmed for November board: three scenarios — base, accelerated EV, and diversified ICE extension. Pre-read distribution by October 14th to all Supervisory Board members.',
 mk_vec(0.49),'01:20:30'),

-- 1:1 with Bharath
('c2000001-0000-0000-0000-000000000005',1,'Bharath Kumar',
 'Finance transformation headcount request: 8 FTEs in FP&A and treasury analytics. ROI case shows €15M annual efficiency gains within 18 months — payback under 24 months.',
 mk_vec(0.13),'00:03:00'),

('c2000001-0000-0000-0000-000000000005',2,'Bharath Kumar',
 'My strong view is the €95M software platform request should defer to 2027 H1. We cannot fund both Project Delta at full scope and the software platform without breaching our net-debt covenants.',
 mk_vec(0.24),'00:12:30'),

('c2000001-0000-0000-0000-000000000005',3,'Bharath Kumar',
 'Q4 liquidity is healthy: €8.2B net liquidity, €12B undrawn revolving facilities. Covenant headroom is comfortable even in the downside scenario. No refinancing risk in the next 24 months.',
 mk_vec(0.36),'00:21:00'),

('c2000001-0000-0000-0000-000000000005',4,'Bharath Kumar',
 'I need a decision on the Q4 investment thesis — Delta-first or balanced portfolio — by October 17th so I can finalise the treasury funding plan before the Moodys rating agency review in November.',
 mk_vec(0.47),'00:28:45');

-- ─── PERMISSIONS ───────────────────────────────────────────────────────────
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO jarvis;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO jarvis;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO jarvis;
