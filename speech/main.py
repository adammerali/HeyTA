import os
from dotenv import load_dotenv
from listener import TAListener
from feedback import get_feedback
from tts import speak

load_dotenv()


def handle_question(transcript: str, image_b64: str | None = None):
    print("Fetching feedback from TA...\n")
    print("-" * 60)
    print("TA:\n")

    for sentence in get_feedback(
        transcript=transcript,
        whiteboard_content=None,  # TODO: OpenCV team — plug your output in here
        image_b64=image_b64,
    ):
        print(sentence)
        speak(sentence)

    print("-" * 60)
    print()


def main():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY is not set.")
        print("Create a .env file with:  ANTHROPIC_API_KEY=your_key_here")
        return

    listener = TAListener()
    listener.run(on_question_callback=handle_question)


if __name__ == "__main__":
    main()
