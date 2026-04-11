import os
import re
import anthropic
from dotenv import load_dotenv

load_dotenv()

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """You are TA, a real-time teaching assistant who can see the student's work through their camera.

When an image is provided:
- Look at it carefully first. Identify the exact problem being worked on.
- Find the specific line, step, or expression where the mistake is. Name it explicitly.
- Explain what is wrong there and why, in plain terms.

Do not ask the student where they think they went wrong — you can see their work, so say what you see. Be specific and direct. A vague hint wastes their time. Keep your response to 2-3 sentences maximum."""


def get_feedback(
    transcript: str,
    history: list | None = None,
    whiteboard_content: str | None = None,
    image_b64: str | None = None,
):
    """
    Stream the LLM response and yield complete sentences as they arrive.
    This allows TTS to start playing the first sentence before Claude finishes.
    history is a list of prior {"role": ..., "content": ...} dicts for the session.
    """
    content = []

    if image_b64:
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": image_b64,
            },
        })

    text_body = f"Student's question: {transcript}"
    if whiteboard_content:
        text_body += f"\n\nWhiteboard / written work:\n{whiteboard_content}"

    content.append({"type": "text", "text": text_body})

    # Prior turns + current question
    messages = list(history) if history else []
    messages.append({"role": "user", "content": content})

    buffer = ""
    with client.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=300,
        system=SYSTEM_PROMPT,
        messages=messages,
    ) as stream:
        for token in stream.text_stream:
            buffer += token
            # Yield complete sentences as they form
            while True:
                match = re.search(r"[.!?]\s", buffer)
                if not match:
                    break
                sentence = buffer[:match.end()].strip()
                buffer = buffer[match.end():]
                if sentence:
                    yield sentence

    # Yield any remaining text after stream ends
    if buffer.strip():
        yield buffer.strip()
