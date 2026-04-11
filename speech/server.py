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
import queue
import threading

try:
    import websockets
    from websockets.server import WebSocketServerProtocol
    _AVAILABLE = True
except ImportError:
    _AVAILABLE = False

connected: set = set()
_loop: asyncio.AbstractEventLoop | None = None
_pending_status: dict | None = None
_pending_user_message: dict | None = None
_incoming: queue.Queue = queue.Queue()


async def _handler(websocket):
    connected.add(websocket)
    print(f"[WS] Client connected ({len(connected)} total)")
    # Replay current state to late-connecting clients (e.g. ChatWindow opening
    # after the wake phrase was already detected)
    if _pending_status is not None:
        try:
            await websocket.send(json.dumps(_pending_status))
        except Exception:
            pass
    if _pending_user_message is not None:
        try:
            await websocket.send(json.dumps(_pending_user_message))
        except Exception:
            pass
    try:
        async for raw in websocket:
            try:
                _incoming.put_nowait(json.loads(raw))
            except Exception:
                pass
    finally:
        connected.discard(websocket)
        print(f"[WS] Client disconnected ({len(connected)} remaining)")


def drain_incoming() -> list[dict]:
    """Return all messages sent by clients since the last call. Thread-safe."""
    msgs = []
    while True:
        try:
            msgs.append(_incoming.get_nowait())
        except queue.Empty:
            break
    return msgs


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
    global _pending_status, _pending_user_message
    # Always track the latest status so late-connecting clients get current state
    if data.get("type") == "status":
        _pending_status = data
    # Buffer user_message so ChatWindow receives it even if it connects after broadcast
    if data.get("type") == "user_message":
        _pending_user_message = data
    elif data.get("type") == "assistant_done":
        _pending_user_message = None
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
