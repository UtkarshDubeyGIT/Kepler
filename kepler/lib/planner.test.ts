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
    // Replan keeps past blocks (ended before 10:30) and reschedules remaining ones.
    // Any NEW task blocks (not past) should start at or after 10:30.
    const futureTaskBlocks = blocks.filter(
      b => b.type === 'task' && timeToMins(b.start) >= timeToMins('10:30')
    )
    expect(futureTaskBlocks.length).toBeGreaterThan(0)
    futureTaskBlocks.forEach(b => {
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
