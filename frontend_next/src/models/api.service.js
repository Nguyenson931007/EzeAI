import { APP_CONFIG } from "../config/appConfig";

// Public API origin is configured once in the repository-level .env.
// Empty means same-origin requests through the Next.js rewrite proxy.
export const BASE_URL = APP_CONFIG.apiBaseUrl;

export const getHeaders = (contentType = "application/json") => {
  const userStr = localStorage.getItem("user");
  const headers = {};
  if (contentType) headers["Content-Type"] = contentType;
  const activeUnit = localStorage.getItem("ezefloor_active_work_pack_unit");
  if (activeUnit) headers["X-Work-Pack-Unit"] = activeUnit;

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
    // Reload về trang chủ (app dùng isLoggedIn state, không có route /login riêng)
    window.location.reload();
    return { detail: "Unauthorized" };
  }

  if (!res.ok) {
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const errData = await res.json();
      let errorMsg = "";
      if (typeof errData.detail === "string") {
        errorMsg = errData.detail;
      } else if (Array.isArray(errData.detail)) {
        errorMsg = errData.detail.map(d => (d.loc ? `${d.loc.join('.')}: ` : '') + (d.msg || JSON.stringify(d))).join("; ");
      } else if (errData.detail && typeof errData.detail === "object") {
        errorMsg = JSON.stringify(errData.detail);
      } else if (errData.message) {
        errorMsg = errData.message;
      } else {
        errorMsg = JSON.stringify(errData);
      }
      throw new Error(errorMsg || `Server returned error ${res.status}`);
    } else {
      const text = await res.text();
      throw new Error(`Server returned ${res.status}: ${text}`);
    }
  }
  return res.json();
};

