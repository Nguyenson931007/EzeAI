import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is not configured")
    return value


def _chat_url(deployment: Optional[str] = None) -> str:
    endpoint = _required_env("AZURE_OPENAI_ENDPOINT").rstrip("/")
    deployment = (deployment or _required_env("AZURE_OPENAI_DEPLOYMENT")).strip()
    api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2025-01-01-preview").strip()
    return (
        f"{endpoint}/openai/deployments/{urllib.parse.quote(deployment, safe='')}/chat/completions"
        f"?api-version={urllib.parse.quote(api_version, safe='')}"
    )


def _retry_delay(exc: urllib.error.HTTPError, attempt: int) -> float:
    """Prefer Azure's Retry-After header; otherwise use a TPM-friendly backoff."""
    retry_after = exc.headers.get("Retry-After") if exc.headers else None
    if retry_after:
        try:
            return max(1.0, float(retry_after))
        except (TypeError, ValueError):
            pass
    # Token-rate windows are usually longer than normal transient HTTP failures.
    return min(45.0, 8.0 * (2 ** attempt))


def azure_chat_completion(
    *,
    messages: List[Dict[str, Any]],
    response_format: Optional[Dict[str, Any]] = None,
    temperature: float = 0.05,
    timeout_sec: Optional[int] = None,
    deployment: Optional[str] = None,
    max_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    api_key = _required_env("AZURE_OPENAI_API_KEY")
    timeout = int(timeout_sec or os.getenv("AZURE_OPENAI_TIMEOUT_SEC", "180"))
    max_retries = max(0, int(os.getenv("AZURE_OPENAI_MAX_RETRIES", "3")))

    payload: Dict[str, Any] = {
        "messages": messages,
        "temperature": temperature,
    }
    if response_format:
        payload["response_format"] = response_format
    if max_tokens is not None:
        payload["max_tokens"] = int(max_tokens)

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    url = _chat_url(deployment)

    for attempt in range(max_retries + 1):
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "api-key": api_key,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            if exc.code == 429 and attempt < max_retries:
                time.sleep(_retry_delay(exc, attempt))
                continue
            raise RuntimeError(f"Azure OpenAI HTTP {exc.code}: {error_body[:2000]}") from exc
        except Exception as exc:
            raise RuntimeError(f"Azure OpenAI request failed: {exc}") from exc

    raise RuntimeError("Azure OpenAI request failed after retries")


def extract_chat_text(raw: Dict[str, Any]) -> str:
    choices = raw.get("choices") or []
    if not choices:
        raise RuntimeError("Azure OpenAI returned no choices")
    message = (choices[0] or {}).get("message") or {}
    content = message.get("content")
    if isinstance(content, str) and content.strip():
        return content.strip()
    if isinstance(content, list):
        texts = []
        for part in content:
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                texts.append(part["text"])
        if texts:
            return "\n".join(texts).strip()
    raise RuntimeError("Azure OpenAI returned no message content")
