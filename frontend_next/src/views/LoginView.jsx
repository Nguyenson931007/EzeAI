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
      <div className="login-bg-blob blob-1"></div>
      <div className="login-bg-blob blob-2"></div>
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <span>⬢</span> EzeFloor
          </div>
          <p className="login-subtitle">
            Sign in to your account
          </p>
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          {isLocked && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '12px', borderRadius: '8px', marginBottom: '20px', color: '#f87171', fontSize: '13px', display: 'flex', gap: '8px' }}>
              <span>🔒</span> Account Temporarily Locked. Contact Admin to Unlock.
            </div>
          )}
          <div className="login-input-group">
            <label htmlFor="username">Username or Email</label>
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

          {isSignup && (
            <div className="login-input-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                className="login-input"
                type="email"
                placeholder="name@example.com"
                value={authData.email}
                onChange={(e) => setAuthData({ ...authData, email: e.target.value })}
              />
            </div>
          )}

          <div className="login-input-group password-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label htmlFor="password" style={{ margin: 0 }}>Password</label>
              <button
                type="button"
                className="forgot-pass-btn"
                onClick={() => alert("Please contact administrator to reset your password.")}
              >
                Forgot Password?
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                className="login-input"
                style={{ width: '100%', paddingRight: '60px' }}
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={authData.password}
                onChange={(e) => setAuthData({ ...authData, password: e.target.value })}
                disabled={isLocked}
              />
              <button
                type="button"
                className="login-pass-toggle"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLocked}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button type="submit" className="login-btn" disabled={isLocked} style={isLocked ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
            {isSignup ? "Create Account" : "Sign In"}
          </button>
        </form>

        <div className="login-footer">
          <p>
            {isSignup ? "Already have an account?" : "Don't have an account?"}
            <button
              type="button"
              className="signup-toggle-btn"
              onClick={() => setIsSignup(!isSignup)}
            >
              {isSignup ? "Sign In" : "Create one"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
