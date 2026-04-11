import os
import anthropic

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """You are TA, an intelligent teaching assistant helping students understand course material in real time.

When a student asks for help, you must:
1. Identify exactly what they are struggling with or what they got wrong
2. Explain the mistake or gap in understanding clearly but without being condescending
3. Walk them toward the correct approach — guide, do not just give the answer
4. Be warm, patient, and encouraging, the way a great human TA would be

You will receive the student's spoken question. You may also receive notes or work extracted from their whiteboard — if so, use both together to give precise, targeted feedback.

Keep your response conversational and concise. This is a live, real-time interaction."""


def get_feedback(transcript: str, whiteboard_content: str | None = None) -> str:
    """
    Call the LLM to get teaching feedback for a student's question.

    Args:
        transcript:         What the student said, captured from speech recognition.
        whiteboard_content: (Optional) Text or description extracted from the student's
                            whiteboard by the OpenCV component. Pass this in when available
                            to give the model full context of the student's written work.

    Returns:
        A feedback string from the model, ready to display or speak back to the student.
    """
    user_message = f"Student's question: {transcript}"

    if whiteboard_content:
        user_message += f"\n\nWhiteboard / written work:\n{whiteboard_content}"

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    return response.content[0].text
