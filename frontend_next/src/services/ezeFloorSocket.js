/**
 * Socket.io client for EzeFloor real-time updates.
 * Follows the Tasklist pattern: singleton, connect on app load.
 */
import { io } from "socket.io-client";

let socket = null;

const getBackendUrl = () => {
  if (typeof window === "undefined") return "";

  // Always connect through the frontend origin. NEXT_PUBLIC_API_BASE_URL may
  // be a loopback address used internally by the Next.js server, but exposing
  // it to the browser would make 127.0.0.1 point at the user's own computer.
  // The /socket.io rewrite in next.config.mjs forwards this request internally.
  return window.location.origin;
};

export const connectEzeFloorSocket = () => {
  if (socket?.connected) return socket;
  if (typeof window === "undefined") return null;

  try {
    socket = io(getBackendUrl(), {
      path: "/socket.io",
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on("connect", () => {
      console.log("[EzeFloor Socket] Connected:", socket?.id);
    });

    socket.on("disconnect", (reason) => {
      console.log("[EzeFloor Socket] Disconnected:", reason);
    });

    socket.on("connect_error", (err) => {
      console.warn("[EzeFloor Socket] Connection error:", err.message);
    });

    return socket;
  } catch (e) {
    console.warn("[EzeFloor Socket] Failed to connect:", e);
    return null;
  }
};

export const disconnectEzeFloorSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getEzeFloorSocket = () => socket;

export default {
  connectEzeFloorSocket,
  disconnectEzeFloorSocket,
  getEzeFloorSocket,
};
