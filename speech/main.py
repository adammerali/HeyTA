import os
import re
import time
from dotenv import load_dotenv
from listener import TAListener
from feedback import get_feedback
from tts import speak
import server

load_dotenv()


def strip_markdown(text: str) -> str:
    """Remove markdown formatting so TTS and the UI both get clean plain text."""
    text = re.sub(r'\*{1,3}(.+?)\*{1,3}', r'\1', text)   # **bold**, *italic*
    text = re.sub(r'_{1,3}(.+?)_{1,3}', r'\1', text)       # __bold__, _italic_
    text = re.sub(r'`{1,3}(.+?)`{1,3}', r'\1', text)       # `code`, ```code```
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)  # ## headings
    text = re.sub(r'^\s*[-*+]\s+', '', text, flags=re.MULTILINE)  # - list items
    return text.strip()


# Conversation history for voice sessions — carries context between "Hey TA" activations.
# Each entry is {"role": "user"|"assistant", "content": str}.
# Capped at MAX_HISTORY messages to avoid unbounded token growth.
MAX_HISTORY = 20
conversation_history: list = []

# Capture mode set by the UI: "voice" | "camera" | "screenshot"
capture_mode: str = "camera"


def handle_question(
    transcript: str,
    image_b64: str | None = None,
    is_followup: bool = False,
) -> bool:
    """
    Handle one question/reply turn. Returns True if Claude's response ended
    with a question, meaning the conversation should continue.
    """
    global conversation_history, capture_mode

    # For the opening question, poll for a frame sent back via WebSocket.
    # Camera mode: browser captures from webcam and sends frame_capture.
    # Screenshot mode: Tauri command takes screenshot and sends frame_capture.
    # Skip for follow-up replies (student is just talking).
    final_image: str | None = image_b64
    if not is_followup and final_image is None:
        deadline = time.time() + 3.0
        pending: list[dict] = []
        while time.time() < deadline:
            for msg in server.drain_incoming():
                pending.append(msg)
            for msg in pending:
                if msg.get("type") == "frame_capture":
                    final_image = msg.get("image_b64")
                elif msg.get("type") == "set_capture_mode":
                    capture_mode = msg.get("mode", "camera")
                    print(f"[TA] Capture mode: {capture_mode}")
            if final_image:
                break
            pending.clear()
            time.sleep(0.05)
        for msg in pending:
            if msg.get("type") == "reset_conversation":
                conversation_history = []
                print("[TA] Conversation history cleared by UI.")
            elif msg.get("type") == "set_capture_mode":
                capture_mode = msg.get("mode", "camera")
                print(f"[TA] Capture mode: {capture_mode}")

    # Always drain any remaining control messages
    for msg in server.drain_incoming():
        if msg.get("type") == "reset_conversation":
            conversation_history = []
            print("[TA] Conversation history cleared by UI.")
        elif msg.get("type") == "set_capture_mode":
            capture_mode = msg.get("mode", "camera")
            print(f"[TA] Capture mode: {capture_mode}")

    server.broadcast({"type": "status", "value": "thinking"})
    if not is_followup:
        server.broadcast({"type": "open_chat"})
    server.broadcast({
        "type": "user_message",
        "content": transcript,
        "image_b64": final_image,
        "is_followup": is_followup,
    })

    print("Fetching feedback from TA...\n")
    print("-" * 60)
    print("TA:\n")

    response_parts: list[str] = []
    for sentence in get_feedback(
        transcript=transcript,
        history=conversation_history,
        whiteboard_content=None,
        image_b64=final_image,
    ):
        clean = strip_markdown(sentence)
        print(clean)
        speak(clean)
        server.broadcast({"type": "assistant_chunk", "content": clean})
        response_parts.append(clean)

    full_response = " ".join(response_parts)
    conversation_history.append({"role": "user", "content": transcript})
    conversation_history.append({"role": "assistant", "content": full_response})
    if len(conversation_history) > MAX_HISTORY:
        conversation_history = conversation_history[-MAX_HISTORY:]

    server.broadcast({"type": "assistant_done"})
    server.broadcast({"type": "status", "value": "ready"})

    print("-" * 60)
    print()

    return full_response.rstrip().endswith("?")


def run_conversation(transcript: str, image_b64: str | None, listener) -> None:
    """Drive a full conversational exchange — initial question plus any follow-ups."""
    global conversation_history
    conversation_history = []  # each new "Hey TA" activation starts with a clean slate

    wants_reply = handle_question(transcript, image_b64, is_followup=False)

    while wants_reply:
        server.broadcast({"type": "status", "value": "listening"})
        print("[TA] Waiting for student reply...\n")
        reply = listener.listen_for_reply(timeout=15.0)

        if reply is None:
            # Exit phrase or timeout — hand control back to wake-phrase loop
            server.broadcast({"type": "status", "value": "ready"})
            break

        wants_reply = handle_question(reply, None, is_followup=True)


def main():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY is not set.")
        print("Create a .env file with:  ANTHROPIC_API_KEY=your_key_here")
        return

    if not os.environ.get("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY is not set.")
        print("Create a .env file with:  OPENAI_API_KEY=your_key_here")
        return

    server.start()

    def on_activated():
        global capture_mode
        for msg in server.drain_incoming():
            if msg.get("type") == "set_capture_mode":
                capture_mode = msg.get("mode", "camera")
                print(f"[TA] Capture mode: {capture_mode}")
        server.broadcast({"type": "status", "value": "listening"})
        # Don't open the chat window yet in screenshot mode — the window
        # would cover the user's screen before the screenshot is taken.
        # handle_question() sends open_chat after the screenshot is captured.
        if capture_mode != "screenshot":
            server.broadcast({"type": "open_chat"})

    def on_captured():
        server.broadcast({"type": "status", "value": "captured"})
        if capture_mode == "screenshot":
            # Ask the Tauri UI to take the screenshot via its native command.
            # The result comes back as a frame_capture WebSocket message,
            # which handle_question() picks up in its polling window.
            server.broadcast({"type": "request_screenshot"})

    listener = TAListener()
    listener.run(
        on_question_callback=lambda t, img: run_conversation(t, img, listener),
        on_activated=on_activated,
        on_captured=on_captured,
        capture_mode_getter=lambda: capture_mode,
    )


if __name__ == "__main__":
    main()
