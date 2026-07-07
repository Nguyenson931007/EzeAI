const getBaseUrl = () => {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE_URL?.trim()) {
    return process.env.NEXT_PUBLIC_API_BASE_URL.trim();
  }
  if (typeof window !== "undefined") {
    return `http://${window.location.hostname}:8090`;
  }
  return "http://localhost:8090";
};

export const BASE_URL = getBaseUrl();

export const getHeaders = (contentType = "application/json") => {
  const userStr = localStorage.getItem("user");
  const headers = {};
  if (contentType) headers["Content-Type"] = contentType;

  if (userStr) {
    const user = JSON.parse(userStr);
    if (user.username) headers["X-Username"] = user.username;
    if (user.session_token) headers["X-Session-Token"] = user.session_token;
  }
  return headers;
};

const handleResponse = async (res) => {
  if (res.status === 401 || res.status === 429) {
    try {
      const data = await res.json();
      if (window.appDialog) { await window.appDialog.showAlert(data.detail || "Session expired or locked"); } else { alert(data.detail || "Session expired or locked"); }
    } catch (e) {
      if (window.appDialog) { await window.appDialog.showAlert("Session expired or locked"); } else { alert("Session expired or locked"); }
    }
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("user");
    window.location.href = "/login";
    return { detail: "Unauthorized" };
  }
  
  if (!res.ok) {
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return res.json();
    } else {
      const text = await res.text();
      throw new Error(`Server returned ${res.status}: ${text}`);
    }
  }
  return res.json();
};

