# EzeFloor Plan AI setup — OpenAI GPT-5.6 Luna

EzeFloor uses the direct OpenAI Responses API only. Azure OpenAI is not used.

```env
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-5.6-luna
OPENAI_TIMEOUT_SEC=180
OPENAI_PLAN_TIMEOUT_SEC=180
OPENAI_AGENT_TIMEOUT_SEC=180
OPENAI_WALL_TIMEOUT_SEC=180
OPENAI_MAX_OUTPUT_TOKENS=5000
OPENAI_WALL_MAX_OUTPUT_TOKENS=5000
OPENAI_WALL_MAX_RAW_CANDIDATES=160
OPENAI_WALL_MAX_RETRIES=3
OPENAI_WALL_IMAGE_MAX_SIDE=1400
OPENAI_WALL_IMAGE_QUALITY=78
OPENAI_WALL_MAX_CURRENT_WALLS=80
```

The code is hard-locked to `gpt-5.6-luna`. If `OPENAI_MODEL` is set to a different model, the request fails instead of silently switching models.

Plan review endpoint: `POST /api/ai/plan/review`
Accepted-feedback endpoint: `POST /api/ai/plan/feedback`
