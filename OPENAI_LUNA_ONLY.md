# EzeFloor OpenAI runtime

Runtime AI calls use the direct OpenAI Responses API only and are locked to `gpt-5.6-luna`.
Required env:

OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-luna
OPENAI_TIMEOUT_SEC=180
OPENAI_WALL_TIMEOUT_SEC=180
OPENAI_AGENT_TIMEOUT_SEC=180

Azure OpenAI variables are ignored by the patched runtime services.
