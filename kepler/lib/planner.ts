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

  // Filter out slots shorter than 15 minutes (not useful)
  return slots.filter(s => timeToMins(s.end) - timeToMins(s.start) >= 15)
}

/**
 * Sorts tasks for scheduling priority.
 * Order: high priority (by deadline) → medium (by deadline) → low → no deadline
 */
export function sortTasks(tasks: Task[], today: string): Task[] {
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
