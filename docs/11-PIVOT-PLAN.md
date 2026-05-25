# Kepler Pivot: Lightweight Task Manager with Void & Aurora AI Co-Pilot

Kepler is pivoting from a rigid calendar-first planning app to a **lightweight, list-first task manager** (similar to Todoist) with a **collapsible, powerful AI Co-pilot drawer**. The AI Co-pilot helps the user organize, estimate, sequence, and refactor their schedule to fit their actual constraints without forcing them into a strict calendar grid or timer boundaries.

The design utilizes a premium, dark-mode-first aesthetic named **Void & Aurora** (inspired by the new Gemini UI).

---

## User Review Required

> [!IMPORTANT]
> **Database Migrations:** We will be replacing the existing Supabase tables (like `planning_state`, `user_memory`, `interruption_log`, `tasks`) with a clean, normalized relational structure that supports Projects, Goals, Tasks, and Task History. Since this is a new direction, this will wipe existing tables and re-create them.
>
> **Orchestrated AI Refactoring:** We are using an orchestrated hybrid approach:
> 1. TypeScript calculates available hours (Google Calendar blocks vs. work hours) and runs basic validators.
> 2. Gemini parses requests, groups task flows semantically, and proposes breakdowns/deferrals.
> 3. TypeScript ensures no tasks are lost or hallucinated before applying.

---

## Proposed Database Schema (Supabase PostgreSQL)

We will implement this schema in `supabase/schema.sql`, replacing the previous tables.

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Projects
create table projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users not null,
  name text not null,
  color text not null, -- HSL or Hex string (e.g. "#6DBFA8")
  is_inbox boolean default false,
  created_at timestamptz default now() not null
);

-- 2. Goals
create table goals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users not null,
  title text not null,
  description text,
  deadline date,
  status text check (status in ('active', 'completed', 'archived')) default 'active' not null,
  created_at timestamptz default now() not null
);

-- 3. Tasks (Flat Task Model)
create table tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users not null,
  project_id uuid references projects on delete cascade, -- null defaults to Inbox
  goal_id uuid references goals on delete set null,
  title text not null,
  description text,
  priority integer check (priority between 1 and 4) default 4 not null, -- 1=P1 (high/violet), 2=P2 (medium/teal), 3=P3 (low/gray), 4=P4 (no priority)
  due_date date, -- represents scheduled day
  status text check (status in ('pending', 'completed', 'skipped')) default 'pending' not null,
  inferred_duration_mins integer default 30, -- background AI footprint
  created_at timestamptz default now() not null,
  completed_at timestamptz
);

-- 4. Task History / Activity Log (for undo & patterns)
create table task_history (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users not null,
  task_id uuid references tasks on delete cascade,
  change_description text not null,
  snapshot_state jsonb, -- stores pre-change task details for undo
  changed_at timestamptz default now() not null
);

