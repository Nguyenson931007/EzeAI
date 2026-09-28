# EzeFloor Gemini Support Agent (Phase 1)

This patch adds a reusable Gemini support-agent layer while keeping local YOLO/OCR as the primary detection pipeline.

## What it does

- `POST /api/ai/agent/plan` accepts the exact task/form schema, current task state, local AI output and an optional plan image.
- Gemini returns structured actions (`add_row`, `update_row`, wall actions, local-tool requests, review/noop).
- Backend rejects unknown form fields, unsupported actions and invalid select-option values.
- Destructive actions and low-confidence actions are never marked for automatic application.
- The agent does **not** write directly to SQL/database and does **not** mutate frontend state.
- Frontend `AiAgentService.executePlan()` dispatches only to task-owned handlers, so every task remains in control of its existing business logic.

## Environment

Use the existing project-level `.env`:

```env
GEMINI_API_KEY=your_key_here
GEMINI_AGENT_MODEL=gemini-2.5-flash
GEMINI_AGENT_TIMEOUT_SEC=180
```

The existing wall Gemini flow remains unchanged and can continue using `GEMINI_WALL_MODEL`.

## Example task schema

```js
const flooringSchema = {
  task: "flooring",
  fields: {
    typeArea: { type: "select", options: ["Dry", "Wet"], required: true },
    product: { type: "select", options: products.map(p => p.value), required: true },
    totalM2: { type: "number", required: true },
    generatedByAI: { type: "boolean" },
  },
  actions: ["add_row", "update_row", "review_item"],
};
```

A task can then call `AiAgentService.plan(...)`, inspect the plan, and provide only the real handlers it supports.
