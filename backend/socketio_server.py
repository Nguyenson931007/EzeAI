"""
Socket.io server for EzeFloor real-time updates.
Follows the Tasklist pattern: backend emits events on data changes,
frontend listens and updates UI without manual refresh.
"""
import logging
import socketio

logger = logging.getLogger("ezefloor.socketio")

# Async Socket.io server (ASGI mode for FastAPI integration)
sio = socketio.AsyncServer(
    async_mode="asgi",
    # CORS is handled once by FastAPI's CORSMiddleware in main.py.
    # Disable Engine.IO's own CORS response headers here, otherwise mounted
    # Socket.IO responses contain duplicate Access-Control-Allow-Origin values
    # (for example: "http://localhost:3011, http://localhost:3011") and the
    # browser rejects an otherwise successful 200 polling response.
    cors_allowed_origins=[],
    logger=False,
    engineio_logger=False,
)

# ASGI app to mount on FastAPI
socket_app = socketio.ASGIApp(sio)


@sio.event
async def connect(sid, environ, auth):
    """Client connected."""
    logger.info(f"[socketio] Client connected: {sid}")


@sio.event
async def disconnect(sid):
    """Client disconnected."""
    logger.info(f"[socketio] Client disconnected: {sid}")


async def emit_task_updated(task: str, job_hw_id: str = None, unit: str = None, extra: dict = None):
    """
    Emit a task-updated event to all connected clients.
    
    Args:
        task: Task key (e.g., "fixout", "lock_up", "windows")
        job_hw_id: The job HW ID (optional, for filtering)
        unit: The unit (e.g., "Unit 1") (optional, for filtering)
        extra: Additional data to include
    """
    payload = {
        "task": task,
        "job_hw_id": str(job_hw_id) if job_hw_id else None,
        "unit": unit,
        **(extra or {}),
    }
    try:
        await sio.emit("ezefloor:task_updated", payload)
        logger.info(f"[socketio] Emitted task_updated: {payload}")
    except Exception as e:
        logger.warning(f"[socketio] Failed to emit task_updated: {e}")


def emit_task_updated_sync(task: str, job_hw_id: str = None, unit: str = None, extra: dict = None):
    """
    Synchronous wrapper for use in non-async contexts.
    Schedules the emit as a background task.
    """
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(emit_task_updated(task, job_hw_id, unit, extra))
        else:
            loop.run_until_complete(emit_task_updated(task, job_hw_id, unit, extra))
    except Exception as e:
        logger.warning(f"[socketio] Failed to schedule emit: {e}")
