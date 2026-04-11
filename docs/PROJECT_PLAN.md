# HeyTA — Project Plan (VC Dimensions)

---

## Vision Clarity

HeyTA is a real-time AI teaching assistant that activates when a student says "Hey TA," instantly combining their spoken question, whiteboard work, and on-screen problem description to deliver targeted, Socratic feedback — without the student ever leaving their workspace. Unlike generic chatbots, HeyTA understands the full context of what the student is working on by reading three simultaneous input streams, making it the first AI TA that sees, hears, and responds in the same moment a student gets stuck.

---

## Technical Depth

HeyTA uses a three-stage multimodal pipeline:

1. **Speech** — A Python listener detects the wake phrase "Hey TA" via Google Speech Recognition, captures the student's spoken question, and sends a combined transcript to Claude (`claude-sonnet-4-6`) via the Anthropic API using a structured TA system prompt.
2. **Vision (OpenCV)** — A frame capture module reads the student's physical whiteboard via webcam, extracts text and diagram context, and passes it as supplementary input alongside the speech transcript.
3. **Screen Reader** — A screen capture module reads the original problem description displayed on the student's monitor, providing the model with the source problem the student is trying to solve.

All three streams converge in `speech/main.py:handle_question()`, which assembles the full context object and calls the LLM. The Tauri desktop UI renders the response in a floating overlay (NSPanel, always-on-top) so the student never needs to context-switch.

---

## Innovation

HeyTA's differentiation is **ambient multimodal context assembly** — it doesn't require the student to copy-paste a problem, describe their work, or switch apps. By passively listening for a wake phrase and simultaneously reading the whiteboard and screen, HeyTA reconstructs the student's full working context automatically. This is meaningfully different from asking ChatGPT a question: GPT-4 only knows what you tell it; HeyTA already knows what you're working on before you finish your sentence.

---

## Feasibility

**Scope (12-hour buildathon):**
- Speech module — complete (wake phrase detection, transcription, LLM feedback via Anthropic API)
- Desktop UI — complete (Tauri overlay bar + ChatGPT-style chat window)
- OpenCV whiteboard capture — integration point defined in `handle_question()`; frame capture and OCR to be wired in
- Screen reader — integration point defined; screenshot-to-text module to be connected

**Expected outputs:** Working demo where a student says "Hey TA, I don't understand why my recursion isn't terminating," and the system responds with targeted feedback drawn from what it sees on the whiteboard and screen.

**Risks:**
- Speech recognition accuracy in noisy environments (mitigated by multiple wake phrase variants in `listener.py`)
- OCR accuracy on messy handwriting (mitigated by passing raw image to vision-capable model as fallback)
- Latency across three input streams (mitigated by parallel capture; LLM call only happens after all streams are assembled)

---

## Scalability Design

The current architecture is single-user by design (one student, one TA session). Scalability paths:

- **Horizontal:** Each student runs a local HeyTA instance — no shared server, no bottleneck. The only external dependency is the Anthropic API, which scales independently.
- **Modular inputs:** Each of the three input modules (speech, vision, screen) is a separate, swappable component connected via the `handle_question()` interface in `main.py`. New input types (e.g., IDE plugin, tablet input) can be added without changing the core pipeline.
- **Institutional deployment:** A future server-side version could route transcripts through a shared Claude API key with per-student rate limiting, reducing per-student cost at scale.

---

## Execution Thinking

**External dependencies and failure handling:**

| Service | Purpose | Failure Behaviour |
|---|---|---|
| Anthropic API (`claude-sonnet-4-6`) | LLM feedback generation | Returns error string to student UI; session continues listening |
| Google Speech Recognition | Wake phrase + transcription | Falls back to silence timeout; student can retry |
| OpenCV + webcam | Whiteboard capture | `whiteboard_content=None` passed to LLM; model responds from speech alone |
| Screen capture (OS API) | Problem description extraction | Same as above — graceful degradation to speech-only context |

The system is designed to degrade gracefully: if any input stream fails, HeyTA still responds using whichever context it has.

---

## Problem Definition

**Pain point:** In large computer science courses, students debugging or solving problems often wait 20–40 minutes for a human TA. By the time help arrives, the student has lost their mental context. Existing tools (ChatGPT, GitHub Copilot) require the student to manually copy and describe their problem — a frustrating context-switch that breaks flow and often produces generic answers because the AI doesn't see the full picture.

**Audience:** Undergraduate CS students working through programming assignments, algorithms problems, or debugging sessions — particularly in lab settings or during office hours with high TA-to-student ratios.

**Metric of success:** A student gets a useful, targeted hint within 10 seconds of saying "Hey TA," without leaving their current screen or typing anything.

---

## User Impact

**Scenario 1 — Debugging:** A student is staring at a recursive function on their screen and has their working on a call stack diagram on the whiteboard. They say "Hey TA, why does this never hit the base case?" HeyTA reads the code on screen, the diagram on the whiteboard, and the spoken question — and responds: "Your base case checks `n == 0` but you're decrementing by 2 each time. If `n` starts as an odd number, you'll skip it entirely."

**Scenario 2 — Concept gap:** A student has a problem set question displayed on screen and has written a partial solution on the whiteboard. They say "Hey TA, I don't get what Big-O means here." HeyTA sees the specific problem and their work, and responds with an explanation anchored to the exact algorithm in front of them — not a generic textbook definition.

**Improvement over alternatives:** ChatGPT requires typing and copy-pasting. A human TA requires waiting. HeyTA is instant, context-aware, and requires zero friction.

---

## Market Awareness

**Why not just use ChatGPT?**
ChatGPT only knows what you type. HeyTA sees your screen, your whiteboard, and hears you — assembling context you'd spend 5 minutes typing into a prompt.

**Why not just use GitHub Copilot?**
Copilot is code-completion inside an IDE. It doesn't handle spoken questions, whiteboard diagrams, or problem set descriptions. It also doesn't guide — it completes, which is the opposite of Socratic teaching.

**Why not just use a human TA?**
Human TAs are unavailable at 2am, have a 20:1 student ratio, and can't simultaneously watch your screen and your whiteboard. HeyTA is always on, zero-latency, and always has full context.

---

## Team Execution Plan

| Member | Responsibilities |
|---|---|
| Adam Merali | Speech module (Python), Anthropic API integration, project architecture |

**12-hour build plan:**

| Hour | Milestone |
|---|---|
| 0–2 | Speech module: wake phrase detection + transcription |
| 2–4 | LLM integration: Anthropic API + TA system prompt |
| 4–6 | Desktop UI: Tauri overlay bar + chat window |
| 6–8 | OpenCV whiteboard capture + integration into pipeline |
| 8–10 | Screen reader module + integration |
| 10–11 | End-to-end demo run, latency tuning |
| 11–12 | Polish, README, submission |

---

## Differentiation Strategy

HeyTA's position: **the only AI TA that understands the student's full working context without requiring any manual input.**

| Competitor | Gap HeyTA fills |
|---|---|
| ChatGPT / Claude.ai | Requires manual copy-paste; no whiteboard or screen awareness |
| GitHub Copilot | IDE-only; no speech, no whiteboard, completes rather than teaches |
| Khanmigo (Khan Academy AI) | Curriculum-locked; can't see your specific code or whiteboard |
| Human TA | High latency, unavailable off-hours, limited attention per student |

HeyTA wins on **zero-friction context capture** — the student does nothing except talk. Every competitor requires the student to describe their problem; HeyTA already knows it.
