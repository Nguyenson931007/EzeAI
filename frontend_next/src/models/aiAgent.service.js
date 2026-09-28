import { ApiService } from "./api.service";

/**
 * Shared bridge for embedding the Gemini support agent into any EzeFloor task.
 *
 * A task owns its real schema + handlers. The agent can only propose actions;
 * EzeFloor validates them on the backend and this helper dispatches them to the
 * handlers explicitly supplied by the task component.
 */
export const AiAgentService = {
  plan(options) {
    return ApiService.planAiAgentTask(options);
  },

  async executePlan(plan, handlers = {}, { allowAutoApplyOnly = true } = {}) {
    const applied = [];
    const skipped = [];
    const failed = [];

    for (const action of plan?.actions || []) {
      const fn = handlers[action.action];
      if (typeof fn !== "function") {
        skipped.push({ action, reason: `No handler registered for ${action.action}` });
        continue;
      }
      if (allowAutoApplyOnly && !action.auto_apply) {
        skipped.push({ action, reason: "Action requires review" });
        continue;
      }
      try {
        const result = await fn(action);
        applied.push({ action, result });
      } catch (error) {
        failed.push({ action, error: error?.message || String(error) });
      }
    }

    return { applied, skipped, failed };
  },
};

export default AiAgentService;
