import base64
import io
import os
import queue
import cv2
import speech_recognition as sr
from openai import OpenAI

# Variations of the wake phrase to handle mishearing and accents
WAKE_PHRASES = [
    "hey ta",
    "hey t.a.",
    "hey t.a",
    "hey tea",
    "hey t a",
    "hey tee a",
    "hey tee ay",
    "hey tee ayy",
    "hey tay",
    "hay ta",
    "hey da",
]
STOP_PHRASES = ["thank you", "stop"]
# Whisper artifacts to ignore — punctuation-only transcriptions of silence
ARTIFACTS = {".", "..", "...", "you", "bye", "bye bye"}


def contains_wake_phrase(text: str) -> bool:
    text_lower = text.lower()
    return any(phrase in text_lower for phrase in WAKE_PHRASES)


def contains_stop_phrase(text: str) -> bool:
    text_lower = text.lower()
    return any(phrase in text_lower for phrase in STOP_PHRASES)


def is_artifact(text: str) -> bool:
    return text.strip().lower() in ARTIFACTS


def extract_after_wake(text: str) -> str:
    """Return anything the student said after the wake phrase in the same utterance."""
    text_lower = text.lower()
    for phrase in WAKE_PHRASES:
        idx = text_lower.find(phrase)
        if idx != -1:
            return text[idx + len(phrase):].strip()
    return ""


def capture_webcam_frame() -> str | None:
    """Capture a single frame from the webcam and return it as a base64-encoded JPEG string."""
    for index in range(3):
        cap = cv2.VideoCapture(index)
        if not cap.isOpened():
            cap.release()
            continue
        ret, frame = cap.read()
        cap.release()
        if ret and frame is not None:
            _, buffer = cv2.imencode(".jpg", frame)
            return base64.b64encode(buffer).decode("utf-8")
    print("[Webcam] Could not capture frame from any camera.")
    return None


class TAListener:
    def __init__(self):
        self.recognizer = sr.Recognizer()
        self.openai_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
        self.mic = sr.Microphone()
        self.audio_queue = queue.Queue()

        print("Calibrating for ambient noise, please wait...")
        with self.mic as source:
            self.recognizer.adjust_for_ambient_noise(source, duration=2)

        # Start background recording — mic never stops between chunks
        self.recognizer.listen_in_background(
            self.mic, self._audio_callback, phrase_time_limit=15
        )
        print("Ready. Say 'Hey TA' to ask for help.\n")

    def _audio_callback(self, recognizer, audio):
        """Called by the background thread every time a phrase is captured."""
        self.audio_queue.put(audio)

    def _transcribe(self, audio) -> str | None:
        """Send an audio chunk to Whisper and return the transcript."""
        wav_data = audio.get_wav_data()
        if len(wav_data) < 8000:
            return None
        wav_bytes = io.BytesIO(wav_data)
        wav_bytes.name = "audio.wav"
        result = self.openai_client.audio.transcriptions.create(
            model="whisper-1", file=wav_bytes, language="en"
        )
        text = result.text.strip()
        if not text or is_artifact(text):
            return None
        return text

    def run(self, on_question_callback, on_activated=None):
        """
        Main loop. The mic records continuously in a background thread into audio_queue.
        This thread pulls chunks, transcribes them, and reacts to wake/stop phrases.
        Recording never pauses — no gap between wake phrase and question capture.

        on_activated: optional zero-argument callback fired when the wake phrase is detected.
        """
        print("TA is listening... Say 'Hey TA' to begin, then 'Thank you' when done.\n")

        while True:
            audio = self.audio_queue.get()
            text = self._transcribe(audio)
            if not text:
                continue

            print(f"Heard: {text}")

            if contains_wake_phrase(text):
                if on_activated:
                    on_activated()
                inline = extract_after_wake(text)
                print("\n[TA activated] What do you need help with?")

                parts = [inline] if inline else []
                image_b64 = None

                if inline:
                    print(f"  (captured: \"{inline}\")")

                # Consume queue until stop phrase — mic is still recording in background
                while True:
                    audio = self.audio_queue.get()
                    text = self._transcribe(audio)
                    if not text:
                        continue

                    if contains_stop_phrase(text):
                        cleaned = text.lower()
                        for phrase in STOP_PHRASES:
                            cleaned = cleaned.replace(phrase, "")
                        cleaned = cleaned.strip()
                        if cleaned:
                            parts.append(cleaned)
                        print("\n[TA] Capturing webcam frame...")
                        image_b64 = capture_webcam_frame()
                        break

                    parts.append(text)
                    print(f"  ...{text}")

                full_question = " ".join(p for p in parts if p).strip()
                if full_question:
                    print(f"\nQuestion captured:\n  \"{full_question}\"\n")
                    on_question_callback(full_question, image_b64)
                else:
                    print("Didn't catch that — please try again.\n")
