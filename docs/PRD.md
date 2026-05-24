# Kepler MVP PRD

Status: Draft  
Created: 2026-05-13  
Source of truth: synthesized from Kepler Notion pages

## Source Material

- [Kepler - MVP PRD v1](https://www.notion.so/31d2b4c88f4a8170a87ada55ef4522ef)
- [Kepler - Full Product Scope](https://www.notion.so/31d2b4c88f4a8111a6cfc78c12d7c022)
- [Kepler - Product Vision Document v1](https://www.notion.so/2cb2b4c88f4a8051acd0fc620892d687)
- [Potential Risks - Kepler](https://www.notion.so/2ed2b4c88f4a80959e5ec398a50121da)
- [Kepler - Implementation Guide v1](https://www.notion.so/31d2b4c88f4a81dfb522cbcb0cca6290)
- [Kepler - Git Repository Guide](https://www.notion.so/31d2b4c88f4a81f4bc75c4ef82634c40)

## Summary

Kepler is a responsive web app for persistent AI-assisted planning. It remembers a user's goals, constraints, routines, tasks, calendar commitments, and recent interruptions, then uses that context to generate and adapt a daily plan.

The MVP exists to prove one core belief: persistent context plus adaptive replanning is useful enough that users trust it during a real day. Kepler should be predictable, explainable, and easy to override before it tries to be highly autonomous.

## Problem

Modern planning tools are mostly stateless. Calendars show fixed commitments, task apps list work, and LLMs require users to restate the full situation whenever reality changes. When a meeting runs over, a task takes longer than expected, or priorities shift, the user has to manually rebuild the plan.

This makes planning cognitively expensive and easy to abandon.

Planning is stateful. Current tools are not.

## Target Users

Primary MVP persona: a developer or CS student managing self-directed work, side projects, assignments, job preparation, and fixed commitments.

Broader early audience:

- Developers
- Solo founders
- Product managers
- Graduate students
- Knowledge workers with flexible, interruption-heavy schedules

These users care about long-term goals but need practical help planning and adapting today.

## Product Goal

Build a usable MVP that demonstrates:

- Persistent planning context
- Goal-aware daily planning
- Lightweight task ownership
- Read-only calendar awareness
- Natural-language interruption handling
- Explainable, undoable replanning

The MVP is trust-building, not feature-complete. A slightly simple but predictable Kepler is better than a powerful system that users cannot understand or control.

## Guiding Principles

- Trust over intelligence
- Onboarding over algorithms
- Adaptation over control
- Clarity over complexity
- Assistant, not overlord
- Memory and intent over feature count

## MVP Scope

### In Scope

#### 1. Google Sign-In and Calendar Permission

Users sign in with Google through Supabase Auth. During sign-in, Kepler requests Google Calendar read-only access.

Requirements:

- Use Supabase Auth with Google OAuth.
- Request `https://www.googleapis.com/auth/calendar.readonly`.
- Store the calendar token server-side for the authenticated user.
- Treat Google Calendar events as hard constraints.
- Do not write to Google Calendar in v1.

#### 2. Conversational Onboarding

Kepler must solve the cold start problem quickly and without a long setup form.

Requirements:

- Ask 3-5 structured questions in a conversational flow.
- Capture top goals for the current week or month.
- Capture work hours and sleep or off-hour constraints.
- Capture fixed recurring commitments.
- Let users connect Google Calendar during or before onboarding.
- Complete setup in under 3 minutes.
- Save onboarding answers into structured user memory.

#### 3. Persistent User Memory

Kepler maintains structured planning context per user.

Minimum memory categories:

- Goals
- Priorities
- Constraints
- Routines
- Recent events and interruptions
- Onboarding completion state

V1 does not need automated memory pruning, but memory structure should not block future cleanup or refresh flows.

#### 4. Lightweight Task Management

Kepler needs enough task ownership to plan the user's day. It is not a full project management tool.

Requirements:

- Add tasks manually or through chat.
- Remove or archive tasks.
- Mark tasks done.
- Track task status: pending, done, skipped.
- Assign priority: high, medium, low.
- Assign optional hard deadlines.
- Maintain a backlog for tasks without deadlines.
- Let Kepler suggest priority based on goals and deadline proximity, but require user confirmation when the suggestion is non-obvious.

V1 may use a default task duration when no estimate exists. Explicit duration estimation and actual-vs-estimate learning are v2 concerns.

#### 5. Daily Plan Generation

Kepler generates a plan for today from user memory, pending tasks, calendar blocks, and work-hour constraints.

Requirements:

- Plan horizon is today only.
- Calendar events are non-negotiable busy blocks.
- High-priority and deadline-sensitive tasks are scheduled first.
- Tasks without deadlines can be pulled from backlog when free time exists.
- Plans should be deterministic from structured inputs.
- The LLM must not be the planning engine.

#### 6. Conversational Planning Interface

Users interact with Kepler primarily through text chat.

Requirements:

- Users can describe tasks, goals, constraints, and interruptions in plain language.
- Kepler asks minimal clarifying questions when input is ambiguous.
- Kepler can add a task, update memory, or handle an interruption from chat.
- Kepler should avoid general-purpose chatbot behavior outside the planning domain.

Voice is out of scope for v1.

#### 7. Natural Interruption Handling

This is the core differentiator.

Example user input:

> My meeting ran 45 minutes over, and I did not finish the PR review.

Requirements:

- Parse disruption reports from plain language.
- Extract likely drift duration, affected task, and confidence.
- Log the raw interruption and parsed data.
- Update planning state when appropriate.
- Preserve fixed calendar commitments.
- Protect high-priority tasks where possible.
- Reschedule flexible remaining tasks into valid free slots.
- Show what changed and why.
- Let the user reject the replan.

Confidence policy:

- Small drift under 20 minutes can auto-adjust when interpretation is clear.
- Large drift or low-confidence interpretation should ask the user before replanning.

#### 8. Explainable Replanning and Undo

Every automatic plan change must be understandable.

Requirements:

- Show a plain-English reason for each replan.
- Show the changed plan, not just a generic confirmation.
- Keep a plan version so the previous plan can be restored.
- Provide one-action undo or reject for a proposed replan.

Example explanation:

> I moved "Study for quiz" to 4:00-5:00 PM because your standup ran 30 minutes over.

#### 9. Responsive Web App

V1 is a responsive web app, not a native app.

Requirements:

- Desktop-first planning surface.
- Fully usable on mobile browsers.
- Desktop layout should support split-panel usage: chat plus plan/task context.
- Mobile layout should use a single-column or tabbed view.

PWA support is deferred unless v1 usage data justifies it.

#### 10. Dark/Light Mode Toggle

A dark/light mode toggle is a necessity for user comfort (especially CS students/developers planning late at night or early morning) and is included in the MVP.

Requirements:

- Provide a theme toggle button easily accessible in the dashboard header.
- Sync with system light/dark settings by default, allowing manual override.
- Apply consistent styling transitions using Tailwind CSS dark: variants.

## Out of Scope for MVP

- Voice input
- Email signal detection
- Two-way Google Calendar sync
- Multi-day or weekly planning
- Notion, Jira, Linear, Todoist, or Slack integrations
- Proactive nudges and notifications
- Team-aware planning
- Native mobile apps
- Full project management functionality
- General-purpose chatbot mode
- Automated memory pruning
- Detailed task duration tracking
- Drag-and-drop calendar layout

## User Flows

### First-Time Onboarding

1. User lands on Kepler.
2. User signs in with Google and grants read-only calendar access.
3. Kepler says setup takes about 2 minutes.
4. Kepler asks for top priorities for the current week or month.
5. Kepler asks for typical work hours and important rest constraints.
6. Kepler asks for fixed commitments it should always respect.
7. Kepler stores structured memory.
8. Kepler generates the first daily plan.

### Daily Planning

1. User opens Kepler in the morning.
2. Kepler loads today's calendar commitments, pending tasks, and memory.
3. Kepler shows today's generated plan.
4. User can accept, adjust, or add tasks conversationally.
5. Kepler saves the current daily planning state.

### Add Task

1. User types a task in chat or adds it manually.
2. Kepler extracts title, optional deadline, and optional priority.
3. If priority is missing, Kepler can suggest one.
4. User confirms ambiguous details.
5. Task is saved and considered during the next plan generation.

### Interruption Handling

1. User reports a disruption in chat.
2. Kepler parses the disruption into structured data.
3. Kepler decides whether to auto-replan or ask for confirmation.
4. Kepler produces a revised plan.
5. Kepler explains changed blocks and the reason.
6. User accepts or rejects the change.

### Undo Replan

1. User rejects an automatic or proposed replan.
2. Kepler restores the previous plan version.
3. Kepler logs the rejection for future product evaluation.

## Functional Requirements

### Authentication

- Users can sign in with Google.
- Auth state persists across sessions.
- Unauthenticated users cannot access the dashboard or user data.
- Calendar read-only permission is requested during Google OAuth.

### Calendar

- Kepler can fetch today's primary Google Calendar events.
- Calendar events are converted into normalized busy blocks.
- Calendar blocks cannot be moved by Kepler.
- All-day events need explicit handling so they do not accidentally block the whole day unless appropriate.

### Memory

- Kepler can create and update a user's memory object.
- Memory updates can come from onboarding or chat.
- Memory is stored in structured form, not only as transcript text.

### Tasks

- Users can create, update, complete, skip, and remove tasks.
- Tasks include title, priority, optional deadline, status, and optional estimated duration.
- Tasks belong to exactly one user.
- Pending tasks feed plan generation.

### Planning Engine

- Planning logic is deterministic and testable.
- It schedules around calendar blocks and work-hour constraints.
- It sorts work by priority and deadline proximity.
- It produces time-blocked plan items.
- It should preserve enough metadata to explain why items moved.

### LLM Parser

- The LLM interprets natural language into constrained structured outputs.
- The LLM can classify messages as interruption, add_task, update_memory, or chat.
- The LLM returns confidence.
- Invalid or low-confidence output must fall back to clarification, not silent mutation.

### Dashboard

- Users can see chat, today's plan, and task list.
- Users can see plan changes and explanations.
- Users can undo or reject a replan.
- UI should clearly distinguish calendar commitments from Kepler-planned work.

## Non-Functional Requirements

### Trust and Control

- Kepler must explain plan changes.
- Kepler must avoid surprising users with large silent changes.
- User override must be fast and visible.

### Privacy

- User planning data, calendar tokens, and memory are sensitive.
- Secrets must not be committed to the repository.
- Calendar access must be read-only in v1.
- Row-level security must ensure users can only access their own data.

### Performance

- Small deterministic replans should feel fast.
- Avoid LLM calls for simple, fully structured operations.
- Use LLM only for ambiguous natural-language interpretation or narration.

### Reliability

- Planning logic should be covered by unit tests.
- LLM parsing should be resilient to malformed model output.
- Failed calendar fetches should degrade gracefully and tell the user.

## Proposed Technical Approach

### Stack

- Next.js 15 (LTS) App Router
- TypeScript
- Tailwind CSS v4 (stable)
- Supabase Auth
- Supabase Postgres
- Google OAuth
- Google Calendar API read-only
- Gemini 1.5/2.0 Flash (stable) for intent parsing and plan narration (via REST)
- Vercel for deployment

### Repository Structure

The planned application structure is:

```text
app/
  (auth)/login/page.tsx
  auth/callback/route.ts
  onboarding/page.tsx
  dashboard/page.tsx
  api/chat/route.ts
  api/plan/route.ts
  api/tasks/route.ts
components/
  chat/
  plan/
  tasks/
  ui/
lib/
  calendar.ts
  llm.ts
  planner.ts
  supabase.ts
types/
  index.ts
supabase/
  schema.sql
```

### Core Data Model

Minimum v1 tables:

- `user_memory`: goals, constraints, routines, onboarding state.
- `tasks`: task title, priority, deadline, status, duration estimate.
- `planning_state`: one plan per user per day, blocks JSON, version, last replan reason.
- `interruption_log`: raw input, parsed drift, affected task, whether replan triggered.
- `user_tokens`: provider token storage for Google Calendar.

All user-owned tables must have row-level security enabled.

### Planning Architecture

Kepler should use a layered architecture:

1. Database stores identity, memory, tasks, tokens, and plan state.
2. API routes load structured state, call the LLM parser only when needed, run deterministic planning logic, and persist outcomes.
3. React UI shows chat, tasks, plans, explanations, and undo controls.

The LLM interprets. The planner decides.

## Success Metrics

MVP targets:

- Onboarding completion rate greater than 70% of signups.
- At least 1 daily planning session per active user.
- At least 2 interruption events handled per active user per week.
- Replan acceptance rate greater than 60%.
- D7 retention greater than 30%.
- Qualitative survey: "Kepler felt useful today" greater than 3.5/5.

Additional evaluation questions:

- Does Kepler reduce manual replanning?
- Do users feel more focused on high-priority work?
- Do users trust Kepler after a disruption?
- How often do users undo replans?

## Risks and Mitigations

### Cold Start

Risk: On day 1, Kepler knows too little to be useful.

Mitigation:

- Use fast conversational onboarding.
- Import calendar context.
- Ask for only the highest-value initial memory.
- Learn gradually.

### Wrong Replans from Noisy Signals

Risk: Kepler confidently adapts based on misunderstood interruptions.

Mitigation:

- Use constrained parser output.
- Track confidence.
- Ask before large or ambiguous changes.
- Keep all replans explainable and undoable.

### Calendar Conflict

Risk: Personal replanning creates friction with social commitments.

Mitigation:

- Treat calendar events as hard constraints.
- Visually distinguish fixed commitments from Kepler-planned work.
- Avoid calendar writes in v1.

### Over-Automation

Risk: Users feel they no longer recognize or control their own schedule.

Mitigation:

- Prefer conservative changes.
- Explain every change.
- Provide one-action undo.

### Task Boundary Ambiguity

Risk: Kepler becomes either too abstract to be useful or too much like a full task manager.

Mitigation:

- Own lightweight tasks for v1.
- Keep project-management features out of scope.
- Treat tasks as the atomic unit for time planning, not as a full PM system.

### LLM Misinterpretation

Risk: Ambiguous messages mutate planning state incorrectly.

Mitigation:

- Use strict JSON schemas for model output.
- Validate parsed output.
- Ask clarifying questions when confidence is low.

### Latency

Risk: Smart behavior feels slow.

Mitigation:

- Use local deterministic heuristics for small changes.
- Avoid unnecessary LLM calls.
- Keep planner pure and fast.

### Privacy

Risk: Calendar, goals, and planning memory are sensitive.

Mitigation:

- Request only read-only calendar access in v1.
- Store secrets outside git.
- Use Supabase RLS.
- Keep a clear privacy story before broader launch.

## Milestones

### Phase 0: Project Setup

- Initialize Next.js, TypeScript, Tailwind, and App Router.
- Add environment variable template.
- Add Supabase client helper.
- Add base repository structure.

### Phase 1: Auth and Calendar Permission

- Configure Google OAuth through Supabase.
- Build login page.
- Add auth callback route.
- Store Google provider token for calendar access.

### Phase 2: Database Schema

- Create v1 Supabase schema.
- Enable RLS.
- Add schema file to the repository.

### Phase 3: Onboarding

- Build 3-5 question onboarding flow.
- Save user memory.
- Route completed users to dashboard.

### Phase 4: Planning Engine

- Implement deterministic scheduler.
- Add unit tests for priority, deadlines, busy blocks, and overflow behavior.
- Keep the planner independent of UI, database, and LLM calls.

### Phase 5: LLM Parser

- Implement constrained parser service.
- Validate JSON output.
- Add low-confidence fallback behavior.

### Phase 6: API Routes

- Add chat route.
- Add plan route.
- Add task CRUD routes.
- Wire planner, tasks, memory, calendar, and interruptions.

### Phase 7: Dashboard UI

- Build chat panel.
- Build today's plan view.
- Build task list.
- Add replan diff and undo controls.
- Ensure responsive desktop and mobile layouts.

### Phase 8: Calendar Integration

- Fetch today's Google Calendar events.
- Normalize calendar event blocks.
- Schedule tasks around calendar blocks.

### Phase 9: Deploy

- Deploy to Vercel.
- Configure production environment variables.
- Configure Google OAuth redirect URLs.

## Open Questions

These are intentionally left unresolved because the Notion source material flags them as product decisions still needing design work.

1. What is the exact minimum memory schema needed for day-1 usefulness?
2. How should the UI visually differentiate fixed calendar events from Kepler-planned work?
3. What does the exact undo or reject replan interaction look like?
4. Should the task list live as a sidebar, tab, or inline plan element?
5. How should Kepler present AI-suggested priority without feeling intrusive?
6. How should no-deadline backlog tasks be selected when extra free time exists?
7. How should all-day calendar events affect availability?
8. What privacy language is required before external users connect calendar data?

## Drill-Down Understanding Brief

Goal: create the repo's working PRD for Kepler v1 from existing Notion context.

Known context: Kepler is a persistent AI planning assistant focused on daily planning, read-only calendar awareness, lightweight tasks, memory, and explainable replanning after interruptions.

Key decisions: v1 is responsive web only; Google Calendar is read-only; Supabase handles auth and storage; the LLM parses and narrates but does not schedule; the planner is deterministic.

Constraints: keep scope narrow, prioritize trust, avoid two-way calendar writes, avoid general chatbot behavior, and defer power features until after v1 proves usefulness.

Assumptions: the Notion MVP PRD is the primary product source of truth; this repo PRD should consolidate rather than replace the Notion pages.

Recommended next step: scaffold the Next.js/Supabase project and implement the v1 milestones in order, starting with auth, schema, onboarding, and the pure planning engine.
