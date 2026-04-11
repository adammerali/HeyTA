import os
from dotenv import load_dotenv
from listener import TAListener
from feedback import get_feedback

load_dotenv()


def handle_question(transcript: str):
    """
    Called by the listener whenever a student's full question has been captured.

    To integrate the OpenCV component, pass whiteboard_content into get_feedback().
    Example:
        whiteboard_text = opencv_module.get_latest_whiteboard_text()
        feedback = get_feedback(transcript, whiteboard_content=whiteboard_text)
    """
    print("Fetching feedback from TA...\n")
    print("-" * 60)

    feedback = get_feedback(
        transcript=transcript,
        whiteboard_content=None,  # TODO: OpenCV team — plug your output in here
    )

    print("TA:\n")
    print(feedback)
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
