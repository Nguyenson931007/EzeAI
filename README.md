# EzeFloor env organizer v2

This patch expands the previous generic `Other / Project-Specific` bucket into dedicated groups for Document AI, Wall AI/OpenAI audit, Gemini legacy, OCR/YOLO, Wall Prior/geometry guidance, notifications, security, and ML runtime.

It preserves every current value, creates a timestamped `.env` backup, and only removes old duplicate aliases when the canonical replacement key already exists.
