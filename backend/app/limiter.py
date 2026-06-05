from slowapi import Limiter
from slowapi.util import get_remote_address

# Đối tượng Limiter dùng chung trên toàn hệ thống để tránh circular imports
limiter = Limiter(key_func=get_remote_address)
