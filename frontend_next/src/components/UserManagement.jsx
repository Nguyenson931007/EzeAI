import React, { useState, useEffect } from 'react';
import { ApiService, BASE_URL } from '@/models/api.service';
import { useDialog } from '@/components/DialogContext';
import UserProfileModal from '@/components/UserProfileModal';

const UserManagement = ({ onLoadJob }) => {
  const { showAlert, showConfirm } = useDialog();
  const [activeAdminTab, setActiveAdminTab] = useState('users'); // 'users' | 'progress_report'
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUserForProfile, setSelectedUserForProfile] = useState(null);
  const [profileModalMode, setProfileModalMode] = useState('view'); // 'view' | 'edit'
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'user',
    is_active: 1,
    full_name_en: '',
    full_name_vi: '',
    age: '',
    position: '',
    team: '',
    phone: ''
  });

  const [selectedUserForJobs, setSelectedUserForJobs] = useState(null);
  const [userJobs, setUserJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Lock/Unlock state
  const [unlockingUser, setUnlockingUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  // ── PROGRESS REPORT STATE ──
  const [reportLoading, setReportLoading] = useState(false);
  const [reportUser, setReportUser] = useState('all');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [reportStatus, setReportStatus] = useState('all'); // 'all' | 'completed' | 'pending'
  const [reportDatePreset, setReportDatePreset] = useState('all'); // 'all' | 'today' | 'week' | 'month' | 'year'
  const [reportData, setReportData] = useState({
    total_jobs: 0,
    completed_jobs: 0,
    pending_jobs: 0,
    total_area: 0,
    total_rooms: 0,
    items: []
  });

  const handleOpenJob = async (job) => {
    try {
      const jobId = job.local_job_id || job.id;
      if (jobId && typeof jobId === 'number') {
        const data = await ApiService.getJobData(jobId);
        if (data.status === 'success') {
          const parsedData = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
          if (onLoadJob) onLoadJob(parsedData, job.project_name, jobId);
          setSelectedUserForJobs(null);
          return;
        }
      }
      
      // If it's a task from TaskList without local CAD drawing yet:
      sessionStorage.setItem("pendingEmsJob", JSON.stringify(job));
      localStorage.setItem("pendingEmsJob", JSON.stringify(job));
      if (onLoadJob) {
        onLoadJob({ pages: [], walls: [], rooms: [], doors: [] }, job.project_name);
      }
      setSelectedUserForJobs(null);
    } catch (err) {
      console.error('Open job error:', err);
      await showAlert('Failed to load project details');
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await ApiService.getUsers();
      if (Array.isArray(data)) {
        setUsers(data);
      } else {
        setUsers([]);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchProgressReport = async () => {
    try {
      setReportLoading(true);
      const res = await ApiService.getJobProgressReport({
        startDate: reportStartDate,
        endDate: reportEndDate,
        username: reportUser === 'all' ? null : reportUser,
        search: reportSearch,
        status: reportStatus === 'all' ? null : reportStatus
      });
      if (res && res.status === 'success') {
        setReportData(res);
      }
    } catch (err) {
      console.error('Error fetching progress report:', err);
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (activeAdminTab === 'progress_report') {
      fetchProgressReport();
    }
  }, [activeAdminTab, reportUser, reportStartDate, reportEndDate, reportStatus]);

  // Quick Date Preset handler
  const handleDatePresetChange = (preset) => {
    setReportDatePreset(preset);
    const now = new Date();
    const formatDate = (d) => d.toISOString().split('T')[0];

    if (preset === 'all') {
      setReportStartDate('');
      setReportEndDate('');
    } else if (preset === 'today') {
      const todayStr = formatDate(now);
      setReportStartDate(todayStr);
      setReportEndDate(todayStr);
    } else if (preset === 'week') {
      const firstDay = new Date(now.setDate(now.getDate() - now.getDay() + 1));
      const lastDay = new Date();
      setReportStartDate(formatDate(firstDay));
      setReportEndDate(formatDate(lastDay));
    } else if (preset === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date();
      setReportStartDate(formatDate(firstDay));
      setReportEndDate(formatDate(lastDay));
    } else if (preset === 'year') {
      const firstDay = new Date(now.getFullYear(), 0, 1);
      const lastDay = new Date();
      setReportStartDate(formatDate(firstDay));
      setReportEndDate(formatDate(lastDay));
    }
  };

  const handleExportCSV = () => {
    if (!reportData.items || reportData.items.length === 0) {
      showAlert('No report data to export.');
      return;
    }
    const headers = ['ID', 'Tên Job (Project)', 'Nhân Viên (User)', 'Email', 'Khách Hàng (Client)', 'Builder', 'Created Date', 'Completed Date', 'Trạng Thái', 'Tiến Độ (%)', 'Diện Tích (m2)', 'Số Phòng'];
    const rows = reportData.items.map(it => [
      it.id,
      `"${(it.project_name || '').replace(/"/g, '""')}"`,
      `"${(it.username || '').replace(/"/g, '""')}"`,
      `"${(it.email || '').replace(/"/g, '""')}"`,
      `"${(it.client || '').replace(/"/g, '""')}"`,
      `"${(it.builder || '').replace(/"/g, '""')}"`,
      `"${it.created_at || ''}"`,
      `"${it.completed_at || (it.is_completed ? it.created_at : 'Đang thực hiện')}"`,
      it.is_completed ? 'Hoàn thành' : 'Đang thực hiện',
      `${it.progress || 0}%`,
      it.total_area || 0,
      it.room_count || 0
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `EzeFloor_Job_Progress_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let res;
      if (editingUser) {
        res = await ApiService.updateUser(editingUser.id, formData);
      } else {
        res = await ApiService.signup(formData);
      }
      
      if (res.message || res.status === "success") {
        await showAlert(editingUser ? 'User updated!' : 'User created!');
        setEditingUser(null);
        setFormData({ username: '', email: '', password: '', role: 'user', is_active: 1, full_name_en: '', full_name_vi: '', age: '', position: '', team: '', phone: '' });
        fetchUsers();
      }
    } catch (err) {
      console.error('Submit error:', err);
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      password: '',
      role: user.role,
      is_active: user.is_active,
      full_name_en: user.full_name_en || '',
      full_name_vi: user.full_name_vi || '',
      age: user.age !== null && user.age !== undefined ? user.age : '',
      position: user.position || '',
      team: user.team || '',
      phone: user.phone || ''
    });
  };

  const handleDelete = async (userId) => {
    if (!await showConfirm('Are you sure you want to delete this user?')) return;
    try {
      const userStr = localStorage.getItem("user");
      const headers = {};
      if (userStr) {
         const u = JSON.parse(userStr);
         headers["X-Username"] = u.username;
         headers["X-Session-Token"] = u.session_token;
      }
      const res = await fetch(`${BASE_URL}/users/${userId}`, { method: 'DELETE', headers });
      if (res.ok) fetchUsers();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleUnlock = async () => {
    if (!newPassword) {
      await showAlert("Please enter a new password");
      return;
    }
    try {
      const res = await ApiService.unlockUser(unlockingUser.id, newPassword);
      if (res.status === 'success') {
        await showAlert("User unlocked successfully!");
        setUnlockingUser(null);
        setNewPassword('');
        fetchUsers();
      }
    } catch (err) {
      console.error("Unlock error:", err);
    }
  };

  const safeUsers = Array.isArray(users) ? users : [];
  const filteredUsers = safeUsers.filter(u => 
    (u?.username || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u?.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const availableStaffList = React.useMemo(() => {
    const map = new Map();
    safeUsers.forEach(u => {
      if (u?.username) map.set(u.username, { value: u.username, label: `${u.username} (${u.role})` });
    });
    if (reportData?.items) {
      reportData.items.forEach(it => {
        const code = it.staff_code || it.username;
        if (code && !map.has(code) && code !== 'Unknown' && code !== 'Admin') {
          map.set(code, { value: code, label: `${code} (Staff)` });
        }
      });
    }
    return Array.from(map.values()).sort((a, b) => a.value.localeCompare(b.value));
  }, [safeUsers, reportData?.items]);

  const pendingUsers = filteredUsers.filter(u => u?.status === 'pending');
  const lockedUsers = filteredUsers.filter(u => u?.is_locked === 1);
  const existingUsers = filteredUsers.filter(u => u?.status !== 'pending' && u?.is_locked !== 1);
  const safeUserJobs = Array.isArray(userJobs) ? userJobs : [];

  return (
    <div className="admin-container" onWheel={(e) => e.stopPropagation()}>
      {/* ── TOP HEADER & TABS ── */}
      <div className="admin-header">
        <div>
          <h2>Admin Control Center</h2>
          <p>Manage users, access permissions, and real-time project progress reporting.</p>
        </div>
        
        {/* Top Tab Bar */}
        <div style={{ display: 'flex', gap: '8px', background: '#e2e8f0', padding: '4px', borderRadius: '10px' }}>
          <button
            onClick={() => setActiveAdminTab('users')}
            style={{
              padding: '8px 16px',
              borderRadius: '7px',
              border: 'none',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              background: activeAdminTab === 'users' ? '#ffffff' : 'transparent',
              color: activeAdminTab === 'users' ? '#2563eb' : '#475569',
              boxShadow: activeAdminTab === 'users' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            👥 User Management
          </button>
          <button
            onClick={() => setActiveAdminTab('progress_report')}
            style={{
              padding: '8px 16px',
              borderRadius: '7px',
              border: 'none',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              background: activeAdminTab === 'progress_report' ? '#2563eb' : 'transparent',
              color: activeAdminTab === 'progress_report' ? '#ffffff' : '#475569',
              boxShadow: activeAdminTab === 'progress_report' ? '0 2px 6px rgba(37,99,235,0.25)' : 'none',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>📊 Project Progress Report</span>
            {reportData.total_jobs > 0 && (
              <span style={{ fontSize: '11px', background: activeAdminTab === 'progress_report' ? '#ffffff' : '#cbd5e1', color: activeAdminTab === 'progress_report' ? '#2563eb' : '#334155', padding: '1px 6px', borderRadius: '10px', fontWeight: 800 }}>
                {reportData.total_jobs}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
         TAB 1: USER MANAGEMENT
         ══════════════════════════════════════════════════════ */}
      {activeAdminTab === 'users' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <div className="admin-search-box">
              <span className="search-icon">🔍</span>
              <input 
                type="text" 
                placeholder="Search users by name or email..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="admin-grid">
            <div className="admin-card user-form-card">
              <h3>{editingUser ? 'Edit User' : 'Add New User'}</h3>
              <form onSubmit={handleSubmit} className="admin-form">
                <div className="form-group">
                  <label>Username</label>
                  <input name="username" value={formData.username} onChange={handleInputChange} placeholder="Username" required />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input name="email" type="email" value={formData.email} onChange={handleInputChange} placeholder="Email" required />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input name="password" type="password" value={formData.password} onChange={handleInputChange} placeholder="Password" required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>English Name</label>
                    <input name="full_name_en" value={formData.full_name_en || ''} onChange={handleInputChange} placeholder="e.g. John Doe" />
                  </div>
                  <div className="form-group">
                    <label>Vietnamese Name</label>
                    <input name="full_name_vi" value={formData.full_name_vi || ''} onChange={handleInputChange} placeholder="e.g. Nguyễn Văn A" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Position</label>
                    <input name="position" value={formData.position || ''} onChange={handleInputChange} placeholder="e.g. Estimator" />
                  </div>
                  <div className="form-group">
                    <label>Team</label>
                    <input name="team" value={formData.team || ''} onChange={handleInputChange} placeholder="e.g. Team HW" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Age</label>
                    <input type="number" name="age" value={formData.age || ''} onChange={handleInputChange} placeholder="Age" />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input name="phone" value={formData.phone || ''} onChange={handleInputChange} placeholder="Phone number" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Role</label>
                    <select name="role" value={formData.role} onChange={handleInputChange}>
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select name="is_active" value={formData.is_active} onChange={handleInputChange}>
                      <option value={1}>Active</option>
                      <option value={0}>Inactive</option>
                    </select>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn-primary">{editingUser ? 'Update User' : 'Create User'}</button>
                  {editingUser && (
                    <button type="button" className="btn-secondary" onClick={() => { setEditingUser(null); setFormData({ username: '', email: '', password: '', role: 'user', is_active: 1, full_name_en: '', full_name_vi: '', age: '', position: '', team: '', phone: '' }); }}>Cancel</button>
                  )}
                </div>
              </form>
            </div>

            <div className="admin-card-stack" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {lockedUsers.length > 0 && (
                <div className="admin-card locked-list-card" style={{ border: '1px solid #ef4444' }}>
                  <h3 style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🔒</span> Locked Accounts (Brute Force Detected)
                  </h3>
                  <div className="table-responsive">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Failed Attempts</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lockedUsers.map((user, idx) => (
                          <tr key={`locked_${user.id || idx}_${idx}`}>
                            <td>
                              <div className="user-info">
                                <span className="username" style={{ color: '#ef4444' }}>{user.username}</span>
                                <span className="email">{user.email}</span>
                              </div>
                            </td>
                            <td><span style={{ color: '#ef4444', fontWeight: 'bold' }}>{user.failed_attempts}</span></td>
                            <td>
                              <button onClick={() => setUnlockingUser(user)} className="btn-approve" style={{ background: '#f59e0b' }}>
                                Unlock & Reset PW
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {pendingUsers.length > 0 && (
                <div className="admin-card pending-list-card" style={{ border: '1px solid #fbbf24' }}>
                  <h3 style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>⏳</span> Pending Registration Requests
                  </h3>
                  <div className="table-responsive">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Requested Role</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingUsers.map((user, idx) => (
                          <tr key={`pending_${user.id || idx}_${idx}`}>
                            <td>
                              <div className="user-info">
                                <span className="username" style={{ color: '#fbbf24' }}>{user.username}</span>
                                <span className="email">{user.email}</span>
                              </div>
                            </td>
                            <td><span className={`badge badge-user`}>{user.role}</span></td>
                            <td>
                              <div className="row-actions">
                                <button onClick={async () => { await fetch(`${BASE_URL}/users/${user.id}/approve`, { method: 'POST', headers: { "X-Username": JSON.parse(localStorage.getItem("user")).username, "X-Session-Token": JSON.parse(localStorage.getItem("user")).session_token } }); fetchUsers(); }} className="btn-approve">Approve</button>
                                <button onClick={async () => { if(await showConfirm('Reject?')) { await fetch(`${BASE_URL}/users/${user.id}/reject`, { method: 'POST', headers: { "X-Username": JSON.parse(localStorage.getItem("user")).username, "X-Session-Token": JSON.parse(localStorage.getItem("user")).session_token } }); fetchUsers(); } }} className="btn-reject">Reject</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="admin-card user-list-card">
                <h3>Registered Users</h3>
                {loading ? <div className="loading">Loading...</div> : (
                  <div className="table-responsive">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}>ID</th>
                          <th>User</th>
                          <th>Role</th>
                          <th>Account</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {existingUsers.map((user, idx) => (
                          <tr key={`user_${user.id || idx}_${idx}`}>
                            <td style={{ fontSize: '11px', color: '#666' }}>#{user.id}</td>
                            <td>
                              <div className="user-info">
                                <span className="username" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {user.full_name_en || user.full_name_vi || user.username}
                                  {(user.full_name_en || user.full_name_vi) && <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 500 }}>({user.username})</span>}
                                </span>
                                <span className="email">{user.email}</span>
                                {(user.position || user.team) && (
                                  <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 600, marginTop: '2px' }}>
                                    {user.position}{user.position && user.team ? ' • ' : ''}{user.team}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td><span className={`badge badge-${user.role}`}>{user.role}</span></td>
                            <td>
                              <button 
                                onClick={async () => { await fetch(`${BASE_URL}/users/${user.id}`, { method: 'PUT', headers: { "Content-Type": "application/json", "X-Username": JSON.parse(localStorage.getItem("user")).username, "X-Session-Token": JSON.parse(localStorage.getItem("user")).session_token }, body: JSON.stringify({ is_active: user.is_active === 1 ? 0 : 1 }) }); fetchUsers(); }}
                                className={`status-toggle ${user.is_active === 1 ? 'active' : 'inactive'}`}
                              >
                                {user.is_active === 1 ? 'Enabled' : 'Disabled'}
                              </button>
                            </td>
                            <td>
                              <span className={`online-status ${user.is_online === 1 ? 'active' : 'inactive'}`}>
                                {user.is_online === 1 ? '● Active' : '○ Inactive'}
                              </span>
                            </td>
                            <td>
                              <div className="row-actions">
                                <button 
                                  onClick={() => { setSelectedUserForProfile(user); setProfileModalMode('view'); }} 
                                  className="btn-icon" 
                                  title="View & Edit Full Profile (Xem & Chỉnh sửa hồ sơ)" 
                                  style={{ background: '#0284c7', color: '#ffffff', border: 'none' }}
                                >
                                  👤
                                </button>
                                <button onClick={async () => { setSelectedUserForJobs(user); const data = await ApiService.getUserJobs(user.username); setUserJobs(data); }} className="btn-icon" title="View Jobs" style={{ background: '#3b82f6' }}>💼</button>
                                <button onClick={() => handleEdit(user)} className="btn-icon" title="Edit">✏️</button>
                                <button onClick={() => handleDelete(user.id)} className="btn-icon btn-delete" title="Delete">🗑️</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════
         TAB 2: JOB PROGRESS & PRODUCTIVITY REPORT
         ══════════════════════════════════════════════════════ */}
      {activeAdminTab === 'progress_report' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* ── KPI SUMMARY STATS CARDS ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', color: '#2563eb' }}>
                📁
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Jobs</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{reportData.total_jobs}</div>
              </div>
            </div>

            <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', color: '#10b981' }}>
                ✅
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Completed Jobs</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                  {reportData.completed_jobs} <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 600 }}>({reportData.total_jobs > 0 ? Math.round((reportData.completed_jobs / reportData.total_jobs) * 100) : 0}%)</span>
                </div>
              </div>
            </div>

            <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', color: '#f59e0b' }}>
                ⏳
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>In Progress</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#d97706', marginTop: '2px' }}>{reportData.pending_jobs}</div>
              </div>
            </div>

            <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', color: '#8b5cf6' }}>
                📐
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Area</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#7c3aed', marginTop: '2px' }}>{reportData.total_area?.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 600 }}>m²</span></div>
              </div>
            </div>

            <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#fdf2f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', color: '#ec4899' }}>
                🏢
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Rooms</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#db2777', marginTop: '2px' }}>{reportData.total_rooms}</div>
              </div>
            </div>
          </div>

          {/* ── FILTER TOOLBAR ── */}
          <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              {/* Left Filters */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
                {/* User Filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>👤 Staff:</label>
                  <select
                    value={reportUser}
                    onChange={(e) => setReportUser(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 600, background: '#f8fafc', outline: 'none' }}
                  >
                    <option value="all">All Staff ({availableStaffList.length} Staff)</option>
                    {availableStaffList.map(st => (
                      <option key={st.value} value={st.value}>{st.label}</option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>📌 Status:</label>
                  <select
                    value={reportStatus}
                    onChange={(e) => setReportStatus(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 600, background: '#f8fafc', outline: 'none' }}
                  >
                    <option value="all">All Statuses</option>
                    <option value="completed">✅ Completed (Done)</option>
                    <option value="pending">⏳ In Progress</option>
                  </select>
                </div>

                {/* Search Box */}
                <div style={{ position: 'relative', width: '220px' }}>
                  <input
                    type="text"
                    placeholder="🔍 Search Job name, ID..."
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchProgressReport()}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', background: '#f8fafc', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Right Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={fetchProgressReport}
                  disabled={reportLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '7px 12px',
                    borderRadius: '6px',
                    border: '1px solid #bfdbfe',
                    background: '#eff6ff',
                    color: '#2563eb',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <span>🔄</span>
                  <span>{reportLoading ? 'Loading...' : 'Refresh'}</span>
                </button>

                <button
                  onClick={handleExportCSV}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '7px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#10b981',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(16,185,129,0.25)'
                  }}
                >
                  <span>📥</span>
                  <span>Export Excel / CSV</span>
                </button>
              </div>
            </div>

            {/* Date Range Presets & Date Pickers */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginRight: '4px' }}>📅 Filter:</span>
                {[
                  { id: 'all', label: 'All' },
                  { id: 'today', label: 'Today' },
                  { id: 'week', label: 'This Week' },
                  { id: 'month', label: 'This Month' },
                  { id: 'year', label: 'This Year' }
                ].map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => handleDatePresetChange(preset.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '5px',
                      border: reportDatePreset === preset.id ? '1px solid #2563eb' : '1px solid #e2e8f0',
                      background: reportDatePreset === preset.id ? '#2563eb' : '#f8fafc',
                      color: reportDatePreset === preset.id ? '#ffffff' : '#475569',
                      fontSize: '11px',
                      fontWeight: reportDatePreset === preset.id ? 700 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Custom Date Pickers */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>From:</span>
                <input
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => { setReportStartDate(e.target.value); setReportDatePreset('custom'); }}
                  style={{ padding: '4px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11px', background: '#ffffff' }}
                />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>To:</span>
                <input
                  type="date"
                  value={reportEndDate}
                  onChange={(e) => { setReportEndDate(e.target.value); setReportDatePreset('custom'); }}
                  style={{ padding: '4px 8px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11px', background: '#ffffff' }}
                />
              </div>
            </div>
          </div>

          {/* ── MAIN PROGRESS REPORT TABLE ── */}
          <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📋</span> Project Progress Report List ({reportData.items?.length || 0} Jobs)
              </h3>
            </div>

            {reportLoading ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b', fontSize: '13px' }}>
                ⏳ Loading report data from database...
              </div>
            ) : (!reportData.items || reportData.items.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b', fontSize: '13px' }}>
                No job data found for the selected time range.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}># ID</th>
                      <th>Job / Project Name</th>
                      <th>Assignee (User)</th>
                      <th>Client / Builder</th>
                      <th>Created Date</th>
                      <th>Completed Date</th>
                      <th>Status / Progress</th>
                      <th>Metrics</th>
                      <th>AI Model</th>
                      <th style={{ textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.items.map((it, idx) => {
                      const createdDate = it.created_at ? new Date(it.created_at) : null;
                      const completedDate = it.completed_at ? new Date(it.completed_at) : (it.is_completed && it.created_at ? new Date(it.created_at) : null);

                      return (
                        <tr key={`report_item_${it.id || idx}_${idx}`}>
                          <td style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>#{it.id}</td>
                          
                          {/* Project Name with Link */}
                          <td>
                            <button
                              className="btn-project-link"
                              onClick={() => handleOpenJob(it)}
                              title="Click to open this project directly on Canvas"
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '13px' }}
                            >
                              <span>📂</span>
                              <span>{it.project_name}</span>
                            </button>
                            {it.hw_id && (
                              <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace', marginTop: '2px' }}>
                                Task HW: {it.hw_id}
                              </div>
                            )}
                          </td>

                          {/* User Staff */}
                          <td>
                            <div className="user-info">
                              <span className="username" style={{ fontSize: '13px', color: '#0f172a' }}>{it.username}</span>
                              <span className="email" style={{ fontSize: '11px', color: '#64748b' }}>{it.email}</span>
                            </div>
                          </td>

                          {/* Client / Builder */}
                          <td>
                            <div style={{ fontSize: '12px', color: '#334155', fontWeight: 600 }}>{it.client || '—'}</div>
                            {it.builder && <div style={{ fontSize: '11px', color: '#64748b' }}>{it.builder}</div>}
                          </td>

                          {/* Created Date (Date Job) */}
                          <td>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                              {createdDate ? createdDate.toLocaleDateString('vi-VN') : '—'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              {createdDate ? createdDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}
                            </div>
                          </td>

                          {/* Completed Date */}
                          <td>
                            {it.is_completed && completedDate ? (
                              <div>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#059669' }}>
                                  {completedDate.toLocaleDateString('vi-VN')}
                                </div>
                                <div style={{ fontSize: '11px', color: '#10b981' }}>
                                  {completedDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#d97706', fontStyle: 'italic', fontWeight: 600 }}>
                                ⏳ In Progress / Draft
                              </span>
                            )}
                          </td>

                          {/* Progress & Status Badge */}
                          <td>
                            {it.is_completed ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 800 }}>
                                ✓ Completed (100%)
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 800 }}>
                                ⏳ In Progress ({it.progress || 0}%)
                              </span>
                            )}
                          </td>

                          {/* Specs */}
                          <td>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#7c3aed' }}>
                              {it.total_area?.toFixed(1)} m²
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              {it.room_count} rooms
                            </div>
                          </td>

                          {/* Trained Status */}
                          <td>
                            {it.is_trained === 1 ? (
                              <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                                ✓ TRAINED
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '11px' }}>
                                No Train
                              </span>
                            )}
                          </td>

                          {/* Open Action Button */}
                          <td style={{ textAlign: 'center' }}>
                            <button
                              onClick={() => handleOpenJob(it)}
                              style={{
                                background: '#2563eb',
                                color: '#ffffff',
                                border: 'none',
                                padding: '5px 10px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                boxShadow: '0 1px 3px rgba(37,99,235,0.25)'
                              }}
                            >
                              Open Project
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unlock Modal */}
      {unlockingUser && (
        <div className="jobs-overlay" onClick={() => setUnlockingUser(null)}>
          <div className="jobs-modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Unlock {unlockingUser.username}</h3>
              <button className="btn-close" onClick={() => setUnlockingUser(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Enter New Password for User</label>
                <input 
                  type="password" 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  placeholder="New strong password"
                  autoFocus
                />
              </div>
              <div className="form-actions" style={{ marginTop: '10px' }}>
                <button className="btn-primary" style={{ width: '100%', background: '#f59e0b' }} onClick={handleUnlock}>
                  Confirm Unlock & Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedUserForJobs && (
        <div className="jobs-overlay" onClick={() => setSelectedUserForJobs(null)}>
          <div className="jobs-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Jobs for {selectedUserForJobs.username}</h3>
              <button className="btn-close" onClick={() => setSelectedUserForJobs(null)}>×</button>
            </div>
            <div className="modal-body">
              {loadingJobs ? (
                <div className="loading">Loading jobs...</div>
              ) : userJobs.length === 0 ? (
                <div className="no-data">No jobs found for this user.</div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>ID</th>
                      <th style={{ width: '100px' }}>Train Status</th>
                      <th>Project Name</th>
                      <th>Area</th>
                      <th>Rooms</th>
                      <th>Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeUserJobs.map((job, idx) => (
                      <tr key={`user_job_${job.id || idx}_${idx}`}>
                        <td>#{job.id}</td>
                        <td>
                          {job.is_trained === 1 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <img src={job.thumbnail} alt="thumbnail" style={{ width: '70px', height: '45px', objectFit: 'cover', borderRadius: '4px', border: '2px solid #4ade80' }} />
                              <span style={{ fontSize: '9px', color: '#4ade80', fontWeight: 'bold' }}>✓ TRAINED</span>
                            </div>
                          ) : (
                            <div style={{ width: '70px', height: '45px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#444', border: '1px dashed #333', textTransform: 'uppercase', letterSpacing: '0.5px' }}>No Train</div>
                          )}
                        </td>
                        <td><button className="btn-project-link" onClick={() => handleOpenJob(job)}>{job.project_name}</button></td>
                        <td style={{ color: '#a78bfa', fontWeight: 'bold' }}>{job.total_area?.toFixed(2)} m²</td>
                        <td>{job.room_count}</td>
                        <td style={{ fontSize: '12px', color: '#888' }}>{new Date(job.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* User Profile & Account Settings Modal (Admin Inspection & Edit) */}
      <UserProfileModal
        isOpen={!!selectedUserForProfile}
        targetUser={selectedUserForProfile}
        initialMode={profileModalMode}
        onClose={() => setSelectedUserForProfile(null)}
        onUserUpdated={() => {
          fetchUsers();
          setSelectedUserForProfile(null);
        }}
      />

      <style dangerouslySetInnerHTML={{ __html: `
        .admin-container { padding: 28px; color: #1e293b; background: #f8fafc; height: calc(100vh - 86px); overflow-y: auto; flex: 1; position: relative; }
        .jobs-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 40px; }
        .jobs-modal { background: #ffffff; width: 100%; max-width: 900px; max-height: 80vh; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.15); color: #1e293b; }
        .modal-header { padding: 16px 22px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border-radius: 12px 12px 0 0; }
        .modal-header h3 { margin: 0; color: #0f172a; font-size: 16px; font-weight: 700; }
        .btn-close { background: transparent; border: none; color: #64748b; font-size: 24px; cursor: pointer; }
        .modal-body { flex: 1; overflow-y: auto; padding: 20px; }
        .no-data { text-align: center; padding: 40px; color: #64748b; }
        .btn-project-link { background: transparent; border: none; color: #2563eb; text-decoration: none; cursor: pointer; font-weight: 600; font-size: 13px; padding: 0; text-align: left; }
        .btn-project-link:hover { text-decoration: underline; color: #1d4ed8; }
        .admin-header { margin-bottom: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
        .admin-search-box { position: relative; width: 320px; }
        .admin-search-box input { width: 100%; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 9px 12px 9px 36px; color: #1e293b; font-size: 13px; outline: none; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.03); }
        .admin-search-box input:focus { border-color: #2563eb; background: #ffffff; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15); }
        .search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 15px; pointer-events: none; }
        .admin-header h2 { margin: 0; font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
        .admin-header p { color: #64748b; margin: 4px 0 0; font-size: 13px; }
        .admin-grid { display: grid; grid-template-columns: 320px 1fr; gap: 24px; }
        .admin-card { background: #ffffff; border-radius: 10px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 16px rgba(0,0,0,0.04); }
        .admin-card h3 { margin-top: 0; margin-bottom: 18px; font-size: 16px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; }
        .form-group { margin-bottom: 14px; }
        .form-group label { display: block; margin-bottom: 5px; font-size: 12px; font-weight: 600; color: #475569; }
        .form-group input, .form-group select { width: 100%; padding: 8px 12px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; color: #1e293b; font-size: 13px; transition: border-color 0.2s; box-sizing: border-box; }
        .form-group input:focus, .form-group select:focus { border-color: #2563eb; outline: none; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12); }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .form-actions { display: flex; gap: 10px; margin-top: 20px; }
        .btn-primary { background: #2563eb; border: none; padding: 9px 18px; border-radius: 6px; color: #ffffff; font-weight: 700; font-size: 13px; cursor: pointer; transition: all 0.15s ease; box-shadow: 0 1px 3px rgba(37,99,235,0.25); }
        .btn-primary:hover { background: #1d4ed8; }
        .btn-secondary { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 9px 18px; border-radius: 6px; color: #475569; font-weight: 600; font-size: 13px; cursor: pointer; }
        .btn-secondary:hover { background: #e2e8f0; }
        .admin-table { width: 100%; border-collapse: collapse; }
        .admin-table th { text-align: left; padding: 10px 12px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background: #f8fafc; }
        .admin-table td { padding: 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        .admin-table tbody tr:hover { background: #f8fafc; }
        .user-info { display: flex; flex-direction: column; }
        .username { font-weight: 700; color: #0f172a; font-size: 14px; }
        .email { font-size: 12px; color: #64748b; }
        .badge { padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block; }
        .badge-admin { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
        .badge-manager { background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; }
        .badge-leader { background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff; }
        .badge-user { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
        .status-toggle { background: #ffffff; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.15s; }
        .status-toggle.active { color: #059669; border-color: #a7f3d0; background: #ecfdf5; }
        .status-toggle.inactive { color: #dc2626; border-color: #fecaca; background: #fef2f2; }
        .online-status { font-size: 12px; font-weight: 600; }
        .online-status.active { color: #10b981; }
        .online-status.inactive { color: #94a3b8; }
        .row-actions { display: flex; gap: 6px; }
        .btn-icon { background: #ffffff; border: 1px solid #cbd5e1; width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 13px; transition: all 0.15s; color: #475569; }
        .btn-icon:hover { background: #eff6ff; border-color: #93c5fd; color: #2563eb; }
        .btn-delete:hover { background: #fef2f2; border-color: #fecaca; color: #ef4444; }
        .loading { text-align: center; padding: 40px; color: #64748b; }
        .btn-approve, .btn-reject { padding: 5px 12px; border-radius: 5px; font-weight: 700; font-size: 11px; cursor: pointer; border: none; transition: opacity 0.15s; }
        .btn-approve { background: #10b981; color: #ffffff; }
        .btn-reject { background: #ef4444; color: #ffffff; }
        .btn-approve:hover, .btn-reject:hover { opacity: 0.9; }
      ` }} />
    </div>
  );
};

export default UserManagement;
