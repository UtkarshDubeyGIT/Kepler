# Kepler – Master Context Document
> Give this file to every agent before any other doc.

---

## What is Kepler?

Kepler is a **responsive web app for persistent AI-assisted daily planning**. It remembers a user's goals, constraints, routines, tasks, and calendar commitments, then uses that context to generate and adapt a daily plan.

**The core belief being tested:** Persistent context + adaptive replanning is useful enough that users trust it during a real day.

**One-line summary:** Kepler is a persistent AI assistant that remembers what you're trying to achieve and keeps your plan aligned when life changes.

---

## The Problem Kepler Solves

Modern planning tools are stateless. Calendars show fixed commitments, task apps list work, and LLMs require users to restate the full situation whenever reality changes. When a meeting runs over, a task takes longer than expected, or priorities shift, the user has to manually rebuild the plan.

**Planning is stateful. Current tools are not.**

---

## Target User (MVP)

Primary persona: a developer or CS student managing self-directed work (side projects, assignments, job prep) alongside fixed commitments.

Broader: developers, solo founders, product managers, graduate students, knowledge workers with flexible, interruption-heavy schedules.

---

## Guiding Principles (Never Violate These)

1. **Trust over intelligence** — Predictable beats brilliant-but-confusing
2. **Onboarding over algorithms** — Cold start is product risk #1
3. **Adaptation over control** — Help the user, don't override them
4. **Clarity over complexity** — One screen, one purpose
5. **Assistant, not overlord** — Always explainable, always undoable
6. **LLM interprets. Planner decides.** — The LLM is a parser, never the scheduling engine

---

## Tech Stack (Fixed — Do Not Change)

| Concern | Decision |
|---|---|
| Framework | Next.js 15 (LTS) with App Router |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 (stable) |
| Auth | Supabase Auth with Google OAuth |
| Database | Supabase (Postgres) |
| Calendar | Google Calendar API — read-only scope only |
| LLM | Gemini 1.5/2.0 Flash (stable, via REST, not SDK) |
| Deployment | Vercel |

**Do not substitute these.** Do not add extra dependencies unless explicitly specified in a phase doc.

---

## Repository Structure

```
kepler/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts
│   ├── onboarding/
│   │   └── page.tsx
│   ├── dashboard/
│   │   └── page.tsx
│   └── api/
│       ├── chat/
│       │   └── route.ts
│       ├── plan/
│       │   └── route.ts
│       └── tasks/
│           └── route.ts
├── components/
│   ├── chat/
│   ├── plan/
│   ├── tasks/
│   └── ui/
├── lib/
│   ├── calendar.ts
│   ├── llm.ts
│   ├── planner.ts
│   └── supabase.ts
├── types/
│   └── index.ts
└── supabase/
    └── schema.sql
```

---

## Core Data Model (All 5 Tables)

### `user_memory`
Stores persistent planning context per user.
```
user_id (PK, FK → auth.users)
goals: jsonb          -- [{ title, priority }]
constraints: jsonb    -- { work_start: "09:00", work_end: "18:00", block_all_day_events: boolean }
routines: jsonb       -- [{ title, duration_mins }]
onboarding_complete: boolean
updated_at: timestamptz
```

### `tasks`
The atomic unit of planning.
```
id (PK, uuid)
user_id (FK → auth.users)
title: text
priority: text        -- 'high' | 'medium' | 'low'
deadline: timestamptz -- null = backlog
status: text          -- 'pending' | 'done' | 'skipped'
estimated_duration_mins: integer  -- null in v1, default 45 when planning
created_at: timestamptz
completed_at: timestamptz
```

### `planning_state`
One plan per user per day.
```
id (PK, uuid)
user_id (FK → auth.users)
plan_date: date
blocks: jsonb         -- [{ task_id, title, start, end, flexible, type }]
previous_blocks: jsonb -- snapshot before last replan (used for undo)
version: integer
last_replan_reason: text
created_at: timestamptz
UNIQUE(user_id, plan_date)
```

### `interruption_log`
Every disruption the user reports.
```
id (PK, uuid)
user_id (FK → auth.users)
raw_input: text
parsed_drift_mins: integer
affected_task_id: uuid (FK → tasks, nullable)
replan_triggered: boolean
confidence: text      -- 'high' | 'low'
created_at: timestamptz
```

### `user_tokens`
Google Calendar token storage.
```
id (PK, uuid)
user_id (FK → auth.users)
provider: text
access_token: text
refresh_token: text
updated_at: timestamptz
```

**All tables must have Row Level Security (RLS) enabled. Users can only access their own rows.**

---

## Planning Architecture (Critical)

```
Database → API Route → Planning Engine → Database
                ↑
           LLM Parser (only for intent extraction)
```

- The **LLM** reads user messages and outputs structured JSON (intent, drift, task info).
- The **planning engine** (`lib/planner.ts`) is pure TypeScript. No async. No LLM calls. No DB calls. Given tasks + calendar blocks + constraints → returns a plan. Deterministic.
- The **API routes** orchestrate: load state, call LLM if needed, call planner, save result.

---

## Default Values

- Default task duration: **45 minutes**
- Backlog selection: **FIFO** (created_at ascending)
- Confidence threshold for auto-replan: **< 20 minutes drift = auto-adjust; ≥ 20 minutes = ask user first**
- Work hours if not set: **09:00 – 18:00**
- All-day calendar events blocking: **false by default (configurable)**

---

## What is OUT OF SCOPE for MVP

Do not build, mention, or stub these:
- Voice input
- Email signal detection
- Two-way Google Calendar sync
- Multi-day or weekly planning
- Notion, Jira, Linear, Todoist, Slack integrations
- Proactive nudges / push notifications
- Team-aware planning
- Native mobile apps
- General-purpose chatbot mode
- Automated memory pruning
- Drag-and-drop calendar UI
- PWA

---

## Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
```

Never commit `.env.local`. Always add to `.gitignore`.

---

## Build Phases (in order)

| Phase | What | Doc |
|---|---|---|
| 0 | Project setup | 01-PHASE-0-SETUP.md |
| 1 | Auth + calendar token | 02-PHASE-1-AUTH.md |
| 2 | Database schema | 03-PHASE-2-SCHEMA.md |
| 3 | Onboarding flow | 04-PHASE-3-ONBOARDING.md |
| 4 | Planning engine | 05-PHASE-4-PLANNER.md |
| 5 | LLM parser | 06-PHASE-5-LLM.md |
| 6 | API routes | 07-PHASE-6-API.md |
| 7 | Dashboard UI | 08-PHASE-7-UI.md |
| 8 | Calendar integration | 09-PHASE-8-CALENDAR.md |
| 9 | Deploy | 10-PHASE-9-DEPLOY.md |

**Always complete and test each phase before starting the next.**
