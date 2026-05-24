import type { ParsedIntent, PlanBlock, UserMemory } from '@/types'

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent'

// ─── Main Parser ──────────────────────────────────────────────────────────

/**
 * Parses a user's natural language message into a structured intent.
 * This is the ONLY function that calls the LLM.
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
    console.error('Gemini API call failed:', err instanceof Error ? err.message : err)
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
- "reschedule_task": user wants to move, postpone, reschedule, or change the date/time of an existing task (e.g. "shift DSA to day after tomorrow", "move my meeting to Friday", "postpone X", "can we do Y later")
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

For "reschedule_task":
{
  "type": "reschedule_task",
  "task_title": <string — the name of the task to reschedule, extracted from the user's words>,
  "new_deadline": <ISO timestamp string — the new date/time the user wants. Convert relative dates like "tomorrow", "day after tomorrow", "next Monday" to ISO format>,
  "confidence": <"high" | "low">,
  "response": <string — confirm what you rescheduled>
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
3. If the user says something like "add task", "remind me to", "I need to", "I want to", "I'll do X", "I'm going to", or expresses a plan/commitment to do something, it is "add_task". Phrases like "I'll do DSA daily" or "I want to read every morning" are add_task.
4. If the user wants to move, postpone, shift, or reschedule a task to a different day or time, it is "reschedule_task". Look for keywords: "shift", "move", "postpone", "reschedule", "push", "can we do X on Y", "can't do X tomorrow".
5. If the user says "my work hours changed", "I have a new goal", "forget my old constraint", it is "update_memory".
6. Do not invent task titles. Extract them from the user's words.
7. If deadline is mentioned as a relative date (e.g. "tomorrow", "day after tomorrow", "by Friday"), convert to ISO format based on today being ${new Date().toISOString().split('T')[0]}.
8. Keep "response" under 2 sentences. Be direct and friendly.
9. NEVER suggest the user use other apps or tools.
10. NEVER refuse to classify — always return one of the 5 types.
11. When in doubt between "chat" and "add_task", prefer "add_task" — it's better to add a task the user can delete than to miss their intent.`
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
        temperature: 0.1,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`Gemini API raw error response: ${error}`)
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

function validateIntent(parsed: Record<string, unknown>): ParsedIntent {
  const type = parsed?.type

  if (type === 'interruption') {
    return {
      type: 'interruption',
      drift_mins: typeof parsed.drift_mins === 'number' ? parsed.drift_mins : 0,
      affected_task: (parsed.affected_task as string) ?? null,
      confidence: parsed.confidence === 'low' ? 'low' : 'high',
      response: (parsed.response as string) ?? 'Got it, noted.',
    }
  }

  if (type === 'add_task' && (parsed.new_task as Record<string, unknown>)?.title) {
    const newTask = parsed.new_task as Record<string, unknown>
    return {
      type: 'add_task',
      new_task: {
        title: newTask.title as string,
        priority: ['high', 'medium', 'low'].includes(newTask.priority as string)
          ? (newTask.priority as 'high' | 'medium' | 'low')
          : 'medium',
        deadline: (newTask.deadline as string) ?? null,
      },
      confidence: 'high',
      response: (parsed.response as string) ?? `Added "${newTask.title}".`,
    }
  }

  if (type === 'reschedule_task') {
    return {
      type: 'reschedule_task',
      task_title: (parsed.task_title as string) ?? '',
      new_deadline: (parsed.new_deadline as string) ?? null,
      confidence: parsed.confidence === 'low' ? 'low' : 'high',
      response: (parsed.response as string) ?? 'Got it, rescheduling that for you.',
    }
  }

  if (type === 'update_memory') {
    return {
      type: 'update_memory',
      memory_update: (parsed.memory_update as Partial<import('@/types').UserMemory>) ?? {},
      confidence: parsed.confidence === 'low' ? 'low' : 'high',
      response: (parsed.response as string) ?? "Got it, I've updated your preferences.",
    }
  }

  // Default: chat or anything unrecognized
  return {
    type: 'chat',
    confidence: 'high',
    response: (parsed.response as string) ?? "I'm not sure how to help with that. Try telling me about your tasks or what changed in your day.",
  }
}

function fallbackIntent(message: string): ParsedIntent {
  return {
    type: 'chat',
    confidence: 'low',
    response: message,
  }
}
