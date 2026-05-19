# Phase 3 – Onboarding Flow
> Read 00-MASTER-CONTEXT.md first. Phase 2 must be complete.

## Goal
A conversational 3-question onboarding flow that captures the user's goals, work hours, and fixed commitments. Saves structured data to `user_memory`. Routes to dashboard on completion. Must complete in under 3 minutes.

## Deliverables
- [ ] Onboarding page at `/onboarding`
- [ ] 3 questions in a step-by-step chat-style flow
- [ ] Work hours parsed into `"HH:MM"` format before saving
- [ ] Goals parsed into `Goal[]` array
- [ ] `user_memory` row created with `onboarding_complete: true`
- [ ] Redirect to `/dashboard` on completion
- [ ] Page is responsive (works on mobile)

---

## The 3 Questions

Ask exactly these, in this order:

1. **Goals**: "What are your top priorities right now? (e.g. finish a project, study for exams, prep for interviews)"
2. **Work hours**: "What are your typical working hours? (e.g. 9am to 6pm, or 10am–7pm)"
3. **Fixed commitments**: "Any fixed commitments I should always work around? (e.g. 9am standup Mon–Fri, gym at 7pm)"

---

## Work Hours Parsing Logic

You must parse free-text work hours into `{ work_start: "HH:MM", work_end: "HH:MM" }` before saving.

Create `lib/parse-work-hours.ts`:

```typescript
// Parses free-text work hours into 24-hour HH:MM strings.
// Falls back to 09:00–18:00 if parsing fails.
export function parseWorkHours(input: string): { work_start: string; work_end: string } {
  const DEFAULT = { work_start: '09:00', work_end: '18:00' }
  if (!input) return DEFAULT

  // Normalize input: lowercase, remove "to" variants
  const normalized = input.toLowerCase()
    .replace(/\s+to\s+/g, '-')
    .replace(/\s*–\s*/g, '-')
    .replace(/\s*—\s*/g, '-')

  // Match patterns like "9am-6pm", "9:30am-5:30pm", "09:00-18:00"
  const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi
  const matches = [...normalized.matchAll(timePattern)]

  if (matches.length < 2) return DEFAULT

  function toMinutes(match: RegExpMatchArray): number {
    let hours = parseInt(match[1])
    const mins = parseInt(match[2] || '0')
    const period = match[3]?.toLowerCase()

    if (period === 'pm' && hours !== 12) hours += 12
    if (period === 'am' && hours === 12) hours = 0
    // If no period, treat >= 8 as AM (reasonable for work hours)
    // and < 8 as PM (e.g. user says "9-7" meaning 9am-7pm)
    if (!period) {
      if (hours < 8) hours += 12
    }

    return hours * 60 + mins
  }

  function toHHMM(totalMins: number): string {
    const h = Math.floor(totalMins / 60).toString().padStart(2, '0')
    const m = (totalMins % 60).toString().padStart(2, '0')
    return `${h}:${m}`
  }

  const startMins = toMinutes(matches[0])
  const endMins = toMinutes(matches[1])

  // Basic sanity check
  if (startMins >= endMins || startMins < 0 || endMins > 24 * 60) return DEFAULT

  return {
    work_start: toHHMM(startMins),
    work_end: toHHMM(endMins),
  }
}
```

---

## Goals Parsing Logic

Create `lib/parse-goals.ts`:

```typescript
import type { Goal } from '@/types'

// Converts a free-text goals string into a Goal[] array.
// Splits on newlines, commas, or numbered lists.
export function parseGoals(input: string): Goal[] {
  if (!input.trim()) return []

  // Split on newlines, or comma if no newlines
  const lines = input.includes('\n')
    ? input.split('\n')
    : input.split(',')

  return lines
    .map(line => line
      .replace(/^\d+[\.\)]\s*/, '') // remove "1. " or "1) " prefixes
      .replace(/^[-•]\s*/, '')       // remove "- " or "• " prefixes
      .trim()
    )
    .filter(line => line.length > 0)
    .slice(0, 5) // cap at 5 goals
    .map(title => ({ title, priority: 'high' as const }))
}
```

---

## Onboarding Page

