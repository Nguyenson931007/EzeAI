const getBaseUrl = () => {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE_URL?.trim()) {
    return process.env.NEXT_PUBLIC_API_BASE_URL.trim();
  }
  // Bằng cách trả về chuỗi rỗng "", trình duyệt sẽ gọi URL tương đối (relative path).
  // Yêu cầu sẽ đi qua cổng 3011 của Next.js và được proxy nội bộ về cổng 8090 của Backend.
  // Điều này tránh được lỗi CORS và giúp bạn không cần phải mở cổng 8090 trên Router.
  return "";
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
      const errData = await res.json();
      throw new Error(errData.detail || `Server returned error ${res.status}`);
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

  async tasklistSSO(payloadOrToken) {
    const body = typeof payloadOrToken === "string" ? { token: payloadOrToken } : payloadOrToken;
    const res = await fetch(`${BASE_URL}/api/auth/tasklist-sso`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    return res;
  },

  async getJobByEmsId(emsId) {
    const res = await fetch(`${BASE_URL}/jobs/open-by-ems/${encodeURIComponent(emsId)}`, {
      headers: getHeaders(),
      credentials: "include",
    });
    return handleResponse(res);
  },

  async getTaskListJobs(maNv = null, search = null, limit = 2000, forceRefresh = false) {
    const params = new URLSearchParams();
    if (maNv) params.append("ma_nv", maNv);
    if (search) params.append("search", search);
    if (limit) params.append("limit", limit);
    if (forceRefresh) params.append("force_refresh", "true");
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${BASE_URL}/jobs/tasklist-jobs${qs}`, {
      headers: getHeaders(),
      credentials: "include",
    });
    return handleResponse(res);
  },

  async fetchTaskListJobs(limit = 2000, forceRefresh = false) {
    return this.getTaskListJobs(null, null, limit, forceRefresh);
  },

  async getJobProgressReport(params = {}) {
    const qs = new URLSearchParams();
    if (params.startDate) qs.append("start_date", params.startDate);
    if (params.endDate) qs.append("end_date", params.endDate);
    if (params.username) qs.append("username", params.username);
    if (params.search) qs.append("search", params.search);
    if (params.status) qs.append("status", params.status);
    if (params.limit) qs.append("limit", params.limit);
    const queryString = qs.toString() ? `?${qs.toString()}` : "";
    const res = await fetch(`${BASE_URL}/jobs/progress-report${queryString}`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },
  // --- User Profile & Account ---
  async getMyProfile() {
    const res = await fetch(`${BASE_URL}/users/me`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async updateMyProfile(profileData) {
    const res = await fetch(`${BASE_URL}/users/me`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(profileData),
      credentials: "include"
    });
    return handleResponse(res);
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

  async exportProcurement(payload) {
    const res = await fetch(`${BASE_URL}/jobs/export-procurement`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return res.json();
  },

  async getProcurementSsoToken(maNv = "EZE0090") {
    const res = await fetch(`${BASE_URL}/api/auth/procurement-sso-token`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ ma_nv: maNv }),
      credentials: "include"
    });
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

  async findJob(query) {
    const res = await fetch(`${BASE_URL}/jobs/find?query=${encodeURIComponent(query)}`, {
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

  async getJobHistory() {
    const res = await fetch(`${BASE_URL}/jobs/history`, {
      headers: getHeaders(),
      credentials: "include"
    });
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

  async autoDetectRoof(imageBlob, confidence = "0.15") {
    const fd = new FormData();
    fd.append("file", imageBlob);
    fd.append("confidence", confidence);
    const res = await fetch(`${BASE_URL}/predict_roof`, {
      method: "POST",
      headers: getHeaders(null),
      body: fd,
      credentials: "include"
    });
    return handleResponse(res);
  },

  async detectDoorSeg(imageBlob, confidence = "0.25", realScale = 1.0) {
    const fd = new FormData();
    fd.append("file", imageBlob);
    fd.append("confidence", confidence);
    if (realScale) fd.append("real_scale", realScale);
    const res = await fetch(`${BASE_URL}/api/door-segment`, {
      method: "POST",
      headers: getHeaders(null),
      body: fd,
      credentials: "include"
    });
    return handleResponse(res);
  },

  async detectWallSeg(imageBlob, confidence = "0.25", realScale = 1.0, wallThicknesses = null) {
    const fd = new FormData();
    fd.append("file", imageBlob);
    fd.append("confidence", confidence);
    fd.append("real_scale", realScale || 1.0);
    if (wallThicknesses) {
      fd.append("ext_thickness", wallThicknesses.ext || 90);
      fd.append("int_thickness", wallThicknesses.int || 70);
      fd.append("part_thickness", wallThicknesses.part || 70);
    }
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
      await handleResponse(res);
      return;
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

  async autoDetectText(imageBlob, confidence = "0.001", roi = null) {
    const fd = new FormData();
    fd.append("file", imageBlob);
    fd.append("confidence", confidence);
    if (roi && roi.w > 0 && roi.h > 0) {
      fd.append("roi_x", roi.x);
      fd.append("roi_y", roi.y);
      fd.append("roi_w", roi.w);
      fd.append("roi_h", roi.h);
    }
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
      await handleResponse(res);
      return;
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

  async generateRoomsFromWalls(walls, doors = [], texts = [], gapThreshold = 120, imageBase64 = null, naturalWidth = null, naturalHeight = null) {
    const res = await fetch(`${BASE_URL}/api/generate-rooms-from-walls`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        walls,
        doors,
        texts,
        gap_threshold: gapThreshold,
        image_base64: imageBase64,
        natural_width: naturalWidth,
        natural_height: naturalHeight
      }),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async createRoomAtPoint(x, y, walls, doors = [], texts = [], gapThreshold = 120) {
    const res = await fetch(`${BASE_URL}/api/create-room-at-point`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        x, y,
        walls,
        doors,
        texts,
        gap_threshold: gapThreshold
      }),
      credentials: "include"
    });
    return handleResponse(res);
  },

  // ── FrameWork Jobs (MSSQL emsflow) ──
  async fetchFrameworkJobs() {
    const res = await fetch(`${BASE_URL}/api/framework/jobs`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async checkFrameworkHealth() {
    const res = await fetch(`${BASE_URL}/api/framework/health`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async saveFrameworkWall(payload) {
    const res = await fetch(`${BASE_URL}/api/framework/save`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async saveFrameworkJobs(payload) {
    const res = await fetch(`${BASE_URL}/api/framework/save-jobs`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  // ── AreaSummary Jobs (MSSQL emsflow) ──
  async fetchAreaSummaryJobs() {
    const res = await fetch(`${BASE_URL}/api/area-summary/jobs`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async saveAreaSummaryJobs(payload) {
    const res = await fetch(`${BASE_URL}/api/area-summary/save-jobs`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  // ── Insulation Jobs (MSSQL emsflow) ──
  async fetchInsulationJobs() {
    const res = await fetch(`${BASE_URL}/api/insulation/jobs`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async saveInsulationJobs(payload) {
    const res = await fetch(`${BASE_URL}/api/insulation/save-jobs`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async calculateInsulation(payload) {
    const res = await fetch(`${BASE_URL}/api/insulation/calculate`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  // ── LockOut Jobs (MSSQL emsflow) ──
  async fetchLockoutJobs() {
    const res = await fetch(`${BASE_URL}/api/lockout/jobs`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async saveLockoutJobs(payload) {
    const res = await fetch(`${BASE_URL}/api/lockout/save-jobs`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async calculateLockout(payload) {
    const res = await fetch(`${BASE_URL}/api/lockout/calculate`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  // ── Roof V3 Engine API Endpoints ──
  async computeRoof2D(payload) {
    const res = await fetch(`${BASE_URL}/api/v3/compute-roof`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async buildRoof3D(payload) {
    const res = await fetch(`${BASE_URL}/api/v3/build-planes`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async trimRoofEave(payload) {
    const res = await fetch(`${BASE_URL}/api/v3/trim-eave`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async optimizeRoofGraph(payload) {
    const res = await fetch(`${BASE_URL}/api/v3/optimize-graph`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  }
};