-- 5. User Settings
create table user_settings (
  user_id uuid primary key references auth.users not null,
  work_start time default '09:00'::time not null,
  work_end time default '18:00'::time not null,
  work_days text[] default array['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] not null,
  google_calendar_connected boolean default false not null,
  updated_at timestamptz default now() not null
);

-- 6. User Google Calendar Tokens
create table user_tokens (
  user_id uuid primary key references auth.users not null,
  access_token text not null,
  refresh_token text not null,
  updated_at timestamptz default now() not null
);

-- Enable Row Level Security (RLS)
alter table projects enable row level security;
alter table goals enable row level security;
alter table tasks enable row level security;
alter table task_history enable row level security;
alter table user_settings enable row level security;
alter table user_tokens enable row level security;

-- RLS Policies for 'projects'
create policy "Users can perform CRUD on their own projects" 
  on projects for all 
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RLS Policies for 'goals'
create policy "Users can perform CRUD on their own goals" 
  on goals for all 
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RLS Policies for 'tasks'
create policy "Users can perform CRUD on their own tasks" 
  on tasks for all 
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RLS Policies for 'task_history'
create policy "Users can perform CRUD on their own task history" 
  on task_history for all 
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RLS Policies for 'user_settings'
create policy "Users can perform CRUD on their own settings" 
  on user_settings for all 
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RLS Policies for 'user_tokens'
create policy "Users can perform CRUD on their own calendar tokens" 
  on user_tokens for all 
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

---

## Design System Tokens: Void & Aurora

 we will implement this color palette and layout theme inside `kepler/app/globals.css`.

*   **Canvas Background:** `linear-gradient(160deg, #0A0F1E 0%, #0E0E0F 60%)` (Deep navy void gradient).
*   **Base Text (Chalk):** `#F0EDE8` (Warm off-white, tactile).
*   **Surfaces:** `#1A1A1C` (Cards, Chat Bubbles, input areas).
*   **Borders:** `#2A2A2D` (0.5px thickness, sharp boundaries).
*   **Accents (Aurora colors):**
    *   Violet: `#B07BFF` (P1 Priority, high urgency, main logo accents).
    *   Teal: `#6DBFA8` (P2 Priority, secondary elements).
    *   Blue: `#94D4F5` (P3 Priority, calendar blocks in plan view).
    *   Gray: `#444444` (P4 Priority / low priority).
*   **System Messages / Warning Borders:** `#2A3A50` with text `#7BAFD4`.
*   **Typography:**
    *   `Syne (600)`: Logo, hero headings.
    *   `DM Sans (300/400)`: All text, tasks, lists, settings, labels.
*   **Animations:** Radial aurora glow background shimmer, limited strictly to the calendar/capacity elements in the co-pilot view. No panel gradients or neon card borders.

---

## Proposed Changes

### Component Layout (Three-Panel Dashboard)

We will modify `kepler/app/dashboard/page.tsx` and structure components in `kepler/components`.

```
+-------------------------------------------------------------------------+
| [Header: Logo (Syne), Theme Toggle, Profile]                             |
+-------------------+--------------------------------+--------------------+
|                   | Collapsible Calendar           |                    |
| Left Sidebar      | [ Calendar Commitments (3) ]   | Right AI Drawer    |
|                   +--------------------------------|                    |
| - Inbox           | Overdue (Collapsible)          | [Capacity Indicator]|
| - Today           | [ ] Task 1 (p1 - violet)       | [=== 65% Loaded ===]|
| - Upcoming        | [ ] Task 2 (p2 - teal)         |                    |
|                   +--------------------------------| [AI Chat Interface] |
| **Goals**         | Today's Tasks                  | "Since you're      |
| - Finish Thesis   | [ ] Task 3 (p4 - gray)         | running late, want |
| - Launch App      | [ ] Task 4 (p3 - blue)         | to defer Task 2?"  |
|                   |                                |                    |
| **Projects**      | + Quick Add Task (Input)       | [Refactor Suggestions] |
| - Work            |                                | [x] Move Task 2    |
| - Personal        |                                | [ ] Split Task 3   |
|                   |                                | [ Apply Refactor ] |
+-------------------+--------------------------------+--------------------+
```

### Components and Logic

#### [MODIFY] [globals.css](file:///Users/dubeysmac/Developer/Kepler/kepler/app/globals.css)
Update tailwind directives and add custom CSS classes for the **Void & Aurora** colors, fonts, background gradients, and the 0.5px borders.

#### [NEW] [types/index.ts](file:///Users/dubeysmac/Developer/Kepler/kepler/types/index.ts)
Update TypeScript declarations to mirror the new database tables (Goals, Projects, Tasks, ReplanHistory, Settings).

#### [NEW] [lib/planner.ts](file:///Users/dubeysmac/Developer/Kepler/kepler/lib/planner.ts)
Implement deterministic capacity check:
*   Calculate total free hours in the day: `Work Hours` minus sum of `Calendar Commitments` durations.
*   Sum of today's tasks' `inferred_duration_mins`.
*   Determine if capacity is exceeded. Highlight tasks contributing to overload.

#### [MODIFY] [lib/llm.ts](file:///Users/dubeysmac/Developer/Kepler/kepler/lib/llm.ts)
Refactor prompts to support:
*   **Quick Add Intent Parsing:** Extracts title, project name (e.g. `#work`), goal link, due date (e.g. `tomorrow`), and explicit duration if written (e.g. `(2h)`).
*   **Orchestrated Refactoring Prompt:** Takes task list, available time, weekly goals, and calendar commitments. Suggests grouping, semantic sequence, task breakdowns, or deferrals, formatted as clean plan adjustment steps.
*   **Flat Task Splitting Generator:** Breaks down a large task title into a list of 3-5 distinct, flat tasks that share the same project and goal.

#### [NEW] [api/plan/refactor/route.ts](file:///Users/dubeysmac/Developer/Kepler/kepler/app/api/plan/refactor/route.ts)
POST endpoint that orchestrates the refactoring logic:
1. Fetch tasks due today, goals, calendar events, settings.
2. Calculate time capacity with `lib/planner.ts`.
3. If overloaded (or requested by user), call `lib/llm.ts` to get a structured proposed refactor suggestion.
4. Return suggestions to the UI (where they're displayed in the AI Drawer's checklist).

#### [NEW] [api/tasks/route.ts](file:///Users/dubeysmac/Developer/Kepler/kepler/app/api/tasks/route.ts)
Unified CRUD route handling task operations and logging changes to `task_history` for undo support.
*   *Task Splitting:* When a user accepts a task breakdown, this route deletes/archives the original parent task and inserts the new flat subtasks in its place.

#### [NEW] [api/chat/route.ts](file:///Users/dubeysmac/Developer/Kepler/kepler/app/api/chat/route.ts)
Endpoint handling chat questions, natural language commands ("Move my afternoon", "I'm behind"), calling intent parsing, and generating a text reply alongside potential refactoring actions.

#### [NEW] [components/dashboard/Sidebar.tsx](file:///Users/dubeysmac/Developer/Kepler/kepler/components/dashboard/Sidebar.tsx)
Left navigation menu displaying Inbox, Today, Upcoming, Goals list with progress bar meters, and Projects list.

#### [NEW] [components/dashboard/TaskList.tsx](file:///Users/dubeysmac/Developer/Kepler/kepler/components/dashboard/TaskList.tsx)
Center panel featuring:
*   **Calendar Commitments:** Collapsible list section showing read-only calendar items for the day.
*   **Overdue Section:** Collapsible list of past due tasks with a quick "AI Auto-Refactor" action.
*   **Today's Tasks:** Rendered as list rows with priority colors (dots) and interactive checkboxes.
*   **Quick Add:** Input bar allowing natural language capture (Todoist style).

#### [NEW] [components/dashboard/AIDrawer.tsx](file:///Users/dubeysmac/Developer/Kepler/kepler/components/dashboard/AIDrawer.tsx)
Right drawer showing:
*   **Capacity Bar:** Visual progress indicator comparing planned hours vs. available work hours. Turns red and shows "Optimize with AI" when overloaded.
*   **AI Chat:** Log of chat messages with prompt input.
*   **Refactor Panel:** Interactive checklist of AI-suggested changes (deferrals, flat splitting, grouping) with "Apply" button.

#### [NEW] [components/dashboard/MorningPrepModal.tsx](file:///Users/dubeysmac/Developer/Kepler/kepler/components/dashboard/MorningPrepModal.tsx)
On first load of the day, pops up a sleek modal showing:
*   Leftover tasks from yesterday.
*   Today's meetings.
*   AI's proposed selection of tasks for "Today" that fit the capacity.
*   Allows the user to adjust and confirm their day plan in one click.

---

## Verification Plan

### Automated Tests
- Write test specs in `kepler/lib/planner.test.ts` validating:
  - Correct capacity time estimation.
  - Rollover logic formatting.
  - Intent parser schema mapping.

### Manual Verification
- **Onboarding/First Run:** Sign in, verify "Welcome to Kepler" project tasks are pre-populated.
- **Calendar Integration:** Connect Google Calendar, verify meetings show in "Calendar Commitments" and affect the "Capacity Bar" correctly.
- **AI Refactor Flow:** Add tasks totaling 10 hours. Verify the Capacity Bar alerts red. Click "Optimize", review the AI Drawer suggested refactors, toggle checkboxes (including a task splitting suggestion), and click "Apply". Verify tasks are deferred/reordered as expected, and large tasks are replaced with multiple smaller flat tasks.
- **Undo Operation:** Reschedule a task through the AI, click "Undo" on the confirmation toast, and verify the previous state is restored.
- **Goal Progress:** Link tasks to a Goal. Check off a task and verify the Goal's progress bar increases.
