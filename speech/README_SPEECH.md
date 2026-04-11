# TA — Speech & Keyword Detection Module

This module handles everything voice-related for the TA app. It listens continuously for a student to say **"Hey TA"**, captures their full question, and sends it to Claude for real-time teaching feedback.

---

## What This Module Does

| Step | Description |
|---|---|
| 1. Always-on listening | Microphone runs in the background, waiting for the wake phrase |
| 2. Wake phrase detection | Flexibly detects "Hey TA" including common mishearings |
| 3. Question capture | Records the student's full question until they stop speaking |
| 4. LLM feedback | Sends the transcript to Claude with a teaching-focused prompt |

---

## Example Interaction

```
TA is listening... Say 'Hey TA, I need help with...' to begin.

Heard: Hey TA I need help understanding why my integral keeps coming out wrong
[TA activated] What do you need help with?
  ...I think I'm applying the power rule but the answer doesn't match
  ...I'm getting x squared over 2 but the solution says something different

Question captured:
  "I need help understanding why my integral keeps coming out wrong
   I think I'm applying the power rule but the answer doesn't match
   I'm getting x squared over 2 but the solution says something different"

Fetching feedback from TA...

------------------------------------------------------------
TA:

You're actually applying the power rule correctly — ∫x dx = x²/2 is right.
The likely issue is a missing constant of integration. Every indefinite integral
needs a "+ C" at the end because the derivative of any constant is zero...
------------------------------------------------------------
```

---

## Setup

### 1. Install system dependency (macOS only)

```bash
brew install portaudio
```

> Windows users: PortAudio is bundled with PyAudio — no extra step needed.

### 2. Install Python dependencies

```bash
cd speech
pip install -r requirements.txt
```

### 3. Set your Anthropic API key

Create a `.env` file inside the `speech/` directory:

```
ANTHROPIC_API_KEY=your_key_here
```

---

## Run

```bash
cd speech
python main.py
```

Say **"Hey TA"** followed by your question. TA will wait for you to finish speaking before responding.

---

## Integration Point for the OpenCV Team

The speech module is designed to work in tandem with your whiteboard extraction output. The single LLM call that combines both pieces of context lives in **`feedback.py`**.

### How to plug in

In `main.py`, inside `handle_question()`:

```python
def handle_question(transcript: str):
    # Get the latest whiteboard capture from the OpenCV module
    whiteboard_text = opencv_module.get_latest_whiteboard_text()  # your function here

    feedback = get_feedback(
        transcript=transcript,
        whiteboard_content=whiteboard_text,  # pass it in here
    )
```

### What `get_feedback` expects

```python
get_feedback(
    transcript: str,          # student's spoken question (provided by this module)
    whiteboard_content: str,  # text/description extracted from whiteboard (provided by OpenCV team)
)
```

The model receives both together and uses them to give targeted feedback — e.g. if the student says "I don't know why this is wrong" and the whiteboard shows their work, Claude will reference the specific mistake it sees.

---

## File Structure

```
speech/
├── main.py           # Entry point — run this
├── listener.py       # Mic capture, wake phrase detection, question recording
├── feedback.py       # Claude API call — integration point for OpenCV team
├── requirements.txt
└── README_SPEECH.md  # This file
```

---

## Wake Phrase Variations Detected

The listener handles the following to account for speech recognition quirks:

- `"hey ta"`
- `"hey t.a."`
- `"hey tea"` *(common mishear)*
- `"hey t a"`
- `"hay ta"` *(accent variation)*
- `"hey da"` *(mic noise variation)*