export const ApiService = {
  async login(authData) {
    try {
      const res = await fetch(`${BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authData)
      });
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return await res.json();
      }
      return {
        detail: "Unable to connect to Backend Server (Port 8090). Please check that the backend is running."
      };
    } catch (err) {
      return {
        detail: `Backend connection error: ${err.message}. Please start the backend on port 8090.`
      };
    }
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
    try {
      // Không dùng handleResponse ở đây vì kể cả backend lỗi, ta vẫn phải logout được
      const res = await fetch(`${BASE_URL}/logout`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ username }),
        credentials: "include"
      });
      const data = await res.json().catch(() => ({}));
      return data;
    } catch (err) {
      console.warn("[Logout] Backend không phản hồi, vẫn tiếp tục logout client-side:", err);
      return {};
    }
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
    try {
      const res = await fetch(`${BASE_URL}/jobs/open-by-ems/${encodeURIComponent(emsId)}?_=${Date.now()}`, {
        cache: "no-store",
        headers: {
          ...getHeaders(),
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
        credentials: "include",
      });
      if (res.status === 401) {
        console.warn("[getJobByEmsId] 401 Unauthorized khi tải Job EMS:", emsId);
        return null;
      }
      // Pure read: do not mutate pendingEmsJob/customer context here.
      // The caller that owns the job click must merge the exact Task HW card
      // Client first, then update project + customer atomically. Side effects
      // here used to race with the click handler and could leave the old client
      // in the ribbon while a different job was already open.
      const result = await handleResponse(res);
      return result;
    } catch (err) {
      console.warn("[getJobByEmsId] Lỗi khi tải Job EMS:", err);
      return null;
    }
  },


  async getWorkPackUnits(customerId, jobId) {
    const res = await fetch(`${BASE_URL}/api/work-pack-units/${encodeURIComponent(customerId)}/jobs/${encodeURIComponent(jobId)}?_=${Date.now()}`, {
      cache: "no-store", headers: { ...getHeaders(), "Cache-Control": "no-cache" }, credentials: "include"
    });
    return handleResponse(res);
  },

  async addWorkPackUnit(customerId, jobId, unit = null) {
    const res = await fetch(`${BASE_URL}/api/work-pack-units/${encodeURIComponent(customerId)}/jobs/${encodeURIComponent(jobId)}`, {
      method: "POST", headers: getHeaders(), credentials: "include",
      body: JSON.stringify({ unit })
    });
    return handleResponse(res);
  },

  async renameWorkPackUnit(customerId, jobId, unit, newUnit) {
    const res = await fetch(`${BASE_URL}/api/work-pack-units/${encodeURIComponent(customerId)}/jobs/${encodeURIComponent(jobId)}/units/${encodeURIComponent(unit)}/rename`, {
      method: "POST", headers: getHeaders(), credentials: "include",
      body: JSON.stringify({ new_unit: newUnit })
    });
    return handleResponse(res);
  },

  async updateTaskModules(emsId, taskModules = []) {
    const res = await fetch(`${BASE_URL}/jobs/ems/${encodeURIComponent(emsId)}/task-modules`, {
      method: "PUT",
      headers: {
        ...getHeaders(),
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ task_modules: taskModules }),
    });
    return handleResponse(res);
  },

  async updateTaskFloorLevels(emsId, floorLevels = ["GF"]) {
    let taskListToken = "";
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      taskListToken = String(user.tasklist_token || localStorage.getItem("tasklist_token") || "").trim();
    } catch (_) {}
    const res = await fetch(`${BASE_URL}/jobs/ems/${encodeURIComponent(emsId)}/floor-levels`, {
      method: "PUT",
      headers: {
        ...getHeaders(),
        "Content-Type": "application/json",
        ...(taskListToken ? { "X-TaskList-Token": taskListToken } : {})
      },
      credentials: "include",
      body: JSON.stringify({ floor_levels: floorLevels }),
    });
    return handleResponse(res);
  },

  async getTaskFloorLevels(emsId) {
    let taskListToken = "";
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      taskListToken = String(user.tasklist_token || localStorage.getItem("tasklist_token") || "").trim();
    } catch (_) {}
    const res = await fetch(`${BASE_URL}/jobs/ems/${encodeURIComponent(emsId)}/floor-levels?_=${Date.now()}`, {
      cache: "no-store",
      headers: {
        ...getHeaders(),
        ...(taskListToken ? { "X-TaskList-Token": taskListToken } : {}),
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      credentials: "include",
    });
    // This is a background poll. During login/logout there can briefly be no
    // session, which must not trigger the global 401 dialog or force a reload.
    if (res.status === 401) return { status: "unauthorized", data: null };
    return handleResponse(res);
  },

  async getTaskListJobs(maNv = null, search = null, limit = 500, forceRefresh = false) {
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

  async fetchTaskListJobs(limit = 500, forceRefresh = false, search = null) {
    return this.getTaskListJobs(null, search, limit, forceRefresh);
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

  async getProcurementSsoToken(maNv = APP_CONFIG.ssoDefaultEmployeeId) {
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
    try {
      const res = await fetch(`${BASE_URL}/jobs/find?query=${encodeURIComponent(query)}`, {
        headers: getHeaders(),
        credentials: "include"
      });
      if (res.status === 401 || !res.ok) {
        return { status: "success", found: false, job_id: null, data: null };
      }
      return await res.json();
    } catch (err) {
      console.warn("[ApiService.findJob] Query error:", err);
      return { status: "success", found: false, job_id: null, data: null };
    }
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

  async detectDoorSeg(imageBlob, confidence = "0.25", realScale = 1.0, roiRect = null, options = {}) {
    const fd = new FormData();
    fd.append("file", imageBlob);
    fd.append("confidence", confidence);
    if (realScale) fd.append("real_scale", realScale);
    if (roiRect) {
      fd.append("roi_x", roiRect.x);
      fd.append("roi_y", roiRect.y);
      fd.append("roi_w", roiRect.w);
      fd.append("roi_h", roiRect.h);
      fd.append("roi_padding", 48);
    }
    const res = await fetch(`${BASE_URL}/api/door-segment`, {
      method: "POST",
      headers: getHeaders(null),
      body: fd,
      credentials: "include",
      signal: options.signal
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

  async rebuildWallsWithOpenAI(imageBlob, realScale = 1.0, wallThicknesses = null, existingWalls = [], pageContext = null, signal = null, confidence = "0.001") {
    const fd = new FormData();
    fd.append("file", imageBlob);

    // Keep this multipart field strictly numeric. The wall controller passes
    // existingWalls + pageContext before the AbortSignal; the old signature
    // interpreted pageContext as confidence and serialized it as
    // "[object Object]", which FastAPI correctly rejected as a float.
    const parsedConfidence = Number(confidence);
    fd.append("confidence", Number.isFinite(parsedConfidence) ? String(parsedConfidence) : "0.001");
    fd.append("real_scale", realScale || 1.0);
    if (wallThicknesses) {
      fd.append("ext_thickness", wallThicknesses.ext || 90);
      fd.append("int_thickness", wallThicknesses.int || 70);
      fd.append("part_thickness", wallThicknesses.part || 70);
    }
    try {
      const compactWalls = (existingWalls || []).slice(0, 300).map(w => ({
        class_name: w.class_name || w.wall_type,
        centerline: w.centerline,
        confidence: w.confidence
      }));
      fd.append("existing_walls", JSON.stringify(compactWalls));
    } catch (e) {
      fd.append("existing_walls", "[]");
    }
    try {
      fd.append("page_context", JSON.stringify(pageContext || {}));
    } catch (e) {
      fd.append("page_context", "{}");
    }
    const res = await fetch(`${BASE_URL}/api/openai/rebuild-walls`, {
      method: "POST",
      headers: getHeaders(null),
      body: fd,
      credentials: "include",
      ...(typeof AbortSignal !== "undefined" && signal instanceof AbortSignal ? { signal } : {}),
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
    return this.detectDoorSeg(imageBlob, confidence, realScale, roi, options);
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

  // ── Eaves & Soffit Jobs (MSSQL ProcurementApp.dbo.EavesSoffit) ──
  async fetchEavesJobs(office = APP_CONFIG.defaultOfficeCode) {
    const url = office ? `${BASE_URL}/api/eaves/jobs?office=${encodeURIComponent(office)}` : `${BASE_URL}/api/eaves/jobs`;
    const res = await fetch(url, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async checkEavesHealth() {
    const res = await fetch(`${BASE_URL}/api/eaves/health`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async saveEavesSingle(payload) {
    const res = await fetch(`${BASE_URL}/api/eaves/save`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async saveEavesJobs(payload) {
    const res = await fetch(`${BASE_URL}/api/eaves/save-jobs`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async calculateEaves(payload) {
    const res = await fetch(`${BASE_URL}/api/eaves/calculate`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  // ── Cladding Jobs (MSSQL ProcurementApp.dbo.Cladding) ──
  async fetchCladdingJobs(office = null) {
    const url = office ? `${BASE_URL}/api/cladding/jobs?office=${encodeURIComponent(office)}` : `${BASE_URL}/api/cladding/jobs`;
    const res = await fetch(url, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async checkCladdingHealth() {
    const res = await fetch(`${BASE_URL}/api/cladding/health`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async saveCladdingSingle(payload) {
    const res = await fetch(`${BASE_URL}/api/cladding/save`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async saveCladdingJobs(payload) {
    const res = await fetch(`${BASE_URL}/api/cladding/save-jobs`, {
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

  // ── AreaSummary Jobs (MSSQL ProcurementApp) ──
  async fetchAreaSummaryJobs(office = null) {
    const url = office ? `${BASE_URL}/api/area-summary/jobs?office=${encodeURIComponent(office)}` : `${BASE_URL}/api/area-summary/jobs`;
    const res = await fetch(url, {
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
  async fetchLockoutJobs(jobNumber = null) {
    const qs = jobNumber ? `?job_number=${encodeURIComponent(jobNumber)}` : "";
    const res = await fetch(`${BASE_URL}/api/lockout/jobs${qs}`, {
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

  // ── Fixout Jobs (MSSQL ProcurementApp) ──
  async fetchFixoutJobs(idJobHw = null, office = null) {
    const params = new URLSearchParams();
    if (idJobHw) params.append("id_job_hw", idJobHw);
    if (office) params.append("office", office);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${BASE_URL}/api/fixout/jobs${qs}`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async saveFixoutJobs(payload) {
    const res = await fetch(`${BASE_URL}/api/fixout/save-jobs`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  // ── TimberPosts Jobs (MSSQL ProcurementApp) ──
  async fetchTimberPostsJobs(office = null) {
    const qs = office ? `?office=${encodeURIComponent(office)}` : "";
    const res = await fetch(`${BASE_URL}/api/timber-posts/jobs${qs}`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async saveTimberPostsJobs(payload) {
    const res = await fetch(`${BASE_URL}/api/timber-posts/jobs/save`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  // ── Shelving Jobs (MSSQL ProcurementApp) ──
  async fetchShelvingJobs(idJobHw = null, office = null) {
    const params = new URLSearchParams();
    if (idJobHw) params.append("id_job_hw", idJobHw);
    if (office) params.append("office", office);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${BASE_URL}/api/shelving/jobs${qs}`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async saveShelvingJobs(payload) {
    const res = await fetch(`${BASE_URL}/api/shelving/save-jobs`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  // ── FOW Plumbing Jobs (MSSQL ProcurementApp) ──
  async fetchFowPlumbingJobs(idJobHw = null, office = null) {
    const params = new URLSearchParams();
    if (idJobHw) params.append("id_job_hw", idJobHw);
    if (office) params.append("office", office);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${BASE_URL}/api/fow-plumbing/jobs${qs}`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async saveFowPlumbingJobs(payload) {
    const res = await fetch(`${BASE_URL}/api/fow-plumbing/save-jobs`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      credentials: "include"
    });
    return handleResponse(res);
  },

  // ── Power Truss Braces Jobs (MSSQL ProcurementApp) ──
  async fetchPowerTrussJobs(idJobHw = null, office = null) {
    const params = new URLSearchParams();
    if (idJobHw) params.append("id_job_hw", idJobHw);
    if (office) params.append("office", office);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${BASE_URL}/api/power-truss/jobs${qs}`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async savePowerTrussJobs(payload) {
    const res = await fetch(`${BASE_URL}/api/power-truss/save-jobs`, {
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
  },

  async getCatalog(customerId, taskKey) {
    const res = await fetch(`${BASE_URL}/data-find/using?customer_id=${encodeURIComponent(customerId)}&task_key=${encodeURIComponent(taskKey)}`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async getProcurementCustomers() {
    const res = await fetch(`${BASE_URL}/workflow/customers`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async getProcurementTasks(customerId) {
    const res = await fetch(`${BASE_URL}/workflow/customers/${encodeURIComponent(customerId)}/tasks`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async getUsingFindItems(customerId, taskKey) {
    const res = await fetch(`${BASE_URL}/data-find/using?customer_id=${encodeURIComponent(customerId)}&task_key=${encodeURIComponent(taskKey)}`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async getUsingFindItemsForCustomer(customerId) {
    const res = await fetch(`${BASE_URL}/data-find/using/all?customer_id=${encodeURIComponent(customerId)}`, {
      headers: getHeaders(),
      credentials: "include"
    });
    return handleResponse(res);
  },


  async planAiAgentTask({ instruction, taskKey, taskSchema, currentData = null, localAiData = null, catalogContext = null, imageBlob = null, model = null }) {
    const fd = new FormData();
    fd.append("instruction", instruction || "");
    fd.append("task_key", taskKey || "");
    fd.append("task_schema", JSON.stringify(taskSchema || {}));
    if (currentData != null) fd.append("current_data", JSON.stringify(currentData));
    if (localAiData != null) fd.append("local_ai_data", JSON.stringify(localAiData));
    if (catalogContext != null) fd.append("catalog_context", JSON.stringify(catalogContext));
    if (model) fd.append("model", model);
    if (imageBlob) fd.append("file", imageBlob);
    const res = await fetch(`${BASE_URL}/api/ai/agent/plan`, {
      method: "POST",
      headers: getHeaders(null),
      body: fd,
      credentials: "include"
    });
    return handleResponse(res);
  },
  async reviewDocumentWithAI({ file, selectedPages = [], customer = "", tasks = {}, projectContext = {}, evidenceRules = {}, model = null, signal = undefined, useYolo = false }) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("selected_pages", JSON.stringify(selectedPages));
    fd.append("customer", customer || "");
    fd.append("tasks", JSON.stringify(tasks || {}));
    fd.append("project_context", JSON.stringify(projectContext || {}));
    fd.append("evidence_rules", JSON.stringify(evidenceRules || {}));
    if (model) fd.append("model", model);
    fd.append("use_yolo", useYolo ? "true" : "false");
    const res = await fetch(`${BASE_URL}/api/ai/plan/document-review`, {
      method: "POST",
      headers: getHeaders(null),
      body: fd,
      credentials: "include",
      signal,
    });
    return handleResponse(res);
  },

  async reviewPlanWithAI({
    file,
    pageIndex = 0,
    realScale = 1.0,
    wallConfidence = 0.001,
    openingConfidence = 0.02,
    runLocalDetection = true,
    localAiData = null,
    knownFormSchemas = null,
    pageContext = null,
    model = null,
  }) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("page_index", String(pageIndex));
    fd.append("real_scale", String(realScale));
    fd.append("wall_confidence", String(wallConfidence));
    fd.append("opening_confidence", String(openingConfidence));
    fd.append("run_local_detection", runLocalDetection ? "true" : "false");
    if (localAiData != null) fd.append("local_ai_data", JSON.stringify(localAiData));
    if (knownFormSchemas != null) fd.append("known_form_schemas", JSON.stringify(knownFormSchemas));
    if (pageContext != null) fd.append("page_context", JSON.stringify(pageContext));
    if (model) fd.append("model", model);
    const res = await fetch(`${BASE_URL}/api/ai/plan/review`, {
      method: "POST",
      headers: getHeaders(null),
      body: fd,
      credentials: "include",
    });
    return handleResponse(res);
  },

  async savePlanAiFeedback({ file, finalData, pageIndex = 0, sourceJob = null, addToYoloDataset = true }) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("final_data", JSON.stringify(finalData || {}));
    fd.append("page_index", String(pageIndex));
    fd.append("add_to_yolo_dataset", addToYoloDataset ? "true" : "false");
    if (sourceJob) fd.append("source_job", sourceJob);
    const res = await fetch(`${BASE_URL}/api/ai/plan/feedback`, {
      method: "POST",
      headers: getHeaders(null),
      body: fd,
      credentials: "include",
    });
    return handleResponse(res);
  },

  async getLockoutDoorTypes(customerId = "BUN-NSW-ACT") {
    const res = await fetch(`${BASE_URL}/api/lockout/door-types?customer_id=${encodeURIComponent(customerId)}`, {
      headers: getHeaders(null),
      credentials: "include"
    });
    return handleResponse(res);
  },

  async getLockoutOptions(customerId = "BUN-NSW-ACT") {
    const res = await fetch(`${BASE_URL}/api/lockout/options?customer_id=${encodeURIComponent(customerId)}`, {
      headers: getHeaders(null),
      credentials: "include"
    });
    return handleResponse(res);
  }
};

