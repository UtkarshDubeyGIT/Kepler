// ─── User Memory ─────────────────────────────────────────────────────────────

export type Goal = {
  title: string
  priority: 'high' | 'medium' | 'low'
}

export type Constraints = {
  work_start: string  // "09:00"
  work_end: string    // "18:00"
  block_all_day_events: boolean
}

export type Routine = {
  title: string
  duration_mins: number
}

export type UserMemory = {
  user_id: string
  goals: Goal[]
  constraints: Constraints
  routines: Routine[]
  onboarding_complete: boolean
  updated_at: string
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export type TaskPriority = 'high' | 'medium' | 'low'
export type TaskStatus = 'pending' | 'done' | 'skipped'

export type Task = {
  id: string
  user_id: string
  title: string
  priority: TaskPriority
  deadline: string | null    // ISO timestamp or null
  status: TaskStatus
  estimated_duration_mins: number | null
  created_at: string
  completed_at: string | null
}

export type CreateTaskInput = {
  title: string
  priority?: TaskPriority
  deadline?: string | null
  estimated_duration_mins?: number | null
}

// ─── Planning ─────────────────────────────────────────────────────────────────

export type PlanBlockType = 'task' | 'calendar' | 'buffer'

export type PlanBlock = {
  task_id: string | null        // null for calendar events and buffers
  title: string
  start: string                 // "09:00"
  end: string                   // "10:30"
  flexible: boolean             // false = cannot be moved by replanning
  type: PlanBlockType
  reason?: string               // why this block was placed here (for explainability)
}

export type PlanningState = {
  id: string
  user_id: string
  plan_date: string             // "YYYY-MM-DD"
  blocks: PlanBlock[]
  previous_blocks: PlanBlock[] | null   // snapshot before last replan
  version: number
  last_replan_reason: string | null
  created_at: string
}

// ─── Calendar ────────────────────────────────────────────────────────────────

export type CalendarBlock = {
  title: string
  start: string   // "09:00"
  end: string     // "10:00"
}

// ─── Interruptions ───────────────────────────────────────────────────────────

export type InterruptionLog = {
  id: string
  user_id: string
  raw_input: string
  parsed_drift_mins: number | null
  affected_task_id: string | null
  replan_triggered: boolean
  confidence: 'high' | 'low'
  created_at: string
}

// ─── LLM Parser Output ───────────────────────────────────────────────────────

export type ParsedIntent =
  | {
      type: 'interruption'
      drift_mins: number
      affected_task: string | null
      confidence: 'high' | 'low'
      response: string
    }
  | {
      type: 'add_task'
      new_task: CreateTaskInput
      confidence: 'high' | 'low'
      response: string
    }
  | {
      type: 'reschedule_task'
      task_title: string
      new_deadline: string | null   // ISO timestamp or null
      confidence: 'high' | 'low'
      response: string
    }
  | {
      type: 'update_memory'
      memory_update: Partial<UserMemory>
      confidence: 'high' | 'low'
      response: string
    }
  | {
      type: 'chat'
      confidence: 'high' | 'low'
      response: string
    }

// ─── API Response Types ───────────────────────────────────────────────────────

export type ChatResponse = {
  message: string
  plan: PlanBlock[] | null
  replanReason: string | null
  requiresConfirmation: boolean
  pendingDrift?: number
}
