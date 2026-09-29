"""Direct OpenAI Responses API client for EzeFloor.

All EzeFloor OpenAI features are intentionally locked to GPT-5.6 Luna.
Azure OpenAI is not used by this client.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

OPENAI_MODEL_ID = "gpt-5.6-luna"


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is not configured")
    return value


def get_openai_model() -> str:
    """Return the only model EzeFloor is allowed to use.

    OPENAI_MODEL may be omitted. If configured, it must still be gpt-5.6-luna
    so a stale environment variable cannot silently switch the application to a
    different model.
    """
    configured = os.getenv("OPENAI_MODEL", OPENAI_MODEL_ID).strip() or OPENAI_MODEL_ID
    if configured != OPENAI_MODEL_ID:
        raise RuntimeError(
            f"EzeFloor is locked to {OPENAI_MODEL_ID}; OPENAI_MODEL={configured!r} is not allowed"
        )
    return OPENAI_MODEL_ID


def _retry_delay(exc: urllib.error.HTTPError, attempt: int) -> float:
    retry_after = exc.headers.get("Retry-After") if exc.headers else None
    if retry_after:
        try:
            return max(1.0, float(retry_after))
        except (TypeError, ValueError):
            pass
    return min(45.0, 4.0 * (2 ** attempt))


def _responses_content(content: Any) -> Any:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return str(content)

    converted: List[Dict[str, Any]] = []
    for part in content:
        if not isinstance(part, dict):
            converted.append({"type": "input_text", "text": str(part)})
            continue
        ptype = part.get("type")
        if ptype in {"text", "input_text"}:
            converted.append({"type": "input_text", "text": str(part.get("text") or "")})
            continue
        if ptype in {"image_url", "input_image"}:
            image = part.get("image_url")
            if isinstance(image, dict):
                image_url = image.get("url") or image.get("image_url")
                detail = image.get("detail") or part.get("detail") or "high"
            else:
                image_url = image
                detail = part.get("detail") or "high"
            if not image_url:
                continue
            converted.append({"type": "input_image", "image_url": image_url, "detail": detail})
            continue
        if ptype == "input_file":
            converted.append(dict(part))
            continue
        # Unknown content is kept as text instead of silently dropping evidence.
        converted.append({"type": "input_text", "text": json.dumps(part, ensure_ascii=False)})
    return converted


def _responses_input(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    for message in messages:
        role = str(message.get("role") or "user")
        result.append({"role": role, "content": _responses_content(message.get("content", ""))})
    return result


def _text_format(response_format: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not response_format:
        return None
    kind = response_format.get("type")
    if kind == "json_object":
        return {"type": "json_object"}
    if kind == "json_schema":
        spec = response_format.get("json_schema") or {}
        fmt: Dict[str, Any] = {
            "type": "json_schema",
            "name": spec.get("name") or "ezefloor_output",
            "schema": spec.get("schema") or {"type": "object"},
            "strict": bool(spec.get("strict", True)),
        }
        return fmt
    raise RuntimeError(f"Unsupported OpenAI response format: {kind!r}")


def openai_response(
    *,
    messages: List[Dict[str, Any]],
    response_format: Optional[Dict[str, Any]] = None,
    temperature: float = 0.05,  # kept for call-site compatibility; Responses payload intentionally omits it
    timeout_sec: Optional[int] = None,
    model: Optional[str] = None,
    max_tokens: Optional[int] = None,
    reasoning_effort: Optional[str] = None,
) -> Dict[str, Any]:
    api_key = _required_env("OPENAI_API_KEY")
    model_name = get_openai_model()
    if model and model.strip() and model.strip() != model_name:
        raise RuntimeError(f"EzeFloor is locked to {model_name}; requested model {model!r} is not allowed")

    timeout = int(timeout_sec or os.getenv("OPENAI_TIMEOUT_SEC", "180"))
    max_retries = max(0, int(os.getenv("OPENAI_MAX_RETRIES", "3")))
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")

    payload: Dict[str, Any] = {
        "model": model_name,
        "input": _responses_input(messages),
    }

    # GPT-5.6 defaults to medium reasoning. For EzeFloor's extraction/review
    # calls that can consume most of max_output_tokens before the structured
    # JSON is emitted. Default to no hidden reasoning unless a call explicitly
    # asks for more.
    effort = (reasoning_effort or os.getenv("OPENAI_REASONING_EFFORT", "none")).strip().lower()
    allowed_efforts = {"none", "low", "medium", "high", "xhigh", "max"}
    if effort not in allowed_efforts:
        raise RuntimeError(
            f"Invalid OPENAI reasoning effort {effort!r}; expected one of {sorted(allowed_efforts)}"
        )
    payload["reasoning"] = {"effort": effort}

    fmt = _text_format(response_format)
    if fmt:
        payload["text"] = {"format": fmt}
    if max_tokens is not None:
        payload["max_output_tokens"] = int(max_tokens)

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    url = f"{base_url}/responses"

    for attempt in range(max_retries + 1):
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            if exc.code in {429, 500, 502, 503, 504} and attempt < max_retries:
                time.sleep(_retry_delay(exc, attempt))
                continue
            raise RuntimeError(f"OpenAI HTTP {exc.code}: {error_body[:2000]}") from exc
        except Exception as exc:
            if attempt < max_retries:
                time.sleep(min(12.0, 2.0 * (2 ** attempt)))
                continue
            raise RuntimeError(f"OpenAI request failed: {exc}") from exc

    raise RuntimeError("OpenAI request failed after retries")


def extract_response_text(raw: Dict[str, Any]) -> str:
    direct = raw.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()

    texts: List[str] = []
    for item in raw.get("output") or []:
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        for part in item.get("content") or []:
            if not isinstance(part, dict):
                continue
            if part.get("type") == "output_text" and isinstance(part.get("text"), str):
                texts.append(part["text"])
    if texts:
        return "\n".join(texts).strip()

    raise RuntimeError("OpenAI returned no output text")
