import React, { useState, useEffect } from 'react';
import { ApiService, BASE_URL } from '@/models/api.service';
import { useDialog } from '@/components/DialogContext';

const UserManagement = ({ onLoadJob }) => {
  const { showAlert, showConfirm } = useDialog();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'user',
    is_active: 1
  });

  const [selectedUserForJobs, setSelectedUserForJobs] = useState(null);
  const [userJobs, setUserJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Lock/Unlock state
  const [unlockingUser, setUnlockingUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const handleOpenJob = async (job) => {
    try {
      const data = await ApiService.getJobData(job.id);
      if (data.status === 'success') {
        const parsedData = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
        onLoadJob(parsedData, job.project_name);
        setSelectedUserForJobs(null); // Close modal
      }
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

  useEffect(() => {
    fetchUsers();
  }, []);

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
        setFormData({ username: '', email: '', password: '', role: 'user', is_active: 1 });
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
      is_active: user.is_active
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

  const pendingUsers = filteredUsers.filter(u => u?.status === 'pending');
  const lockedUsers = filteredUsers.filter(u => u?.is_locked === 1);
  const existingUsers = filteredUsers.filter(u => u?.status !== 'pending' && u?.is_locked !== 1);
  const safeUserJobs = Array.isArray(userJobs) ? userJobs : [];

  return (
    <div className="admin-container" onWheel={(e) => e.stopPropagation()}>
      <div className="admin-header">
        <div>
          <h2>User Management</h2>
          <p>Manage application users, their access levels, and registration requests.</p>
        </div>
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
                <button type="button" className="btn-secondary" onClick={() => { setEditingUser(null); setFormData({ username: '', email: '', password: '', role: 'user', is_active: 1 }); }}>Cancel</button>
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
                    {lockedUsers.map(user => (
                      <tr key={user.id}>
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
                    {pendingUsers.map(user => (
                      <tr key={user.id}>
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
                    {existingUsers.map(user => (
                      <tr key={user.id}>
                        <td style={{ fontSize: '11px', color: '#666' }}>#{user.id}</td>
                        <td>
                          <div className="user-info">
                            <span className="username">{user.username}</span>
                            <span className="email">{user.email}</span>
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
                    {safeUserJobs.map(job => (
                      <tr key={job.id}>
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

      <style dangerouslySetInnerHTML={{ __html: `
        .admin-container { padding: 24px; color: #fff; background: #1a1a1a; height: calc(100vh - 86px); overflow-y: auto; flex: 1; position: relative; }
        .jobs-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 40px; }
        .jobs-modal { background: #1e1e1e; width: 100%; max-width: 900px; max-height: 80vh; border-radius: 12px; border: 1px solid #333; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
        .modal-header { padding: 15px 20px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; }
        .modal-header h3 { margin: 0; color: #3b82f6; }
        .btn-close { background: transparent; border: none; color: #888; font-size: 24px; cursor: pointer; }
        .modal-body { flex: 1; overflow-y: auto; padding: 20px; }
        .no-data { text-align: center; padding: 40px; color: #666; }
        .btn-project-link { background: transparent; border: none; color: #3b82f6; text-decoration: none; cursor: pointer; font-weight: 600; font-size: 13px; padding: 0; text-align: left; }
        .btn-project-link:hover { text-decoration: underline; color: #60a5fa; }
        .admin-header { margin-bottom: 32px; border-bottom: 1px solid #333; padding-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
        .admin-search-box { position: relative; width: 300px; }
        .admin-search-box input { width: 100%; background: #2a2a2a; border: 1px solid #444; border-radius: 8px; padding: 10px 12px 10px 36px; color: #fff; font-size: 14px; outline: none; transition: all 0.2s; }
        .admin-search-box input:focus { border-color: #3b82f6; background: #333; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2); }
        .search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #666; font-size: 16px; pointer-events: none; }
        .admin-header h2 { margin: 0; font-size: 28px; background: linear-gradient(45deg, #00f2fe 0%, #4facfe 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .admin-header p { color: #888; margin: 8px 0 0; }
        .admin-grid { display: grid; grid-template-columns: 350px 1fr; gap: 24px; }
        .admin-card { background: #242424; border-radius: 12px; padding: 20px; border: 1px solid #333; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        .admin-card h3 { margin-top: 0; margin-bottom: 20px; font-size: 18px; color: #ddd; }
        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; margin-bottom: 6px; font-size: 13px; color: #aaa; }
        .form-group input, .form-group select { width: 100%; padding: 10px 12px; background: #121212; border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 14px; transition: border-color 0.2s; }
        .form-group input:focus { border-color: #4facfe; outline: none; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .form-actions { display: flex; gap: 10px; margin-top: 24px; }
        .btn-primary { background: linear-gradient(45deg, #4facfe 0%, #00f2fe 100%); border: none; padding: 10px 20px; border-radius: 6px; color: #000; font-weight: 600; cursor: pointer; transition: transform 0.2s, opacity 0.2s; }
        .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-secondary { background: #444; border: none; padding: 10px 20px; border-radius: 6px; color: #fff; cursor: pointer; }
        .admin-table { width: 100%; border-collapse: collapse; }
        .admin-table th { text-align: left; padding: 12px; border-bottom: 2px solid #333; color: #888; font-size: 12px; text-transform: uppercase; }
        .admin-table td { padding: 12px; border-bottom: 1px solid #333; }
        .user-info { display: flex; flex-direction: column; }
        .username { font-weight: 600; color: #fff; font-size: 15px; }
        .email { font-size: 12px; color: #777; }
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .badge-admin { background: rgba(255, 193, 7, 0.15); color: #ffc107; border: 1px solid rgba(255, 193, 7, 0.3); }
        .badge-user { background: rgba(79, 172, 254, 0.15); color: #4facfe; border: 1px solid rgba(79, 172, 254, 0.3); }
        .status-toggle { background: transparent; border: 1px solid #444; padding: 4px 10px; border-radius: 20px; font-size: 12px; cursor: pointer; transition: all 0.2s; }
        .status-toggle.active { color: #4caf50; border-color: #4caf50; background: rgba(76, 175, 80, 0.05); }
        .status-toggle.inactive { color: #f44336; border-color: #f44336; background: rgba(244, 67, 54, 0.05); }
        .online-status { font-size: 13px; font-weight: 500; }
        .online-status.active { color: #4caf50; }
        .online-status.inactive { color: #888; }
        .row-actions { display: flex; gap: 8px; }
        .btn-icon { background: #333; border: none; width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 14px; transition: background 0.2s; }
        .btn-icon:hover { background: #444; }
        .btn-delete:hover { background: #c62828; }
        .loading { text-align: center; padding: 40px; color: #888; }
        .btn-approve, .btn-reject { padding: 6px 12px; border-radius: 4px; font-weight: 600; font-size: 11px; cursor: pointer; border: none; transition: opacity 0.2s; }
        .btn-approve { background: #4caf50; color: #000; }
        .btn-reject { background: #f44336; color: #fff; }
        .btn-approve:hover, .btn-reject:hover { opacity: 0.8; }
      ` }} />
    </div>
  );
};

export default UserManagement;
