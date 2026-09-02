/**
 * frontend_next/src/utils/permissions.js
 * =======================================
 * Quản lý phân quyền (Role-Based Access Control) cho EzeFloor theo bảng [emsflow].[dbo].[roles]:
 * 
 *  1  Admin           (Toàn quyền hệ thống, thấy tất cả các chức năng & trang Admin)
 *  2  Manager         (General Manager)
 *  3  Employee        (General Employee)
 *  4  Leader          (Team Leader)
 *  5  EmployeeSteel   (Employee dedicated to Steel Progress Reports)
 *  6  ManagerSteel    (Manager for Steel Progress Groups)
 *  7  LeaderSteel     (Leader for Steel Progress Groups)
 *  8  CheckerSteel    (Checker for Steel Progress Reports)
 *  9  AdminSteel      (Administrative View for Steel Progress Report - KHÔNG phải full Admin)
 * 10  Viewer          (Read-only access across all Admin pages)
 * 11  EmployeePryda   (Pryda training employee)
 * 12  CheckerPryda    (Pryda checker)
 * 13  LeaderHW        (Team Leader for HW Progress -> Có quyền HW)
 * 14  EmployeeHW      (Detailer for HW Progress    -> Có quyền HW)
 * 15  AdminHW         (Administrative View for HW Progress -> Có quyền HW)
 * 16  AdminDindas     (Administrative View for Dindas Progress)
 * 17  LeaderDindas    (Leader role for Dindas Task Group)
 * 18  EmployeeDindas  (Employee role for Dindas Task Group)
 * 19  AdminCSD        (Administrative View for CSD Progress Report)
 * 20  LeaderCSD       (Leader View for CSD Progress Report)
 * 21  EmployeeCSD     (Employee View for CSD Progress Report)
 */

export const ROLES_REGISTRY = {
  1: { id: 1, name: "Admin", slug: "admin", display: "Administrator", isFullAdmin: true, hasHw: true },
  2: { id: 2, name: "Manager", slug: "manager", display: "Manager", isFullAdmin: false, hasHw: false },
  3: { id: 3, name: "Employee", slug: "employee", display: "Employee", isFullAdmin: false, hasHw: false },
  4: { id: 4, name: "Leader", slug: "leader", display: "Leader (Team Leader)", isFullAdmin: false, hasHw: false },
  5: { id: 5, name: "EmployeeSteel", slug: "employeesteel", display: "EmployeeSteel", isFullAdmin: false, hasHw: false },
  6: { id: 6, name: "ManagerSteel", slug: "managersteel", display: "ManagerSteel", isFullAdmin: false, hasHw: false },
  7: { id: 7, name: "LeaderSteel", slug: "leadersteel", display: "LeaderSteel", isFullAdmin: false, hasHw: false },
  8: { id: 8, name: "CheckerSteel", slug: "checkersteel", display: "CheckerSteel", isFullAdmin: false, hasHw: false },
  9: { id: 9, name: "AdminSteel", slug: "adminsteel", display: "AdminSteel", isFullAdmin: false, hasHw: false },
  10: { id: 10, name: "Viewer", slug: "viewer", display: "Viewer (Read Only)", isFullAdmin: false, hasHw: false },
  11: { id: 11, name: "EmployeePryda", slug: "employeepryda", display: "EmployeePryda", isFullAdmin: false, hasHw: false },
  12: { id: 12, name: "CheckerPryda", slug: "checkerpryda", display: "CheckerPryda", isFullAdmin: false, hasHw: false },
  13: { id: 13, name: "LeaderHW", slug: "leaderhw", display: "LeaderHW (Leader HW Progress)", isFullAdmin: false, hasHw: true },
  14: { id: 14, name: "EmployeeHW", slug: "employeehw", display: "EmployeeHW (Detailer HW Progress)", isFullAdmin: false, hasHw: true },
  15: { id: 15, name: "AdminHW", slug: "adminhw", display: "AdminHW (Admin HW Progress)", isFullAdmin: false, hasHw: true },
  16: { id: 16, name: "AdminDindas", slug: "admindindas", display: "AdminDindas", isFullAdmin: false, hasHw: false },
  17: { id: 17, name: "LeaderDindas", slug: "leaderdindas", display: "LeaderDindas", isFullAdmin: false, hasHw: false },
  18: { id: 18, name: "EmployeeDindas", slug: "employeedindas", display: "EmployeeDindas", isFullAdmin: false, hasHw: false },
  19: { id: 19, name: "AdminCSD", slug: "admincsd", display: "AdminCSD", isFullAdmin: false, hasHw: false },
  20: { id: 20, name: "LeaderCSD", slug: "leadercsd", display: "LeaderCSD", isFullAdmin: false, hasHw: false },
  21: { id: 21, name: "EmployeeCSD", slug: "employeecsd", display: "EmployeeCSD", isFullAdmin: false, hasHw: false },
};

