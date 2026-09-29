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
OPENAI_WALL_MAX_RAW_CANDIDATES=320
OPENAI_WALL_MAX_RETRIES=3
OPENAI_WALL_IMAGE_MAX_SIDE=2048
OPENAI_WALL_REASONING_EFFORT=medium
OPENAI_WALL_MAX_CURRENT_WALLS=80
OPENAI_WALL_AUDIT_COLUMNS=3
OPENAI_WALL_AUDIT_ROWS=3
OPENAI_WALL_AUDIT_MAX_TARGETS=42
OPENAI_WALL_AUDIT_CONCURRENCY=3
OPENAI_WALL_AUDIT_ADD_CONFIDENCE=0.94
OPENAI_WALL_AUDIT_DELETE_CONFIDENCE=0.98
OPENAI_WALL_AUDIT_REPLACE_CONFIDENCE=0.97
OPENAI_WALL_AUDIT_CONFIRM_CONFIDENCE=0.96
```

The code is hard-locked to `gpt-5.6-luna`. If `OPENAI_MODEL` is set to a different model, the request fails instead of silently switching models.

Wall review uses a regional sparse-change audit. YOLO produces the baseline and
high-recall alternatives. Luna sees overlapping local crops and may propose only
`add`, `delete`, or `replace` findings using existing candidate IDs; it cannot
invent coordinates, thickness, classes, or geometry. Omitted walls remain exactly
as YOLO produced them. Every proposal must pass action-specific confidence gates,
local replacement-distance/orientation checks, and a separate full-plan before/
after confirmation call before it can modify geometry. If any region or the
confirmation request fails, that part fails safe to the original YOLO baseline.
Dense plan crops are sent losslessly as PNG with original image detail.

Plan review endpoint: `POST /api/ai/plan/review`
Accepted-feedback endpoint: `POST /api/ai/plan/feedback`