Create `app/onboarding/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { parseWorkHours } from '@/lib/parse-work-hours'
import { parseGoals } from '@/lib/parse-goals'

type Step = {
  key: 'goals' | 'work_hours' | 'commitments'
  question: string
  placeholder: string
  hint: string
}

const STEPS: Step[] = [
  {
    key: 'goals',
    question: "What are your top priorities right now?",
    placeholder: "e.g. Finish my capstone project, prep for campus placements, build a side project...",
    hint: "List up to 5 things. These help Kepler understand what matters most.",
  },
  {
    key: 'work_hours',
    question: "What are your typical working hours?",
    placeholder: "e.g. 9am to 6pm",
    hint: "Kepler won't schedule tasks outside these hours.",
  },
  {
    key: 'commitments',
    question: "Any fixed commitments Kepler should always work around?",
    placeholder: "e.g. 9am standup Mon–Fri, gym at 7pm, college from 9am–4pm",
    hint: "These will always be treated as non-negotiable blocks.",
  },
]

type Answers = {
  goals: string
  work_hours: string
  commitments: string
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>({
    goals: '',
    work_hours: '',
    commitments: '',
  })
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const currentStep = STEPS[step]
  const isLastStep = step === STEPS.length - 1

  async function handleNext() {
    if (!input.trim()) return

    const updated = { ...answers, [currentStep.key]: input }
    setAnswers(updated)
    setInput('')

    if (!isLastStep) {
      setStep(step + 1)
      return
    }

    // Final step — save to Supabase
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const parsedHours = parseWorkHours(updated.work_hours)
      const parsedGoals = parseGoals(updated.goals)

      // Parse commitments as routines (simple split, no duration in v1)
      const parsedRoutines = updated.commitments
        .split(/[,\n]/)
        .map(r => r.trim())
        .filter(r => r.length > 0)
        .map(title => ({ title, duration_mins: 60 })) // default duration

      await supabase.from('user_memory').upsert({
        user_id: user.id,
        goals: parsedGoals,
        constraints: parsedHours,
        routines: parsedRoutines,
        onboarding_complete: true,
        updated_at: new Date().toISOString(),
      })

      router.push('/dashboard')
    } catch (err) {
      console.error('Onboarding save error:', err)
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleNext()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-24 px-4">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Let's set you up</h1>
          <p className="text-gray-500 text-sm mt-1">
            This takes about 2 minutes. Kepler learns from your answers.
          </p>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-gray-900' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Question */}
        <div className="mb-6">
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">
            Question {step + 1} of {STEPS.length}
          </p>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">
            {currentStep.question}
          </h2>
          <p className="text-sm text-gray-500">{currentStep.hint}</p>
        </div>

        {/* Input */}
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={currentStep.placeholder}
          rows={4}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none bg-white"
          autoFocus
        />

        {/* Actions */}
        <div className="flex items-center justify-between mt-4">
          {step > 0 ? (
            <button
              onClick={() => { setStep(step - 1); setInput(answers[STEPS[step - 1].key]) }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← Back
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={handleNext}
            disabled={!input.trim() || saving}
            className="bg-gray-900 text-white text-sm font-medium px-6 py-2.5 rounded-xl disabled:opacity-40 hover:bg-gray-700 transition-colors"
          >
            {saving ? 'Saving...' : isLastStep ? 'Start planning →' : 'Next →'}
          </button>
        </div>

        {/* Keyboard hint */}
        <p className="text-xs text-gray-400 text-right mt-2">
          Press Enter to continue
        </p>
      </div>
    </div>
  )
}
```

---

## Verification

1. Sign in fresh (or clear `user_memory` row if re-testing)
2. Complete all 3 questions
3. Check Supabase → `user_memory`:
   - `goals` should be a JSON array of `{ title, priority }` objects
   - `constraints` should be `{ "work_start": "HH:MM", "work_end": "HH:MM" }`
   - `routines` should be a JSON array
   - `onboarding_complete` should be `true`
4. After saving, should redirect to `/dashboard` (404 for now is fine)

---

## Edge Cases to Handle

- User enters nothing → Next button is disabled
- User goes back → Their previous answer is restored in the textarea
- Work hours parse fails → Falls back to `09:00–18:00` silently
- Network error on save → Log error, keep user on page (don't navigate away)
