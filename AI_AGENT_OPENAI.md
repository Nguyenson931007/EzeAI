# EzeFloor OpenAI support agent

YOLO/local AI remains the primary detector. OpenAI is a support/reasoning layer.

Environment:

```env
OPENAI_API_KEY=...
OPENAI_WALL_MODEL=gpt-4o
OPENAI_AGENT_MODEL=gpt-4o
OPENAI_WALL_TIMEOUT_SEC=180
OPENAI_AGENT_TIMEOUT_SEC=180
```

Why `gpt-4o` instead of classic `gpt-4`: EzeFloor sends drawing images to the support model. Classic `gpt-4` is text-only, while `gpt-4o` accepts image input and supports structured output.

Endpoints:
- `POST /api/openai/rebuild-walls`
- `GET /api/ai/agent/capabilities`
- `POST /api/ai/agent/plan`

The generic agent is proposal-only and does not write directly to the database.
