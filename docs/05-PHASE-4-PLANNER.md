# Phase 4 – Planning Engine
> Read 00-MASTER-CONTEXT.md first. Phase 3 must be complete.

## Goal
A pure, deterministic scheduling engine. No async. No LLM. No database calls. Given tasks + calendar blocks + constraints → produces a time-blocked plan. This is the core of Kepler.

## Deliverables
- [ ] `lib/planner.ts` — the complete planning engine
- [ ] `lib/planner.test.ts` — unit tests covering all cases below
- [ ] All tests pass with `npm test`

---

## Critical Rules for This File

1. **No async functions** — the planner is pure synchronous logic
2. **No imports from outside `types/index.ts`** — no Supabase, no LLM, no Next.js
3. **Same input always produces same output** — deterministic
4. **Default task duration is 45 minutes** if `estimated_duration_mins` is null
5. **Calendar blocks are always `flexible: false`**
6. **High-priority tasks are `flexible: false`**
7. **Medium and low priority tasks are `flexible: true`**
8. **Tasks are sorted**: high priority first, then by deadline proximity (soonest first), then medium, then low, then no-deadline tasks (backlog) last

---

## The Complete Planner

Create `lib/planner.ts`:

```typescript
import type { Task, CalendarBlock, PlanBlock } from '@/types'

const DEFAULT_TASK_DURATION_MINS = 45

// ─── Main Entry Point ──────────────────────────────────────────────────────

/**
 * Generates a time-blocked daily plan.
 *
 * @param tasks - Pending tasks to schedule (only 'pending' status)
 * @param calendarBlocks - Fixed Google Calendar events for today
 * @param workStart - Work start time as "HH:MM" (e.g. "09:00")
 * @param workEnd - Work end time as "HH:MM" (e.g. "18:00")
 * @param today - Today's date as "YYYY-MM-DD" (used for deadline comparison)
 * @returns Array of PlanBlock sorted by start time
 */
export function generatePlan(
  tasks: Task[],
  calendarBlocks: CalendarBlock[],
  workStart: string,
  workEnd: string,
  today: string
): PlanBlock[] {
  // Step 1: Validate work hours
  if (timeToMins(workStart) >= timeToMins(workEnd)) {
    workStart = '09:00'
    workEnd = '18:00'
  }

  // Step 2: Build calendar blocks (these are hard constraints, not flexible)
  const calendarPlanBlocks: PlanBlock[] = calendarBlocks
    .filter(b => timeToMins(b.end) > timeToMins(b.start)) // skip malformed
    .map(b => ({
      task_id: null,
      title: b.title,
      start: b.start,
      end: b.end,
      flexible: false,
      type: 'calendar' as const,
      reason: 'Fixed calendar event',
    }))

  // Step 3: Compute free time slots
  const freeSlots = computeFreeSlots(workStart, workEnd, calendarBlocks)

  // Step 4: Sort tasks by priority and deadline
  const sortedTasks = sortTasks(tasks, today)

  // Step 5: Schedule tasks into free slots
  const taskPlanBlocks: PlanBlock[] = []
  let slotIndex = 0
  let slotOffset = 0 // minutes used in current slot

  for (const task of sortedTasks) {
    const duration = task.estimated_duration_mins ?? DEFAULT_TASK_DURATION_MINS

    // Find a slot that fits this task
    while (slotIndex < freeSlots.length) {
      const slot = freeSlots[slotIndex]
      const slotDuration = timeToMins(slot.end) - timeToMins(slot.start)
      const remaining = slotDuration - slotOffset

      if (remaining >= duration) {
        // Task fits in this slot
        const start = addMins(slot.start, slotOffset)
        const end = addMins(start, duration)

        taskPlanBlocks.push({
          task_id: task.id,
          title: task.title,
          start,
          end,
          flexible: task.priority !== 'high',
          type: 'task',
          reason: buildReason(task, today),
        })

        slotOffset += duration
        break
      } else {
        // Task doesn't fit — move to next slot
        slotIndex++
        slotOffset = 0
      }
    }
    // If no slot found, task is not scheduled today (backlog overflow)
  }

  // Step 6: Combine and sort all blocks by start time
  return [...calendarPlanBlocks, ...taskPlanBlocks].sort(
    (a, b) => timeToMins(a.start) - timeToMins(b.start)
  )
}

// ─── Replanning ────────────────────────────────────────────────────────────

/**
 * Replans the remainder of the day after an interruption.
 * Preserves calendar blocks and already-done tasks.
 * Reschedules remaining flexible tasks from the current time forward.
 *
 * @param currentBlocks - The current plan blocks
 * @param tasks - All pending tasks
 * @param calendarBlocks - Today's calendar events
 * @param workEnd - Work end time as "HH:MM"
 * @param currentTime - Current time as "HH:MM"
 * @param driftMins - Minutes lost to the interruption
 * @param today - Today's date as "YYYY-MM-DD"
 * @returns New plan blocks from currentTime onward
 */
export function replan(
  currentBlocks: PlanBlock[],
  tasks: Task[],
  calendarBlocks: CalendarBlock[],
  workEnd: string,
  currentTime: string,
  driftMins: number,
  today: string
): { blocks: PlanBlock[]; reason: string } {
  // Advance the current time by the drift
  const newCurrentTime = addMins(currentTime, driftMins)

  // Keep blocks that have already ended (completed work)
  const pastBlocks = currentBlocks.filter(
    b => timeToMins(b.end) <= timeToMins(newCurrentTime)
  )

  // Extract calendar events from the current plan to prevent losing them
  const existingCalendarBlocks: CalendarBlock[] = currentBlocks
    .filter(b => b.type === 'calendar')
    .map(b => ({ title: b.title, start: b.start, end: b.end }))

  // Combine passed calendarBlocks and existing ones from currentBlocks
  // Keep unique ones based on title, start, and end
  const combinedCalendarBlocksMap = new Map<string, CalendarBlock>()
  existingCalendarBlocks.forEach(b => combinedCalendarBlocksMap.set(`${b.start}-${b.end}-${b.title}`, b))
  calendarBlocks.forEach(b => combinedCalendarBlocksMap.set(`${b.start}-${b.end}-${b.title}`, b))
  const combinedCalendarBlocks = Array.from(combinedCalendarBlocksMap.values())

  // Re-derive calendar blocks for the free slot computation
  const allCalendarBlocks: CalendarBlock[] = combinedCalendarBlocks.filter(
    b => timeToMins(b.end) > timeToMins(newCurrentTime)
  )

  // Get pending tasks (exclude already-done ones)
  const pendingTasks = tasks.filter(t => t.status === 'pending')

  // Replan from newCurrentTime to workEnd
  const rescheduled = generatePlan(
    pendingTasks,
    allCalendarBlocks,
    newCurrentTime,
    workEnd,
    today
  )

  const reason = `Replanned because you lost ${driftMins} minute${driftMins === 1 ? '' : 's'}. Flexible tasks have been rescheduled into remaining free time.`

  return {
    blocks: [...pastBlocks, ...rescheduled],
    reason,
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Computes free time slots between work hours, excluding calendar blocks.
 */
export function computeFreeSlots(
  workStart: string,
  workEnd: string,
  calendarBlocks: CalendarBlock[]
): Array<{ start: string; end: string }> {
  // Sort calendar blocks by start time
  const sorted = [...calendarBlocks]
    .filter(b => timeToMins(b.end) > timeToMins(b.start))
    .sort((a, b) => timeToMins(a.start) - timeToMins(b.start))

  const slots: Array<{ start: string; end: string }> = []
  let cursor = workStart

  for (const block of sorted) {
    // Only consider blocks within work hours
    const blockStart = clampTime(block.start, workStart, workEnd)
    const blockEnd = clampTime(block.end, workStart, workEnd)

    if (timeToMins(blockStart) > timeToMins(cursor)) {
      slots.push({ start: cursor, end: blockStart })
    }

    if (timeToMins(blockEnd) > timeToMins(cursor)) {
      cursor = blockEnd
    }
  }

  // Remaining time after all calendar blocks
  if (timeToMins(cursor) < timeToMins(workEnd)) {
    slots.push({ start: cursor, end: workEnd })
  }

  // Filter out slots shorter than DEFAULT_TASK_DURATION_MINS (not useful)
  return slots.filter(s => timeToMins(s.end) - timeToMins(s.start) >= 15)
}

/**
 * Sorts tasks for scheduling priority.
 * Order: high priority (by deadline) → medium (by deadline) → low → no deadline
 */
export function sortTasks(tasks: Task[], today: string): Task[] {
  const todayMs = new Date(today).getTime()

  return [...tasks].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 } as const

    // First: compare priority
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (pDiff !== 0) return pDiff

    // Second: tasks with deadlines before tasks without
    if (a.deadline && !b.deadline) return -1
    if (!a.deadline && b.deadline) return 1

    // Third: among tasks with deadlines, sort by proximity
    if (a.deadline && b.deadline) {
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    }

    // Finally: no-deadline tasks sorted by creation date (FIFO)
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

// ─── Time Utilities (exported for testing) ────────────────────────────────

/** Converts "HH:MM" to minutes since midnight */
export function timeToMins(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Converts minutes since midnight to "HH:MM" */
export function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, '0')
  const m = (mins % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

/** Adds minutes to a "HH:MM" time string */
export function addMins(time: string, mins: number): string {
  return minsToTime(timeToMins(time) + mins)
}

/** Clamps a time string to within [min, max] */
function clampTime(time: string, min: string, max: string): string {
  const t = timeToMins(time)
  return minsToTime(Math.max(timeToMins(min), Math.min(timeToMins(max), t)))
}

/** Builds a human-readable reason for why a task was scheduled here */
function buildReason(task: Task, today: string): string {
  if (task.priority === 'high') return 'High priority — scheduled first'
  if (task.deadline) {
    const daysLeft = Math.ceil(
      (new Date(task.deadline).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysLeft <= 1) return 'Due today — deadline approaching'
    if (daysLeft <= 3) return `Due in ${daysLeft} days`
  }
  return 'Scheduled from your task list'
}
```

