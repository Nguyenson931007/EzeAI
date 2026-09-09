"""
app/api/dependencies.py – Common API dependencies (authentication & user context)
"""
from typing import Optional
from fastapi import Request, HTTPException
from pydantic import BaseModel

class CurrentUser(BaseModel):
    id: Optional[int] = None
    username: str = "admin"
    email: Optional[str] = None
    role: str = "admin"

def get_current_user(request: Request = None) -> CurrentUser:
    return CurrentUser(username="admin", role="admin")
