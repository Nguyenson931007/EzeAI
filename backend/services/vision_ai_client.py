"""Plan-level vision adapter for EzeFloor using OpenAI only.

All requests use the direct OpenAI Responses API and are locked to GPT-5.6 Luna.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from services.openai_client import extract_response_text, get_openai_model, openai_response


def vision_chat_completion(
    *,
    messages: List[Dict[str, Any]],
    response_format: Optional[Dict[str, Any]],
    temperature: float = 0.02,
    timeout_sec: int = 180,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    return openai_response(
        messages=messages,
        response_format=response_format,
        temperature=temperature,
        timeout_sec=timeout_sec,
        model=model,
    )


def vision_extract_text(raw: Dict[str, Any]) -> str:
    return extract_response_text(raw)


def current_provider() -> str:
    return "openai"


def current_model() -> str:
    return get_openai_model()
