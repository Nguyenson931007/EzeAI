import React, { useState, useEffect } from 'react';
import { ApiService } from '@/models/api.service';

export default function UserProfileModal({
  isOpen,
  onClose,
  targetUser = null, // If provided, viewing/editing this specific user (e.g. by Admin). If null, views/edits current logged-in user.
  onUserUpdated = null, // Callback when user profile is updated
  initialMode = 'view' // 'view' | 'edit'
}) {
  const [mode, setMode] = useState(initialMode); // 'view' | 'edit'
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [profile, setProfile] = useState({
    id: null,
    username: '',
    email: '',
    role: 'user',
    full_name_en: '',
    full_name_vi: '',
    age: '',
    position: '',
    team: '',
    phone: '',
    is_active: 1,
    is_online: 0,
    status: 'active'
  });

  const [formData, setFormData] = useState({
    full_name_en: '',
    full_name_vi: '',
    age: '',
    position: '',
    team: '',
    phone: '',
    email: ''
  });

  // Fetch or initialize profile data when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setMode(initialMode);
    setErrorMsg('');
    setSuccessMsg('');

    if (targetUser) {
      // Admin inspecting a specific user
      setProfile(targetUser);
      setFormData({
        full_name_en: targetUser.full_name_en || '',
        full_name_vi: targetUser.full_name_vi || '',
        age: targetUser.age !== null && targetUser.age !== undefined ? targetUser.age : '',
        position: targetUser.position || '',
        team: targetUser.team || '',
        phone: targetUser.phone || '',
        email: targetUser.email || ''
      });
    } else {
      // Current logged in user profile
      fetchMyProfile();
    }
  }, [isOpen, targetUser, initialMode]);

  const fetchMyProfile = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await ApiService.getMyProfile();
      if (data) {
        setProfile(data);
        setFormData({
          full_name_en: data.full_name_en || '',
          full_name_vi: data.full_name_vi || '',
          age: data.age !== null && data.age !== undefined ? data.age : '',
          position: data.position || '',
          team: data.team || '',
          phone: data.phone || '',
          email: data.email || ''
        });
      }
    } catch (err) {
      console.error('[UserProfileModal] Error loading profile:', err);
      // Fallback from localStorage
      const localUser = JSON.parse(localStorage.getItem('user') || '{}');
      setProfile(prev => ({ ...prev, ...localUser }));
      setFormData(prev => ({ ...prev, email: localUser.email || '' }));
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    const payload = {
      full_name_en: formData.full_name_en.trim(),
      full_name_vi: formData.full_name_vi.trim(),
      age: formData.age !== '' ? parseInt(formData.age, 10) : null,
      position: formData.position.trim(),
      team: formData.team.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim()
    };

    try {
      let updated;
      if (targetUser && targetUser.id) {
        // Admin updating specific user
        await ApiService.updateUser(targetUser.id, payload);
        updated = { ...profile, ...payload };
      } else {
        // Self update
        const res = await ApiService.updateMyProfile(payload);
        updated = res?.user || { ...profile, ...payload };
        
        // Update localStorage if email or names changed
        const localUser = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...localUser, ...payload }));
      }

      setProfile(updated);
      setSuccessMsg('Profile information updated successfully!');
      if (onUserUpdated) onUserUpdated(updated);

      setTimeout(() => {
        setMode('view');
        setSuccessMsg('');
      }, 1000);
    } catch (err) {
      console.error('[UserProfileModal] Error saving profile:', err);
      setErrorMsg(err?.message || 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const displayName = profile.full_name_en || profile.full_name_vi || profile.username || 'User';
  const initialLetter = (displayName.charAt(0) || 'U').toUpperCase();

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        animation: 'fadeIn 0.2s ease'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '620px',
          maxHeight: '90vh',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'Outfit', 'Inter', -apple-system, sans-serif"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── TOP BANNER & HEADER ── */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #60a5fa 100%)',
            padding: '24px 28px 20px',
            color: '#ffffff',
            position: 'relative'
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
          >
            ✕
          </button>

          {/* Profile Header Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#ffffff',
                color: '#2563eb',
                fontSize: '26px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                border: '3px solid rgba(255, 255, 255, 0.8)'
              }}
            >
              {initialLetter}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#ffffff' }}>
                  {displayName}
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: profile.role === 'admin' ? '#fbbf24' : 'rgba(255, 255, 255, 0.2)',
                    color: profile.role === 'admin' ? '#78350f' : '#ffffff'
                  }}
                >
                  {profile.role || 'USER'}
                </span>
              </div>

              <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.85)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span>@{profile.username}</span>
                {profile.position && <span>• {profile.position}</span>}
                {profile.team && <span>• {profile.team}</span>}
              </div>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              marginTop: '18px',
              background: 'rgba(15, 23, 42, 0.2)',
              padding: '4px',
              borderRadius: '10px',
              width: 'fit-content'
            }}
          >
            <button
              onClick={() => setMode('view')}
              style={{
                padding: '6px 14px',
                borderRadius: '7px',
                border: 'none',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                background: mode === 'view' ? '#ffffff' : 'transparent',
                color: mode === 'view' ? '#2563eb' : '#ffffff',
                boxShadow: mode === 'view' ? '0 2px 6px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>👁️</span> View Profile
            </button>
            <button
              onClick={() => setMode('edit')}
              style={{
                padding: '6px 14px',
                borderRadius: '7px',
                border: 'none',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                background: mode === 'edit' ? '#ffffff' : 'transparent',
                color: mode === 'edit' ? '#2563eb' : '#ffffff',
                boxShadow: mode === 'edit' ? '0 2px 6px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>✏️</span> Fill / Edit Form
            </button>
          </div>
        </div>

        {/* ── NOTIFICATIONS / ALERTS ── */}
        {errorMsg && (
          <div style={{ margin: '14px 24px 0', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span> {errorMsg}
          </div>
        )}
        {successMsg && (
          <div style={{ margin: '14px 24px 0', padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#059669', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✅</span> {successMsg}
          </div>
        )}

        {/* ── BODY CONTENT ── */}
        <div style={{ padding: '20px 28px 24px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', fontSize: '14px' }}>
              ⏳ Loading profile data...
            </div>
          ) : mode === 'view' ? (
            /* ══════════════════════════════════════════════════════
               MODE 1: VIEW PROFILE
               ══════════════════════════════════════════════════════ */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '14px'
                }}
              >
                {/* English Name */}
                <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    🔤 English Name (Tên tiếng Anh)
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                    {profile.full_name_en || <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 400 }}>Not provided</span>}
                  </div>
                </div>

                {/* Vietnamese Name */}
                <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    🇻🇳 Vietnamese Name (Tên tiếng Việt)
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                    {profile.full_name_vi || <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 400 }}>Not provided</span>}
                  </div>
                </div>

                {/* Age */}
                <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    🎂 Age (Tuổi)
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                    {profile.age ? `${profile.age} years old` : <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 400 }}>Not provided</span>}
                  </div>
                </div>

                {/* Position */}
                <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    💼 Position in Company (Vị trí)
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#2563eb', marginTop: '4px' }}>
                    {profile.position || <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 400 }}>Not provided</span>}
                  </div>
                </div>

                {/* Team */}
                <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    👥 Team / Department
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#059669', marginTop: '4px' }}>
                    {profile.team || <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 400 }}>Not provided</span>}
                  </div>
                </div>

                {/* Phone */}
                <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    📞 Phone Number (Số điện thoại)
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                    {profile.phone || <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 400 }}>Not provided</span>}
                  </div>
                </div>

                {/* Email Address */}
                <div style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ✉️ Email Address
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                    {profile.email || <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 400 }}>Not provided</span>}
                  </div>
                </div>
              </div>

              {/* View Mode Footer Action */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  onClick={() => setMode('edit')}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#1d4ed8'}
                  onMouseOut={(e) => e.currentTarget.style.background = '#2563eb'}
                >
                  <span>✏️</span> Edit Profile Information
                </button>
              </div>
            </div>
          ) : (
            /* ══════════════════════════════════════════════════════
               MODE 2: EDIT / FILL FORM
               ══════════════════════════════════════════════════════ */
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                {/* English Name Input */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    🔤 English Name (Tên tiếng Anh)
                  </label>
                  <input
                    type="text"
                    name="full_name_en"
                    value={formData.full_name_en}
                    onChange={handleInputChange}
                    placeholder="e.g. John Doe, Alex Miller"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Vietnamese Name Input */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    🇻🇳 Vietnamese Name (Tên tiếng Việt)
                  </label>
                  <input
                    type="text"
                    name="full_name_vi"
                    value={formData.full_name_vi}
                    onChange={handleInputChange}
                    placeholder="e.g. Nguyễn Văn A"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Age Input */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    🎂 Age (Tuổi)
                  </label>
                  <input
                    type="number"
                    name="age"
                    min="15"
                    max="100"
                    value={formData.age}
                    onChange={handleInputChange}
                    placeholder="e.g. 26"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Phone Input */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    📞 Phone Number (Số điện thoại)
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="e.g. 0912 345 678"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Position Input with Suggestions */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    💼 Position in Company (Vị trí)
                  </label>
                  <input
                    type="text"
                    name="position"
                    list="position-suggestions"
                    value={formData.position}
                    onChange={handleInputChange}
                    placeholder="e.g. Senior Estimator, CAD Drafter"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <datalist id="position-suggestions">
                    <option value="Senior Estimator" />
                    <option value="Floor Planner" />
                    <option value="CAD Specialist" />
                    <option value="Lead Estimator" />
                    <option value="AI / QA Engineer" />
                    <option value="Project Manager" />
                    <option value="Admin" />
                  </datalist>
                </div>

                {/* Team Input with Suggestions */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    👥 Team / Department
                  </label>
                  <input
                    type="text"
                    name="team"
                    list="team-suggestions"
                    value={formData.team}
                    onChange={handleInputChange}
                    placeholder="e.g. Team HW, Residential Takeoff"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <datalist id="team-suggestions">
                    <option value="Team HW" />
                    <option value="Residential Takeoff" />
                    <option value="Commercial Estimation" />
                    <option value="Architectural CAD" />
                    <option value="AI Engineering" />
                  </datalist>
                </div>

                {/* Email Input */}
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    ✉️ Email Address
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="user@gmail.com"
                    required
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Form Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#475569',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '9px 22px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>💾</span> {saving ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
