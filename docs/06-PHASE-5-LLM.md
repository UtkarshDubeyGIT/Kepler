# Phase 5 – LLM Intent Parser
> Read 00-MASTER-CONTEXT.md first. Phase 4 must be complete (all planner tests passing).

## Goal
A single LLM service that reads a user's chat message and returns structured JSON describing what the user wants. The LLM is a **parser only** — it never makes planning decisions.

## Deliverables
- [ ] `lib/llm.ts` — the complete LLM service
- [ ] Returns valid `ParsedIntent` type from `types/index.ts`
- [ ] Handles all 4 intent types: `interruption`, `add_task`, `update_memory`, `chat`
- [ ] Has a graceful fallback when JSON parsing fails
- [ ] Uses stable Gemini Flash (1.5/2.0) via direct REST (no SDK)

---

## Model Choice

Use stable **Gemini 1.5 Flash** (`gemini-1.5-flash`) or **Gemini 2.0 Flash** (`gemini-2.0-flash`).

- Free tier: 15 RPM, 1M tokens/day — sufficient for MVP testing
- Get API key at: https://aistudio.google.com
- Add to `.env.local`: `GEMINI_API_KEY=your_key_here`

Do NOT use any Gemini SDK. Use `fetch` directly.

---

## The Complete LLM Service

Create `lib/llm.ts`:

```typescript
import type { ParsedIntent, PlanBlock, UserMemory } from '@/types'

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent'

// ─── Main Parser ──────────────────────────────────────────────────────────

/**
 * Parses a user's natural language message into a structured intent.
 * This is the ONLY function that calls the LLM.
 *
 * @param message - The raw user message
 * @param currentPlan - Today's current plan blocks (for context)
 * @param memory - The user's persistent memory (goals, constraints)
 * @returns ParsedIntent — a discriminated union based on intent type
 */
export async function parseUserMessage(
  message: string,
  currentPlan: PlanBlock[],
  memory: Pick<UserMemory, 'goals' | 'constraints'>
): Promise<ParsedIntent> {
  const prompt = buildPrompt(message, currentPlan, memory)

  let rawText: string
  try {
    rawText = await callGemini(prompt)
  } catch (err) {
    console.error('Gemini API call failed:', err)
    return fallbackIntent('I had trouble understanding that. Could you rephrase?')
  }

  return parseGeminiResponse(rawText)
}

// ─── Prompt Builder ───────────────────────────────────────────────────────

function buildPrompt(
  message: string,
  currentPlan: PlanBlock[],
  memory: Pick<UserMemory, 'goals' | 'constraints'>
): string {
  const planSummary = currentPlan.length > 0
    ? currentPlan
        .filter(b => b.type === 'task')
        .map(b => `- ${b.start}–${b.end}: ${b.title}`)
        .join('\n')
    : 'No plan yet for today.'

  const goalsList = memory.goals.length > 0
    ? memory.goals.map(g => `- ${g.title} (${g.priority} priority)`).join('\n')
    : 'No goals set yet.'

  return `You are Kepler's intent parser. Your ONLY job is to classify what the user said and extract structured data from it. You do NOT generate plans. You do NOT give advice. You only classify and extract.

## User's Context

Current goals:
${goalsList}

Today's plan:
${planSummary}

## User's Message

"${message}"

## Your Task

Classify this message as one of these types:
- "interruption": user is reporting that something went wrong, ran over, or took longer than expected
- "add_task": user wants to add a new task to their list
- "update_memory": user is telling you something that should change their stored goals, constraints, or routines
- "chat": anything else — a question, general comment, or unclear intent

## Output Format

Return ONLY a JSON object. No markdown. No explanation. No backticks. Just the raw JSON.

For "interruption":
{
  "type": "interruption",
  "drift_mins": <integer — estimated minutes lost>,
  "affected_task": <string or null — name of the task that was affected>,
  "confidence": <"high" if you're confident in drift_mins, "low" if you're guessing>,
  "response": <string — a short, friendly acknowledgment to show the user>
}

For "add_task":
{
  "type": "add_task",
  "new_task": {
    "title": <string — the task name>,
    "priority": <"high" | "medium" | "low">,
    "deadline": <ISO timestamp string or null>
  },
  "confidence": "high",
  "response": <string — confirm what you added>
}

For "update_memory":
{
  "type": "update_memory",
  "memory_update": {
    "goals": <array or null — only include if goals changed>,
    "constraints": <object or null — only include if work hours changed>
  },
  "confidence": "high",
  "response": <string — confirm what you updated>
}

For "chat":
{
  "type": "chat",
  "confidence": "high",
  "response": <string — a helpful, brief response. Stay focused on planning. Do not answer questions unrelated to planning.>
}

## Rules

