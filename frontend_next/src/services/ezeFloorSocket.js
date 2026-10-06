/**
 * Socket.io client for EzeFloor real-time updates.
 * Follows the Tasklist pattern: singleton, connect on app load.
 */
import { io } from "socket.io-client";

let socket = null;

const getBackendUrl = () => {
  // Use the backend API URL (not the frontend origin)
  // The backend runs on a different port (e.g., 8090) than the frontend (e.g., 3011)
  if (typeof window === "undefined") return "";
  try {
    // Try to get from APP_CONFIG if available
    const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
    if (apiUrl) {
      // Extract origin from API URL (e.g., http://localhost:8090/api -> http://localhost:8090)
      const url = new URL(apiUrl);
      return url.origin;
    }
  } catch (_) {}
  // Match TaskList: use the current origin so HTTPS/Nginx deployments do not
  // create a mixed-content socket connection. Next/Nginx proxies /socket.io.
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
