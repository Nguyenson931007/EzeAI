import React from "react";

export default function LoginView({
  authData, setAuthData,
  isSignup, setIsSignup,
  showPassword, setShowPassword,
  isLocked,
  handleLogin
}) {
  return (
    <div className="login-root">
      {/* Background Enhancements */}
      <div className="login-vignette"></div>
      <div className="login-grid-overlay"></div>
      <div className="login-scanline"></div>
      <div className="login-crosshair-h"></div>
      <div className="login-crosshair-v"></div>

      {/* Floating Blueprint particles */}
      <div className="login-particles">
        <div className="blueprint-particle"></div>
        <div className="blueprint-particle"></div>
        <div className="blueprint-particle"></div>
        <div className="blueprint-particle"></div>
        <div className="blueprint-particle"></div>
      </div>

      {/* CAD Workstation Viewport HUD */}
      <div className="login-hud-container">
        <div className="hud-row">
          <div className="hud-item">
            <span className="status-indicator"></span>
            <span>EZEQUOTE // ARCHITECTURE.AI</span>
          </div>
          <div className="hud-item">
            <span>COORD: 37.8136° S, 144.9631° E</span>
          </div>
        </div>
        <div className="hud-row">
          <div className="hud-item">
            <span>ENGINE: BIM_v4.12 // ACTIVE</span>
          </div>
          <div className="hud-item">
            <span>GRID: 40px // SCALE 1:50</span>
          </div>
        </div>
      </div>

      <div className="login-card">
        {/* Architectural HUD corners */}
        <div className="hud-corner top-left"></div>
        <div className="hud-corner top-right"></div>
        <div className="hud-corner bottom-left"></div>
        <div className="hud-corner bottom-right"></div>
        
        {/* Lighting sweeps */}
        <div className="login-light-sweep"></div>
        <div className="card-coord-overlay">SEC.LOC: [45.12, -93.38]</div>

        <div className="login-header">
          <div className="login-title-badge">BIM/CAD AI SUITE</div>
          <div className="login-logo" style={{ display: "flex", justifyContent: "center", marginBottom: "4px" }}>
            <img 
              src="/logo.png" 
              alt="ezequote" 
              style={{ height: "46px", width: "auto", objectFit: "contain", filter: "drop-shadow(0 0 10px rgba(255, 255, 255, 0.95)) brightness(1.3)" }} 
            />
          </div>
          <p className="login-subtitle">
            {isSignup ? "Create your enterprise account" : "Sign in to your architecture suite"}
          </p>
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          {isLocked && (
            <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '14px 18px', borderRadius: '14px', marginBottom: '8px', color: '#fca5a5', fontSize: '13.5px', display: 'flex', gap: '10px', alignItems: 'center', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.1)' }}>
              <span style={{ fontSize: '16px' }}>🔒</span> <span>Account Temporarily Locked. Contact Admin to Unlock.</span>
            </div>
          )}

          <div className="login-input-group">
            <label htmlFor="username">Username or Email</label>
            <div className="login-input-wrapper">
              <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <input
                id="username"
                className="login-input"
                type="text"
                placeholder="Enter your username"
                value={authData.username}
                onChange={(e) => setAuthData({ ...authData, username: e.target.value })}
                disabled={isLocked}
              />
            </div>
          </div>

          {isSignup && (
            <div className="login-input-group">
              <label htmlFor="email">Email Address</label>
              <div className="login-input-wrapper">
                <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <input
                  id="email"
                  className="login-input"
                  type="email"
                  placeholder="name@example.com"
                  value={authData.email}
                  onChange={(e) => setAuthData({ ...authData, email: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="login-input-group password-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px', paddingRight: '4px' }}>
              <label htmlFor="password" style={{ margin: 0 }}>Password</label>
              <button
                type="button"
                className="forgot-pass-btn"
                onClick={() => alert("Please contact administrator to reset your password.")}
              >
                Forgot?
              </button>
            </div>
            <div className="login-input-wrapper">
              <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="password"
                className="login-input"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={authData.password}
                onChange={(e) => setAuthData({ ...authData, password: e.target.value })}
                disabled={isLocked}
              />
              <button
                type="button"
                className="login-pass-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLocked}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg className="login-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg className="login-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            className="login-btn" 
            disabled={isLocked}
          >
            {isSignup ? "Initialize Account" : "Access Workspace"}
          </button>
        </form>

        <div className="login-footer">
          <span>{isSignup ? "Already have an account?" : "Need an enterprise account?"}</span>
          <button
            type="button"
            className="signup-toggle-btn"
            onClick={() => setIsSignup(!isSignup)}
          >
            {isSignup ? "Sign In" : "Request one"}
          </button>
        </div>
      </div>
    </div>
  );
}
