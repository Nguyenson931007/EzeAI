import { useMemo } from "react";
import { useAppModel } from "@/models/app.context";
import { normalizeFloorLevelCode, resolvePageFloorLevel } from "@/utils/floorLevel";

export default function useCurrentTaskFloorLevel(formData = {}) {
  const appModel = useAppModel ? useAppModel() : {};
  const pages = appModel?.pages || [];
  const currentPage = Number(appModel?.currentPage ?? 0);

  return useMemo(() => {
    if (pages.length > 0) return resolvePageFloorLevel(pages, currentPage);
    return normalizeFloorLevelCode(formData?.floor_level || formData?.floorLevel || "GF");
  }, [pages, currentPage, formData?.floor_level, formData?.floorLevel]);
}
