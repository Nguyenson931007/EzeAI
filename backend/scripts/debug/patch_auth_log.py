import sys

def patch():
    path = "d:/11.5/EzeFloor-main/backend/api/auth.py"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
        
    old_code = """def validate_session(
    auth_username: str = Header(..., alias="X-Username"), 
    session_token_cookie: Optional[str] = Cookie(None, alias="session_token"),
    session_token_header: Optional[str] = Header(None, alias="X-Session-Token")
):
    session_token = session_token_cookie or session_token_header
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT session_token, last_active FROM users WHERE username = ?", (auth_username,))
        row = cursor.fetchone()
        if not row or row["session_token"] != session_token:
            raise HTTPException(status_code=401, detail="Session invalidated (logged in from another device)")"""
            
    new_code = """import logging
logger = logging.getLogger(__name__)

def validate_session(
    auth_username: str = Header(..., alias="X-Username"), 
    session_token_cookie: Optional[str] = Cookie(None, alias="session_token"),
    session_token_header: Optional[str] = Header(None, alias="X-Session-Token")
):
    session_token = session_token_cookie or session_token_header
    
    logger.debug(f"[AUTH] validating session for user: {auth_username}")
    logger.debug(f"[AUTH] cookie token: {bool(session_token_cookie)}, header token: {bool(session_token_header)}")
    
    if not session_token:
        logger.warning(f"[AUTH] No session token provided for user {auth_username}")
        raise HTTPException(status_code=401, detail="Unauthorized: Missing session token")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT session_token, last_active FROM users WHERE username = ?", (auth_username,))
        row = cursor.fetchone()
        
        if not row:
            logger.warning(f"[AUTH] User {auth_username} not found in database")
            raise HTTPException(status_code=401, detail="Unauthorized: User not found")
            
        if row["session_token"] != session_token:
            logger.warning(f"[AUTH] Token mismatch for user {auth_username}")
            raise HTTPException(status_code=401, detail="Session invalidated (logged in from another device)")
            
        logger.debug(f"[AUTH] Successfully authenticated user: {auth_username}")"""

    if old_code in content:
        content = content.replace(old_code, new_code)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print("Patched api/auth.py for logging")
    else:
        print("Could not find signature in api/auth.py")

if __name__ == "__main__":
    patch()
