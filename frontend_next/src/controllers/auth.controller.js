/**
 * auth.controller.js – Authentication Controller
 * ================================================
 * Quản lý đăng nhập/đăng xuất:
 *   - handleLogin:  Đăng nhập hoặc đăng ký, lưu session vào cookie
 *   - handleLogout: Đăng xuất, xóa session, reload trang
 */
import { ApiService } from "@/models/api.service";
import { clearWorkspaceState } from "@/utils/workspaceStorage";

export const useAuthController = (user, setUser, setIsLoggedIn) => {
  const handleLogin = async (authData, isSignup) => {
    try {
      const data = isSignup 
        ? await ApiService.signup(authData)
        : await ApiService.login(authData);

      if (data.status === "success") {
        const userData = { 
          username: data.username, 
          role: data.role,
          ma_nv: data.manv || data.ma_nv || data.MaNV || "",
          bophanlogin: data.bophanlogin || data.bophan || "",
          session_token: data.session_token
        };
        setIsLoggedIn(true);
        setUser(userData);
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("user", JSON.stringify(userData));
        if (authData.password) {
          sessionStorage.setItem("session_auth_key", authData.password);
        }
        return { success: true };
      } else {
        if (data.detail && data.detail.includes("quá số lần")) {
          return { success: false, locked: true, message: data.detail };
        }
        alert(data.detail || "Authentication failed");
        return { success: false, locked: false };
      }
    } catch (err) {
      console.error("Auth error:", err);
      return { success: false, locked: false };
    }
  };

  const handleLogout = async () => {
    // 1. Lấy username trước khi xóa bất cứ thứ gì
    const username = user?.username || (() => {
      try { return JSON.parse(localStorage.getItem("user") || "{}")?.username; } catch { return null; }
    })();

    // 2. Xóa localStorage NGAY LẬP TỨC (trước khi reload để không bị race condition)
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("user");
    localStorage.removeItem("activeTab");
    localStorage.removeItem("ezefloor_last_active_job_id");
    localStorage.removeItem("ezefloor_last_active_project_name");
    localStorage.removeItem("ezefloor_last_active_current_page");
    sessionStorage.clear();

    // 3. Cập nhật React state ngay
    setIsLoggedIn(false);
    setUser(null);

    // 4. Gọi backend logout (fire-and-forget, không block UI)
    if (username) {
      ApiService.logout(username).catch(err => console.warn("[Logout] Backend error:", err));
    }

    // 5. Xóa IndexedDB workspace (không cần await — reload sẽ clean up)
    clearWorkspaceState().catch(() => {});

    // 6. Reload trang để về màn hình đăng nhập
    window.location.reload();
  };

  return { handleLogin, handleLogout };
};