// Map theo slug để tra cứu nhanh
const SLUG_TO_ROLE = Object.values(ROLES_REGISTRY).reduce((acc, r) => {
  acc[r.slug] = r;
  acc[r.name.toLowerCase()] = r;
  return acc;
}, {});

/**
 * Tìm role item từ user (theo role_id hoặc role name/slug)
 */
function findRoleItem(user) {
  if (!user) return null;
  if (user.role_id && ROLES_REGISTRY[user.role_id]) {
    return ROLES_REGISTRY[user.role_id];
  }
  const raw = (user.role_name || user.role || "").trim().toLowerCase();
  if (raw && SLUG_TO_ROLE[raw]) {
    return SLUG_TO_ROLE[raw];
  }
  return null;
}

/**
 * Kiểm tra xem user có quyền Quản trị tối cao (Full Admin) hay không.
 * Chỉ ID 1 (Admin) hoặc các tài khoản admin/superadmin/quản trị viên có quyền toàn hệ thống.
 * @param {Object} user 
 * @returns {boolean}
 */
export function isFullAdmin(user) {
  if (!user) return false;

  // 1. Kiểm tra theo role_id (ID = 1 là Admin)
  if (Number(user.role_id) === 1) return true;

  // 2. Tra cứu theo bảng ROLES_REGISTRY
  const roleItem = findRoleItem(user);
  if (roleItem && roleItem.isFullAdmin) {
    return true;
  }

  // 3. Kiểm tra chuỗi role / role_name / username / ma_nv
  const rawRole = String(user.role || user.role_name || "").toLowerCase().trim();
  if (rawRole === "admin" || rawRole === "administrator" || rawRole === "superadmin" || rawRole === "quan_tri_vien") {
    return true;
  }

  // 4. Kiểm tra cờ IsManagement hoặc bophanlogin
  if (user.isManagement === 1 || user.is_management === 1 || user.isManagement === true || user.is_management === true) {
    // Nếu là admin hoặc không có role hạn chế riêng
    if (rawRole === "admin" || rawRole === "administrator" || !rawRole) return true;
  }

  const bophan = String(user.bophanlogin || user.bophan || "").toLowerCase().trim();
  if (bophan === "all" || bophan === "admin") return true;

  const manv = String(user.ma_nv || user.manv || user.username || "").toUpperCase().trim();
  if (manv === "EZE0001" || manv === "ADMIN" || manv.startsWith("ADMIN_") || manv.endsWith("_ADMIN")) {
    return true;
  }

  return false;
}

/**
 * Kiểm tra xem user có quyền xem và thao tác các tính năng Hardware Progress (HW) hay không.
 * - Admin (isFullAdmin): Có toàn quyền mọi module và tính năng HW
 * - bophanlogin là "HW" hoặc "All" hoặc "Admin"
 * - ID 13 (LeaderHW), ID 14 (EmployeeHW), ID 15 (AdminHW): Có quyền HW
 * @param {Object} user 
 * @returns {boolean}
 */
export function hasHwAccess(user) {
  if (!user) return false;

  // Full Admin luôn có quyền truy cập tất cả module HW
  if (isFullAdmin(user)) return true;

  const userBophan = String(user.bophanlogin || user.bophan || "").trim().toLowerCase();
  if (userBophan === "hw" || userBophan === "all" || userBophan === "admin") return true;

  const roleItem = findRoleItem(user);
  if (roleItem) {
    return !!roleItem.hasHw || !!roleItem.isFullAdmin;
  }

  const rawRole = String(user.role || user.role_name || "").toLowerCase().trim();
  if (rawRole === "admin" || rawRole === "administrator" || rawRole === "superadmin") return true;
  if (rawRole === "adminhw" || rawRole === "leaderhw" || rawRole === "employeehw") return true;
  if (rawRole.endsWith("hw") || rawRole.includes("hardware")) return true;

  return false;
}

/**
 * Kiểm tra quyền chỉnh sửa / xóa công việc trong các bảng báo cáo và tổng hợp
 * @param {Object} user
 * @returns {boolean}
 */
export function hasAdminPrivileges(user) {
  return isFullAdmin(user);
}

/**
 * Lấy tên hiển thị nhãn Role thân thiện trên giao diện.
 * @param {Object} user 
 * @returns {string}
 */
export function getDisplayRoleName(user) {
  if (!user) return "Guest";
  const roleItem = findRoleItem(user);
  if (roleItem) {
    return roleItem.name;
  }
  const rawRole = (user.role_name || user.role || "").trim();
  if (!rawRole) return "Project Estimator";
  return rawRole.charAt(0).toUpperCase() + rawRole.slice(1);
}

