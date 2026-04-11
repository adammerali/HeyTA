import os
import re
import anthropic
from dotenv import load_dotenv

load_dotenv()

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """You are TA, a real-time teaching assistant. Answer in 1-2 sentences only. Be direct — guide toward the answer, don't give it. If you can see the student's work, reference it specifically."""


def get_feedback(
    transcript: str,
    whiteboard_content: str | None = None,
    image_b64: str | None = None,
):
    """
    Stream the LLM response and yield complete sentences as they arrive.
    This allows TTS to start playing the first sentence before Claude finishes.
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

    buffer = ""
    with client.messages.stream(
        model="claude-haiku-4-5-20251001",
        max_tokens=150,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
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
