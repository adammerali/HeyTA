import speech_recognition as sr

# Variations of the wake phrase to handle mishearing and accents
WAKE_PHRASES = ["hey ta", "hey t.a.", "hey tea", "hey t a", "hay ta", "hey da"]


def contains_wake_phrase(text: str) -> bool:
    text_lower = text.lower()
    return any(phrase in text_lower for phrase in WAKE_PHRASES)


def extract_after_wake(text: str) -> str:
    """Return anything the student said after the wake phrase in the same utterance."""
    text_lower = text.lower()
    for phrase in WAKE_PHRASES:
        idx = text_lower.find(phrase)
        if idx != -1:
            return text[idx + len(phrase):].strip()
    return ""


class TAListener:
    def __init__(self):
        self.recognizer = sr.Recognizer()
        self.mic = sr.Microphone()
        with self.mic as source:
            print("Calibrating for ambient noise, please wait...")
            self.recognizer.adjust_for_ambient_noise(source, duration=2)
        print("Ready. Say 'Hey TA' to ask for help.\n")

    def _listen_once(self, timeout: int = 5, phrase_limit: int = 12) -> str | None:
        """Listen for a single utterance and return the transcript, or None on silence/error."""
        with self.mic as source:
            try:
                audio = self.recognizer.listen(
                    source, timeout=timeout, phrase_time_limit=phrase_limit
                )
                return self.recognizer.recognize_google(audio)
            except sr.WaitTimeoutError:
                return None
            except sr.UnknownValueError:
                return None
            except sr.RequestError as e:
                print(f"[Speech recognition service error]: {e}")
                return None

    def capture_question(self) -> str:
        """
        Record the student's full question after the wake phrase is detected.
        Stops after two consecutive silent/empty chunks, treating that as end-of-question.
        """
        print("Listening for your question...")
        parts = []
        consecutive_silence = 0

        while consecutive_silence < 2:
            text = self._listen_once(timeout=4, phrase_limit=20)
            if text:
                parts.append(text)
                consecutive_silence = 0
                print(f"  ...{text}")
            else:
                consecutive_silence += 1

        return " ".join(parts)

    def run(self, on_question_callback):
        """
        Main loop. Waits for the wake phrase, captures the student's full question,
        then calls on_question_callback(transcript: str).

        The callback is responsible for fetching and displaying feedback.
        """
        print("TA is listening... Say 'Hey TA, I need help with...' to begin.\n")

        while True:
            text = self._listen_once(timeout=15, phrase_limit=10)
            if text is None:
                continue

            print(f"Heard: {text}")

            if contains_wake_phrase(text):
                # Grab anything said after "Hey TA" in the same breath
                inline = extract_after_wake(text)

                print("\n[TA activated] What do you need help with?")

                continuation = self.capture_question()
                full_question = f"{inline} {continuation}".strip()

                if full_question:
                    print(f"\nQuestion captured:\n  \"{full_question}\"\n")
                    on_question_callback(full_question)
                else:
                    print("Didn't catch that — please try again.\n")
