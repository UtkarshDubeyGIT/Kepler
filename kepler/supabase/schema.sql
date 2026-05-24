-- ============================================================
-- Kepler v1 Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- ─── User Memory ────────────────────────────────────────────
-- Stores persistent planning context per user.
-- One row per user. Created on first onboarding save.
create table if not exists public.user_memory (
  user_id       uuid references auth.users(id) on delete cascade primary key,
  goals         jsonb not null default '[]'::jsonb,
  -- goals shape: [{ "title": "Ship MVP by March", "priority": "high" }]

  constraints   jsonb not null default '{"work_start": "09:00", "work_end": "18:00", "block_all_day_events": false}'::jsonb,
  -- constraints shape: { "work_start": "09:00", "work_end": "18:00", "block_all_day_events": false }
  -- IMPORTANT: work_start and work_end must always be "HH:MM" 24-hour strings

  routines      jsonb not null default '[]'::jsonb,
  -- routines shape: [{ "title": "Morning standup", "duration_mins": 30 }]

  onboarding_complete boolean not null default false,
  updated_at    timestamptz not null default now()
);

alter table public.user_memory enable row level security;

create policy "Users can read own memory"
  on public.user_memory for select
  using (auth.uid() = user_id);

create policy "Users can insert own memory"
  on public.user_memory for insert
  with check (auth.uid() = user_id);

create policy "Users can update own memory"
  on public.user_memory for update
  using (auth.uid() = user_id);


-- ─── Tasks ──────────────────────────────────────────────────
-- The atomic unit of planning.
-- deadline = null means the task lives in the backlog.
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  title         text not null check (char_length(title) > 0),
  priority      text not null default 'medium'
                  check (priority in ('high', 'medium', 'low')),
  deadline      timestamptz,               -- null = backlog task
  status        text not null default 'pending'
                  check (status in ('pending', 'done', 'skipped')),
  estimated_duration_mins integer,         -- null in v1; planner uses 45 min default
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index idx_tasks_user_status on public.tasks(user_id, status);
create index idx_tasks_user_deadline on public.tasks(user_id, deadline);

alter table public.tasks enable row level security;

create policy "Users can read own tasks"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "Users can insert own tasks"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "Users can update own tasks"
  on public.tasks for update
  using (auth.uid() = user_id);

create policy "Users can delete own tasks"
  on public.tasks for delete
  using (auth.uid() = user_id);


-- ─── Planning State ──────────────────────────────────────────
-- One plan per user per day.
-- blocks: array of time-boxed items (tasks + calendar events).
-- previous_blocks: snapshot before last replan, used for undo.
create table if not exists public.planning_state (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade not null,
  plan_date           date not null,
  blocks              jsonb not null default '[]'::jsonb,
  previous_blocks     jsonb,              -- null until first replan
  version             integer not null default 1,
  last_replan_reason  text,
  created_at          timestamptz not null default now(),

  unique(user_id, plan_date)
);

create index idx_planning_state_user_date on public.planning_state(user_id, plan_date);

alter table public.planning_state enable row level security;

create policy "Users can read own plans"
  on public.planning_state for select
  using (auth.uid() = user_id);

create policy "Users can insert own plans"
  on public.planning_state for insert
  with check (auth.uid() = user_id);

create policy "Users can update own plans"
  on public.planning_state for update
  using (auth.uid() = user_id);


-- ─── Interruption Log ────────────────────────────────────────
-- Every disruption the user has reported.
-- raw_input: exactly what the user typed.
create table if not exists public.interruption_log (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade not null,
  raw_input           text not null,
  parsed_drift_mins   integer,
  affected_task_id    uuid references public.tasks(id) on delete set null,
  replan_triggered    boolean not null default false,
  confidence          text not null default 'high'
                        check (confidence in ('high', 'low')),
  created_at          timestamptz not null default now()
);

create index idx_interruption_log_user on public.interruption_log(user_id, created_at desc);

alter table public.interruption_log enable row level security;

create policy "Users can read own interruption logs"
  on public.interruption_log for select
  using (auth.uid() = user_id);

create policy "Users can insert own interruption logs"
  on public.interruption_log for insert
  with check (auth.uid() = user_id);


-- ─── User Tokens ────────────────────────────────────────────
-- Google Calendar OAuth tokens stored server-side.
-- One row per user (upserted on every login).
create table if not exists public.user_tokens (
  user_id       uuid references auth.users(id) on delete cascade primary key,
  provider      text not null,
  access_token  text,
  refresh_token text,
  updated_at    timestamptz not null default now()
);

alter table public.user_tokens enable row level security;

create policy "Users can read own tokens"
  on public.user_tokens for select
  using (auth.uid() = user_id);

create policy "Users can insert own tokens"
  on public.user_tokens for insert
  with check (auth.uid() = user_id);

create policy "Users can update own tokens"
  on public.user_tokens for update
  using (auth.uid() = user_id);
