"""
WebSocket server — bridges the Python speech pipeline to the Tauri UI.

Events sent to clients:
  {"type": "status", "value": "listening" | "thinking" | "ready"}
  {"type": "open_chat"}
  {"type": "user_message", "content": "...", "image_b64": "..." | null}
  {"type": "assistant_chunk", "content": "..."}
  {"type": "assistant_done"}
"""

import asyncio
import json
import threading

try:
    import websockets
    from websockets.server import WebSocketServerProtocol
    _AVAILABLE = True
except ImportError:
    _AVAILABLE = False

connected: set = set()
_loop: asyncio.AbstractEventLoop | None = None


async def _handler(websocket):
    connected.add(websocket)
    print(f"[WS] Client connected ({len(connected)} total)")
    try:
        await websocket.wait_closed()
    finally:
        connected.discard(websocket)
        print(f"[WS] Client disconnected ({len(connected)} remaining)")


async def _serve():
    global _loop
    _loop = asyncio.get_running_loop()
    async with websockets.serve(_handler, "localhost", 8765):
        print("[WS] Server listening on ws://localhost:8765")
        await asyncio.Future()  # run forever


def start():
    """Start the WebSocket server in a background daemon thread."""
    if not _AVAILABLE:
        print("[WS] websockets package not installed — UI integration disabled.")
        print("[WS] Run: pip install websockets")
        return
    t = threading.Thread(target=asyncio.run, args=(_serve(),), daemon=True)
    t.start()


def broadcast(data: dict):
    """Thread-safe broadcast to all connected WebSocket clients."""
    if not _AVAILABLE or not _loop or not connected:
        return
    msg = json.dumps(data)
    asyncio.run_coroutine_threadsafe(_broadcast_all(msg), _loop)


async def _broadcast_all(msg: str):
    if connected:
        await asyncio.gather(
            *(ws.send(msg) for ws in list(connected)),
            return_exceptions=True,
        )
