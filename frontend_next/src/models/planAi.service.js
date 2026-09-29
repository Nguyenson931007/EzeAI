import { ApiService } from "./api.service";

/**
 * Plan-level AI bridge.
 * - review(): YOLO/OCR candidate pool -> vision review + field discovery.
 * - saveAcceptedFeedback(): explicit user action only; stores corrected final plan for training.
 */
export const PlanAiService = {
  review(options) {
    return ApiService.reviewPlanWithAI(options);
  },

  saveAcceptedFeedback(options) {
    return ApiService.savePlanAiFeedback(options);
  },

  splitDiscoveredFields(result) {
    const fields = Array.isArray(result?.discovered_fields) ? result.discovered_fields : [];
    return {
      mapped: fields.filter((x) => x.mapping_status === "mapped"),
      unmapped: fields.filter((x) => x.mapping_status !== "mapped"),
    };
  },
};

export default PlanAiService;
