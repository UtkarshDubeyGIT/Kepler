# Kepler - Product Vision Document v1

### *A persistent AI assistant for professional planning*

---

## 1. Vision Statement

**Kepler is a personal AI assistant that remembers your goals, constraints, and planning context — and continuously adapts your plan as reality changes.**

Unlike calendars or stateless LLMs, Kepler maintains long-term context and acts as a trusted assistant that evolves plans instead of recreating them from scratch.

Kepler maintains planning context by ingesting calendar events, user input, **natural interruption updates**, and **schedule-impacting signals from email**.

---

## 2. The Problem

Modern planning is broken because **tools forget**.

- Calendars are static
- To-do apps don’t adapt
- LLMs require full re-prompting every time something changes

Every disruption forces users to:

- re-explain what happened
- restate goals and priorities
- manually rebuild their plan

This makes planning repetitive, cognitively expensive, and eventually abandoned.

**Planning is stateful. Current tools are not.**

---

## 3. Target User (Initial)

**Knowledge workers and builders** who:

- juggle multiple priorities
- work in flexible, interruption-heavy schedules
- care about long-term goals but plan day-to-day

Examples:

- solo founders
- developers
- product managers
- graduate students with self-managed schedules

---

## 4. Kepler’s Core Job

> Maintain planning context over time and automatically update plans when reality changes.
> 

Kepler is not a calendar replacement or a life OS.

It is a **context-preserving planning assistant**.

---

## 5. What Kepler Remembers (Persistent Context)

Kepler maintains structured memory of:

- **Goals**
    
    Long-term objectives (e.g. “ship MVP by March”)
    
- **Priorities**
    
    What matters right now
    
- **Constraints**
    
    Work hours, sleep preferences, fixed commitments
    
- **Routines**
    
    Repeating patterns and habits
    
- **Recent Events & Interruptions**
    
    Missed tasks, delays, overruns, spontaneous changes
    

This memory allows Kepler to plan *continuously*, not repeatedly.

---

## 6. Core Capabilities (MVP)

### 6.1 Conversational Planning

- Users describe goals, tasks, and constraints via text or voice
- Kepler asks minimal clarifying questions when required

---

### 6.2 Context-Aware Dynamic Rescheduling

- Automatically rebuilds the daily plan when:
    - tasks slip
    - meetings overrun
    - priorities change
    - new fixed events appear

Rescheduling is **priority-aware**, not first-come-first-served.

---

### 6.3 Natural Interruption Handling *(Key Capability)*

Users can report real-world disruptions in plain language, e.g.:

> “I slipped 30 minutes talking to a friend.”
> 

Upon receiving an interruption, Kepler:

- updates the current planning state
- evaluates task priority and flexibility
- preserves fixed and high-priority commitments
- reschedules remaining tasks into the next valid free time blocks

This allows plans to adapt to reality without manual rebuilding.

---

### 6.4 Goal-Aligned Planning

- Daily plans are generated with awareness of long-term objectives
- Short-term decisions are made in service of long-term intent

---

### 6.5 Calendar Integration

- One-way and two-way sync with **Google Calendar**
- Calendar events act as hard constraints in replanning

---

### 6.6 Email-Based Event Detection *(Read-Only, Limited Scope)*

- Detects schedule-impacting signals from email (e.g. tests, meetings, interviews)
- Extracts time, urgency, and rigidity
- Requires explicit user confirmation before affecting plans

---

### 6.7 Daily Horizon Focus

- Planning optimized for **today**
- Longer horizons stored as context, not micromanaged

---

## 7. What Kepler Explicitly Does NOT Do (v1)

To stay focused and reliable, Kepler will not:

- act as a general-purpose chatbot
- manage personal life or health tracking
- replace project management tools
- deeply integrate with Jira, Notion, etc.
- act on emails without explicit user confirmation
- provide alarms or notifications beyond calendar sync

These are **intentional exclusions**, not missing features.

---

## 8. Differentiation

| Existing Tools | Kepler |
| --- | --- |
| Stateless prompts | Persistent memory |
| Manual replanning | Automatic, priority-aware adaptation |
| Static schedules | Living plans |
| Task lists | Context-aware assistant |

Kepler’s advantage is **memory + intent**, not feature count.

---

## 9. Why Now

- LLMs enable natural conversation for planning
- Knowledge work is increasingly self-managed
- Existing productivity tools haven’t adapted to interruption-heavy workflows

Kepler sits at the intersection of **LLMs + personal context + real-world planning**.

---

## 10. Long-Term Vision (Post-MVP)

Once trust is established, Kepler can expand into:

- multi-day and weekly planning
- deeper integrations (Notion, Jira, email)
- proactive suggestions and nudges
- optional team-aware planning

Expansion is **earned**, not assumed.

---

## 11. Success Metrics (Early)

- Daily active planning sessions
- Frequency of automatic replans
- User retention after disruptions
- Time saved per user per day (self-reported)

---

## 12. Guiding Principles

- **Memory over features**
- **Adaptation over control**
- **Clarity over complexity**
- **Assistant, not overlord**

---

## 13. One-Line Summary

> Kepler is a persistent AI assistant that remembers what you’re trying to achieve and keeps your plan aligned when life changes.
> 

---