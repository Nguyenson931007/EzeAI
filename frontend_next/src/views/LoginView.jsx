import React from "react";

export default function LoginView({
  authData, setAuthData,
  showPassword, setShowPassword,
  isLocked,
  handleLogin,
  ssoLoading = false,
  ssoStatusText = "Syncing SSO sign-in & loading project..."
}) {
  return (
    <div className="login-split-root">
      {/* Central 2-Column Card */}
      <div className="login-split-card">
        
        {/* LEFT COLUMN: Form & Logo */}
        <div className="login-split-left">
          {/* Top Logo */}
          <div className="login-split-logo">
            <img
              src="/logo.png"
              alt="EzeFloor"
              className="login-logo-img"
            />
          </div>

          {/* Form Container */}
          <div className="login-split-form-container">
            <h1 className="login-split-title">Login</h1>

            {ssoLoading ? (
              <div className="login-sso-container">
                <div className="login-spinner"></div>
                <div className="login-sso-title">
                  {ssoStatusText}
                </div>
                <div className="login-sso-desc">
                  Please wait while initializing your secure session...
                </div>
              </div>
            ) : (
              <form className="login-form" onSubmit={handleLogin}>
                {isLocked && (
                  <div className="login-locked-alert">
                    <span className="locked-icon">🔒</span>
                    <div>
                      <div style={{ fontWeight: 700 }}>Account Temporarily Locked</div>
                      <div style={{ fontSize: "12px", opacity: 0.85 }}>Please contact admin to unlock access.</div>
                    </div>
                  </div>
                )}

                {/* Username Input */}
                <div className="login-split-field">
                  <input
                    id="username"
                    className="login-split-input"
                    type="text"
                    placeholder="Username"
                    value={authData.username}
                    onChange={(e) => setAuthData({ ...authData, username: e.target.value })}
                    disabled={isLocked}
                    required
                    autoFocus
                  />
                </div>

                {/* Password Input */}
                <div className="login-split-field">
                  <div className="login-split-input-wrapper">
                    <input
                      id="password"
                      className="login-split-input"
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      value={authData.password}
                      onChange={(e) => setAuthData({ ...authData, password: e.target.value })}
                      disabled={isLocked}
                      required
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
                  <div className="login-forgot-wrap">
                    <span className="login-forgot-link">Forgot Your Password?</span>
                  </div>
                </div>

                {/* Pill Action Button */}
                <div className="login-split-btn-wrap">
                  <button
                    type="submit"
                    className="login-pill-btn"
                    disabled={isLocked}
                  >
                    LOGIN
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Architectural Hero with Blueprint & Blue Gradient */}
        <div className="login-split-right">
          {/* Blueprint Drawing Background Overlay */}
          <div className="login-split-bg-image"></div>
          <div className="login-split-gradient-overlay"></div>
          <div className="login-split-grid"></div>
        </div>

      </div>
    </div>
  );
}

