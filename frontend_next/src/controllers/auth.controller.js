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
          session_token: data.session_token
        };
        setIsLoggedIn(true);
        setUser(userData);
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("user", JSON.stringify(userData));
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
    try {
      if (user && user.username) {
        await ApiService.logout(user.username);
      }
    } catch (err) {
      console.error("Logout error:", err);
    }
    await clearWorkspaceState();
    setIsLoggedIn(false);
    setUser(null);
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("user");
    localStorage.removeItem("activeTab");
    localStorage.removeItem("ezefloor_last_active_job_id");
    localStorage.removeItem("ezefloor_last_active_project_name");
    localStorage.removeItem("ezefloor_last_active_current_page");
    sessionStorage.removeItem("pendingEmsJob");
    window.location.reload();
  };

  return { handleLogin, handleLogout };
};