---

## Unit Tests

Create `lib/planner.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  generatePlan,
  replan,
  computeFreeSlots,
  sortTasks,
  timeToMins,
  minsToTime,
  addMins,
} from './planner'
import type { Task, CalendarBlock } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    user_id: 'user-1',
    title: 'Test task',
    priority: 'medium',
    deadline: null,
    status: 'pending',
    estimated_duration_mins: null,
    created_at: '2026-01-01T09:00:00Z',
    completed_at: null,
    ...overrides,
  }
}

const TODAY = '2026-05-19'

// ─── Time Utilities ───────────────────────────────────────────────────────

describe('timeToMins', () => {
  it('converts HH:MM to minutes', () => {
    expect(timeToMins('00:00')).toBe(0)
    expect(timeToMins('09:00')).toBe(540)
    expect(timeToMins('09:30')).toBe(570)
    expect(timeToMins('18:00')).toBe(1080)
  })
})

describe('minsToTime', () => {
  it('converts minutes to HH:MM', () => {
    expect(minsToTime(0)).toBe('00:00')
    expect(minsToTime(540)).toBe('09:00')
    expect(minsToTime(570)).toBe('09:30')
  })
})

describe('addMins', () => {
  it('adds minutes to a time string', () => {
    expect(addMins('09:00', 45)).toBe('09:45')
    expect(addMins('09:30', 30)).toBe('10:00')
    expect(addMins('17:30', 45)).toBe('18:15')
  })
})

// ─── Free Slots ───────────────────────────────────────────────────────────

describe('computeFreeSlots', () => {
  it('returns full work day when no calendar blocks', () => {
    const slots = computeFreeSlots('09:00', '18:00', [])
    expect(slots).toHaveLength(1)
    expect(slots[0]).toEqual({ start: '09:00', end: '18:00' })
  })

  it('splits work day around a calendar block', () => {
    const blocks: CalendarBlock[] = [{ title: 'Standup', start: '10:00', end: '10:30' }]
    const slots = computeFreeSlots('09:00', '18:00', blocks)
    expect(slots).toHaveLength(2)
    expect(slots[0]).toEqual({ start: '09:00', end: '10:00' })
    expect(slots[1]).toEqual({ start: '10:30', end: '18:00' })
  })

  it('handles multiple calendar blocks', () => {
    const blocks: CalendarBlock[] = [
      { title: 'Standup', start: '10:00', end: '10:30' },
      { title: 'Lunch', start: '13:00', end: '14:00' },
    ]
    const slots = computeFreeSlots('09:00', '18:00', blocks)
    expect(slots).toHaveLength(3)
    expect(slots[0]).toEqual({ start: '09:00', end: '10:00' })
    expect(slots[1]).toEqual({ start: '10:30', end: '13:00' })
    expect(slots[2]).toEqual({ start: '14:00', end: '18:00' })
  })

  it('ignores calendar blocks outside work hours', () => {
    const blocks: CalendarBlock[] = [{ title: 'Early meeting', start: '07:00', end: '08:00' }]
    const slots = computeFreeSlots('09:00', '18:00', blocks)
    expect(slots).toHaveLength(1)
    expect(slots[0]).toEqual({ start: '09:00', end: '18:00' })
  })
})

// ─── Task Sorting ─────────────────────────────────────────────────────────

describe('sortTasks', () => {
  it('sorts high priority before medium before low', () => {
    const tasks = [
      makeTask({ id: '1', priority: 'low' }),
      makeTask({ id: '2', priority: 'high' }),
      makeTask({ id: '3', priority: 'medium' }),
    ]
    const sorted = sortTasks(tasks, TODAY)
    expect(sorted.map(t => t.priority)).toEqual(['high', 'medium', 'low'])
  })

  it('sorts tasks with deadlines before no-deadline tasks of same priority', () => {
    const tasks = [
      makeTask({ id: '1', priority: 'medium', deadline: null }),
      makeTask({ id: '2', priority: 'medium', deadline: '2026-05-20T23:59:00Z' }),
    ]
    const sorted = sortTasks(tasks, TODAY)
    expect(sorted[0].id).toBe('2')
  })

  it('sorts closer deadlines first', () => {
    const tasks = [
      makeTask({ id: '1', priority: 'medium', deadline: '2026-05-25T23:59:00Z' }),
      makeTask({ id: '2', priority: 'medium', deadline: '2026-05-21T23:59:00Z' }),
    ]
    const sorted = sortTasks(tasks, TODAY)
    expect(sorted[0].id).toBe('2')
  })

  it('uses FIFO for same priority no-deadline tasks', () => {
    const tasks = [
      makeTask({ id: '1', priority: 'low', deadline: null, created_at: '2026-01-02T09:00:00Z' }),
      makeTask({ id: '2', priority: 'low', deadline: null, created_at: '2026-01-01T09:00:00Z' }),
    ]
    const sorted = sortTasks(tasks, TODAY)
    expect(sorted[0].id).toBe('2')
  })
})

// ─── Plan Generation ──────────────────────────────────────────────────────

describe('generatePlan', () => {
  it('schedules a single task in the morning', () => {
    const tasks = [makeTask({ id: '1', title: 'Write tests' })]
    const plan = generatePlan(tasks, [], '09:00', '18:00', TODAY)

    expect(plan).toHaveLength(1)
    expect(plan[0].start).toBe('09:00')
    expect(plan[0].end).toBe('09:45') // 45 min default
    expect(plan[0].type).toBe('task')
  })

  it('uses estimated_duration_mins when provided', () => {
    const tasks = [makeTask({ estimated_duration_mins: 90 })]
    const plan = generatePlan(tasks, [], '09:00', '18:00', TODAY)
    expect(plan[0].end).toBe('10:30')
  })

  it('includes calendar blocks in the output', () => {
    const tasks = [makeTask()]
    const blocks: CalendarBlock[] = [{ title: 'Standup', start: '09:00', end: '09:30' }]
    const plan = generatePlan(tasks, blocks, '09:00', '18:00', TODAY)

    const calBlock = plan.find(b => b.type === 'calendar')
    const taskBlock = plan.find(b => b.type === 'task')

    expect(calBlock).toBeDefined()
    expect(calBlock!.title).toBe('Standup')
    expect(calBlock!.flexible).toBe(false)

    expect(taskBlock).toBeDefined()
    expect(taskBlock!.start).toBe('09:30') // scheduled after calendar block
  })

  it('marks high priority tasks as not flexible', () => {
    const tasks = [makeTask({ priority: 'high' })]
    const plan = generatePlan(tasks, [], '09:00', '18:00', TODAY)
    expect(plan[0].flexible).toBe(false)
  })

  it('marks medium/low priority tasks as flexible', () => {
    const tasks = [
      makeTask({ id: '1', priority: 'medium' }),
      makeTask({ id: '2', priority: 'low' }),
    ]
    const plan = generatePlan(tasks, [], '09:00', '18:00', TODAY)
    expect(plan[0].flexible).toBe(true)
    expect(plan[1].flexible).toBe(true)
  })

  it('returns empty plan when no tasks and no calendar blocks', () => {
    const plan = generatePlan([], [], '09:00', '18:00', TODAY)
    expect(plan).toHaveLength(0)
  })

  it('does not schedule tasks outside work hours', () => {
    // Fill the entire work day with a calendar block
    const blocks: CalendarBlock[] = [{ title: 'All day meeting', start: '09:00', end: '18:00' }]
    const tasks = [makeTask()]
    const plan = generatePlan(tasks, blocks, '09:00', '18:00', TODAY)

    const taskBlocks = plan.filter(b => b.type === 'task')
    expect(taskBlocks).toHaveLength(0) // no room to schedule
  })

  it('schedules multiple tasks consecutively', () => {
    const tasks = [
      makeTask({ id: '1', title: 'Task A', priority: 'high' }),
      makeTask({ id: '2', title: 'Task B', priority: 'medium' }),
    ]
    const plan = generatePlan(tasks, [], '09:00', '18:00', TODAY)
    const taskBlocks = plan.filter(b => b.type === 'task')

    expect(taskBlocks).toHaveLength(2)
    expect(taskBlocks[0].end).toBe(taskBlocks[1].start) // back to back
  })

  it('falls back to 09:00–18:00 for invalid work hours', () => {
    const tasks = [makeTask()]
    // workStart >= workEnd — invalid
    const plan = generatePlan(tasks, [], '18:00', '09:00', TODAY)
    expect(plan[0].start).toBe('09:00')
  })
})

// ─── Replanning ───────────────────────────────────────────────────────────

describe('replan', () => {
  it('reschedules remaining tasks after drift', () => {
    const tasks = [
      makeTask({ id: '1', title: 'Task A', status: 'pending' }),
      makeTask({ id: '2', title: 'Task B', status: 'pending' }),
    ]
    const currentBlocks = generatePlan(tasks, [], '09:00', '18:00', TODAY)

    const { blocks, reason } = replan(
      currentBlocks,
      tasks,
      [],
      '18:00',
      '10:00',
      30, // 30 min drift
      TODAY
    )

    expect(reason).toContain('30 minutes')
    const taskBlocks = blocks.filter(b => b.type === 'task')
    // Tasks should start at or after 10:30 (current time + drift)
    taskBlocks.forEach(b => {
      expect(timeToMins(b.start)).toBeGreaterThanOrEqual(timeToMins('10:30'))
    })
  })

  it('preserves calendar events in replan', () => {
    const tasks = [makeTask()]
    const calBlocks: CalendarBlock[] = [{ title: 'Meeting', start: '14:00', end: '15:00' }]
    const currentBlocks = generatePlan(tasks, calBlocks, '09:00', '18:00', TODAY)

    const { blocks } = replan(currentBlocks, tasks, calBlocks, '18:00', '10:00', 30, TODAY)
    const meetingBlock = blocks.find(b => b.title === 'Meeting')
    expect(meetingBlock).toBeDefined()
    expect(meetingBlock!.flexible).toBe(false)
  })

  it('preserves calendar events in replan even when empty calendar array is passed', () => {
    const tasks = [makeTask()]
    const calBlocks: CalendarBlock[] = [{ title: 'Meeting', start: '14:00', end: '15:00' }]
    const currentBlocks = generatePlan(tasks, calBlocks, '09:00', '18:00', TODAY)

    const { blocks } = replan(currentBlocks, tasks, [], '18:00', '10:00', 30, TODAY)
    const meetingBlock = blocks.find(b => b.title === 'Meeting')
    expect(meetingBlock).toBeDefined()
    expect(meetingBlock!.flexible).toBe(false)
    expect(meetingBlock!.start).toBe('14:00')
    expect(meetingBlock!.end).toBe('15:00')
  })
})
```

---

## Test Setup

Install vitest:
```bash
npm install -D vitest @vitest/ui
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:ui": "vitest --ui"
```

Add `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
```

Run:
```bash
npm test
```

**All tests must pass before moving to Phase 5.**