1. If the user mentions time lost (e.g. "ran 45 min over", "spent extra hour", "slipped 30 minutes"), it is an "interruption".
2. If drift time is mentioned but unclear (e.g. "took forever", "ran quite long"), estimate conservatively and set confidence to "low".
3. If the user says something like "add task", "remind me to", "I need to", it is "add_task".
4. If the user says "my work hours changed", "I have a new goal", "forget my old constraint", it is "update_memory".
5. Do not invent task titles. Extract them from the user's words.
6. If deadline is mentioned as a relative date (e.g. "tomorrow", "by Friday"), convert to ISO format based on today being ${new Date().toISOString().split('T')[0]}.
7. Keep "response" under 2 sentences. Be direct and friendly.
8. NEVER suggest the user use other apps or tools.
9. NEVER refuse to classify — always return one of the 4 types.`
}

// ─── Gemini REST Call ─────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,      // Low temperature = consistent, structured output
        maxOutputTokens: 500,  // Intent parsing doesn't need long responses
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${error}`)
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) throw new Error('Empty response from Gemini')
  return text
}

// ─── Response Parser ──────────────────────────────────────────────────────

function parseGeminiResponse(rawText: string): ParsedIntent {
  // Clean up any markdown fences the model might add despite instructions
  const cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim()

  try {
    const parsed = JSON.parse(cleaned)
    return validateIntent(parsed)
  } catch {
    console.warn('Failed to parse Gemini response as JSON:', rawText)
    return fallbackIntent("I couldn't quite parse that. Could you try again?")
  }
}

function validateIntent(parsed: any): ParsedIntent {
  const type = parsed?.type

  if (type === 'interruption') {
    return {
      type: 'interruption',
      drift_mins: typeof parsed.drift_mins === 'number' ? parsed.drift_mins : 0,
      affected_task: parsed.affected_task ?? null,
      confidence: parsed.confidence === 'low' ? 'low' : 'high',
      response: parsed.response ?? 'Got it, noted.',
    }
  }

  if (type === 'add_task' && parsed.new_task?.title) {
    return {
      type: 'add_task',
      new_task: {
        title: parsed.new_task.title,
        priority: ['high', 'medium', 'low'].includes(parsed.new_task.priority)
          ? parsed.new_task.priority
          : 'medium',
        deadline: parsed.new_task.deadline ?? null,
      },
      confidence: 'high',
      response: parsed.response ?? `Added "${parsed.new_task.title}".`,
    }
  }

  if (type === 'update_memory') {
    return {
      type: 'update_memory',
      memory_update: parsed.memory_update ?? {},
      confidence: parsed.confidence === 'low' ? 'low' : 'high',
      response: parsed.response ?? "Got it, I've updated your preferences.",
    }
  }

  // Default: chat or anything unrecognized
  return {
    type: 'chat',
    confidence: 'high',
    response: parsed.response ?? "I'm not sure how to help with that. Try telling me about your tasks or what changed in your day.",
  }
}

function fallbackIntent(message: string): ParsedIntent {
  return {
    type: 'chat',
    confidence: 'low',
    response: message,
  }
}
```

---

## Testing the LLM Parser Manually

Create a temporary test script `scripts/test-llm.ts`:

```typescript
import { parseUserMessage } from '../lib/llm'

const testCases = [
  "My standup ran 45 minutes over",
  "Add a task: review PR before 5pm, high priority",
  "I need to study for my OS exam tomorrow",
  "My work hours changed to 10am to 7pm",
  "What should I focus on today?",
  "I slipped like an hour talking to a friend",  // low confidence case
]

async function run() {
  for (const msg of testCases) {
    console.log('\n─────────────────')
    console.log('Input:', msg)
    const result = await parseUserMessage(msg, [], {
      goals: [{ title: 'Ship Kepler MVP', priority: 'high' }],
      constraints: { work_start: '09:00', work_end: '18:00' },
    })
    console.log('Output:', JSON.stringify(result, null, 2))
  }
}

run()
```

Run:
```bash
npx ts-node scripts/test-llm.ts
```

---

## Expected Output for Each Test Case

| Input | Expected type | Notes |
|---|---|---|
| "My standup ran 45 minutes over" | `interruption` | drift_mins: 45, confidence: high |
| "Add a task: review PR before 5pm" | `add_task` | title extracted, deadline set |
| "Study for OS exam tomorrow" | `add_task` | deadline = tomorrow |
| "Work hours changed to 10am–7pm" | `update_memory` | constraints updated |
| "What should I focus on today?" | `chat` | friendly response |
| "I slipped like an hour" | `interruption` | drift_mins: ~60, confidence: low |

---

## Do NOT do in this phase
- Do not add streaming
- Do not add conversation history to the LLM call (the prompt already includes current plan context)
- Do not use any Gemini or Google AI SDK packages
- Do not call `parseUserMessage` from any client component — only from API routes (server-side)
