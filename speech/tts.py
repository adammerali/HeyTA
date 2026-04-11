import os
import pyaudio
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# PCM format matching OpenAI TTS output
SAMPLE_RATE = 24000
CHANNELS = 1
FORMAT = pyaudio.paInt16
CHUNK_SIZE = 1024


def speak(text: str):
    """
    Stream OpenAI TTS audio and play it immediately as chunks arrive.
    Playback starts as soon as the first audio chunk is received.
    """
    p = pyaudio.PyAudio()
    stream = p.open(format=FORMAT, channels=CHANNELS, rate=SAMPLE_RATE, output=True)

    try:
        with client.audio.speech.with_streaming_response.create(
            model="tts-1",
            voice="shimmer",
            input=text,
            response_format="pcm",
        ) as response:
            for chunk in response.iter_bytes(chunk_size=CHUNK_SIZE):
                stream.write(chunk)
    finally:
        stream.stop_stream()
        stream.close()
        p.terminate()