export const ApiService = {
  async login(authData) {
    const res = await fetch(`${BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(authData),
      credentials: "include"
    });
    return res.json();
  },

  async signup(authData) {
    const res = await fetch(`${BASE_URL}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(authData)
    });
    return res.json();
  },

  async logout(username) {
    const res = await fetch(`${BASE_URL}/logout`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ username }),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async validateSession() {
    const res = await fetch(`${BASE_URL}/validate-session`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return res;
  },

  // --- User Management (Admin) ---
  async getUsers() {
    const res = await fetch(`${BASE_URL}/users`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async updateUser(userId, userData) {
    const res = await fetch(`${BASE_URL}/users/${userId}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(userData),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async deleteUser(userId) {
    const res = await fetch(`${BASE_URL}/users/${userId}`, {
      method: "DELETE",
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async approveUser(userId) {
    const res = await fetch(`${BASE_URL}/users/${userId}/approve`, {
      method: "POST",
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async rejectUser(userId) {
    const res = await fetch(`${BASE_URL}/users/${userId}/reject`, {
      method: "POST",
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async unlockUser(userId, newPassword) {
    const res = await fetch(`${BASE_URL}/users/unlock`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ user_id: userId, new_password: newPassword }),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async toggleShare(jobId, active) {
    const res = await fetch(`${BASE_URL}/jobs/${jobId}/share?active=${active}`, {
      method: "PUT",
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async getSharedJob(token) {
    const res = await fetch(`${BASE_URL}/jobs/share/${token}`);
    return res.json();
  },

  // --- Jobs ---
  async saveJob(payload) {
    const res = await fetch(`${BASE_URL}/jobs`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async getJobData(jobId) {
    const res = await fetch(`${BASE_URL}/jobs/data/${jobId}`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async getUserJobs(username, limit = 20, offset = 0) {
    const res = await fetch(`${BASE_URL}/jobs/${username}?limit=${limit}&offset=${offset}`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async getAllJobs(limit = 50, offset = 0) {
    const res = await fetch(`${BASE_URL}/all-jobs?limit=${limit}&offset=${offset}`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async deleteJob(jobId) {
    const res = await fetch(`${BASE_URL}/jobs/${jobId}`, {
      method: "DELETE",
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async renameJob(jobId, newName) {
    const res = await fetch(`${BASE_URL}/jobs/${jobId}/rename`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({ new_name: newName }),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async getJobsCount(username = null) {
    const url = username ? `${BASE_URL}/jobs/count?username=${username}` : `${BASE_URL}/jobs/count`;
    const res = await fetch(url, { headers: getHeaders(), credentials: "include" });
    return handleResponse(res);
  },

  // --- AI Detection ---
  /**
   * Gọi unified YOLO segmentation pipeline (predict_seg).
   * Trả về: [{filename, pages: [{objects: [...]}]}]
   */
  async floorAIDetect(imageBlob, confidence = "0.05") {
    const fd = new FormData();
    fd.append("files", imageBlob);
    fd.append("confidence", confidence);
    const res = await fetch(`${BASE_URL}/predict_seg`, {
      method: "POST",
      headers: getHeaders(null),
      body: fd,
      credentials: "include"
    });
    return handleResponse(res);
  },


  async autoDetectDoors(imageBlob, confidence = "0.3", realScale = 1.0) {
    const fd = new FormData();
    fd.append("file", imageBlob);
    fd.append("confidence", confidence);
    fd.append("real_scale", realScale || 1.0);
    const res = await fetch(`${BASE_URL}/predict_door`, {
      method: "POST",
      headers: getHeaders(null),
      body: fd,
      credentials: "include"
    });
    return handleResponse(res);
  },

  async detectDoorSeg(imageBlob, confidence = "0.25") {
    const fd = new FormData();
    fd.append("file", imageBlob);
    fd.append("confidence", confidence);
    const res = await fetch(`${BASE_URL}/api/door-segment`, {
      method: "POST",
      headers: getHeaders(null),
      body: fd,
      credentials: "include"
    });
    return handleResponse(res);
  },

  async detectWallSeg(imageBlob, confidence = "0.25", realScale = 1.0) {
    const fd = new FormData();
    fd.append("file", imageBlob);
    fd.append("confidence", confidence);
    fd.append("real_scale", realScale || 1.0);
    const res = await fetch(`${BASE_URL}/api/wall-segment`, {
      method: "POST",
      headers: getHeaders(null),
      body: fd,
      credentials: "include"
    });
    return handleResponse(res);
  },

  async detectWallSegStream(imageBlob, confidence = "0.25", realScale = 1.0, wallThicknesses = null, onEvent, signal = null, roiRect = null) {
    const fd = new FormData();
    fd.append("file", imageBlob);
    fd.append("confidence", confidence);
    fd.append("real_scale", realScale || 1.0);
    if (wallThicknesses) {
      fd.append("ext_thickness", wallThicknesses.ext || 90);
      fd.append("int_thickness", wallThicknesses.int || 70);
      fd.append("part_thickness", wallThicknesses.part || 70);
    }
    if (roiRect) {
      fd.append("roi_x", roiRect.x);
      fd.append("roi_y", roiRect.y);
      fd.append("roi_w", roiRect.w);
      fd.append("roi_h", roiRect.h);
      fd.append("roi_padding", 48);
    }

    const res = await fetch(`${BASE_URL}/predict_wall_stream`, {
      method: "POST",
      headers: getHeaders(null),
      body: fd,
      credentials: "include",
      signal: signal
    });

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            onEvent(parsed);
          } catch (e) {
            console.error("Failed to parse NDJSON line:", line, e);
          }
        }
      }
    }

    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        onEvent(parsed);
      } catch (e) {
        console.error("Failed to parse final NDJSON buffer:", buffer, e);
      }
    }
  },

  async autoDetectText(imageBlob, confidence = "0.001") {
    const fd = new FormData();
    fd.append("file", imageBlob);
    fd.append("confidence", confidence);
    const res = await fetch(`${BASE_URL}/predict_text`, {
      method: "POST",
      headers: getHeaders(null),
      body: fd,
      credentials: "include"
    });
    return handleResponse(res);
  },

  async templateDetect(imageBlob, confidence = "0.3") {
    const fd = new FormData();
    fd.append("file", imageBlob);
    fd.append("confidence", confidence);
    const res = await fetch(`${BASE_URL}/predict_template`, {
      method: "POST",
      headers: getHeaders(null),
      body: fd,
      credentials: "include"
    });
    return handleResponse(res);
  },

  // ═══════════════════════════════════════════════════
  // ROI-Based Detection
  // ═══════════════════════════════════════════════════

  async floorAIDetectStream(imageBlob, confidence = "0.05", roi = null, padding = 128, upscale = 1.0, existingRooms = null, onEvent, signal) {
    const fd = new FormData();
    fd.append("file", imageBlob);
    fd.append("confidence", confidence);
    if (roi) {
      fd.append("roi_x", roi.x);
      fd.append("roi_y", roi.y);
      fd.append("roi_w", roi.w);
      fd.append("roi_h", roi.h);
    }
    fd.append("roi_padding", padding);
    fd.append("upscale_factor", upscale);
    if (existingRooms) {
      fd.append("existing_rooms", JSON.stringify(existingRooms));
    }

    const res = await fetch(`${BASE_URL}/predict_seg_stream`, {
      method: "POST",
      headers: getHeaders(null),
      body: fd,
      credentials: "include",
      signal: signal
    });

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      
      buffer = lines.pop();

      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            onEvent(parsed);
          } catch (e) {
            console.error("Failed to parse NDJSON line:", line, e);
          }
        }
      }
    }

    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        onEvent(parsed);
      } catch (e) {
        console.error("Failed to parse final NDJSON buffer:", buffer, e);
      }
    }
  },

  async floorAIDetectROI(imageBlob, confidence = "0.01", roi, padding = 128, upscale = 1.0, existingRooms = null, options = {}) {
    const fd = new FormData();
    fd.append("files", imageBlob);
    fd.append("confidence", confidence);
    if (roi) {
      fd.append("roi_x", roi.x);
      fd.append("roi_y", roi.y);
      fd.append("roi_w", roi.w);
      fd.append("roi_h", roi.h);
    }
    fd.append("roi_padding", padding);
    fd.append("upscale_factor", upscale);
    if (existingRooms) {
      fd.append("existing_rooms", JSON.stringify(existingRooms));
    }
    const res = await fetch(`${BASE_URL}/predict_seg_roi`, {
      method: "POST", headers: getHeaders(null), body: fd, credentials: "include", signal: options.signal
    });
    return handleResponse(res);
  },


  async autoDetectDoorsROI(imageBlob, confidence = "0.2", roi, padding = 48, realScale = 1.0, options = {}) {
    const fd = new FormData();
    fd.append("file", imageBlob);
    fd.append("confidence", confidence);
    if (roi) {
      fd.append("roi_x", roi.x);
      fd.append("roi_y", roi.y);
      fd.append("roi_w", roi.w);
      fd.append("roi_h", roi.h);
    }
    fd.append("roi_padding", padding);
    fd.append("real_scale", realScale || 1.0);
    const res = await fetch(`${BASE_URL}/predict_door_roi`, {
      method: "POST", headers: getHeaders(null), body: fd, credentials: "include", signal: options.signal
    });
    return handleResponse(res);
  },

  async getROIHeatmap() {
    const res = await fetch(`${BASE_URL}/roi-heatmap`, {
      headers: getHeaders(), credentials: "include"
    });
    return handleResponse(res);
  },

  async clearROIHeatmap() {
    const res = await fetch(`${BASE_URL}/roi-heatmap`, {
      method: "DELETE", headers: getHeaders(), credentials: "include"
    });
    return handleResponse(res);
  },

  async searchText(payload) {
    const res = await fetch(`${BASE_URL}/api/search/text`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async searchObject(payload) {
    const res = await fetch(`${BASE_URL}/api/search/object`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async searchCount(payload) {
    const res = await fetch(`${BASE_URL}/api/search/count`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async getSearchHistory(projectId) {
    const res = await fetch(`${BASE_URL}/api/search/history/${projectId}`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async generateRoomsFromWalls(walls, doors = [], texts = [], gapThreshold = 120) {
    const res = await fetch(`${BASE_URL}/api/generate-rooms-from-walls`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        walls,
        doors,
        texts,
        gap_threshold: gapThreshold
      }),
      credentials: "include"
    });
    return handleResponse(res);
  }
};
