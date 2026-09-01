/*
EzeFloor integration guide for EavesSoffitTask.

IMPORTANT:
- Remove hard-coded SHEET_BRAND_OPTIONS / SHEET_THICKNESS_OPTIONS /
  SOFFIT_BATTEN_OPTIONS / SOFFIT_BEAD_OPTIONS from the existing component.
- Do not fallback job id to "TestAI".
- Do not hard-code short_name when the customer can change.
- Product-like dropdowns must come from DB catalog via /api/catalog.

This is intentionally a guide/snippet, not a full replacement component,
because Brand/Thickness are not proven to be catalog product rows in the supplied DB schema.
Only wire a field to DB catalog when its DB group/usage configuration exists.
*/

import React, { useEffect, useMemo, useState } from "react";
import { loadCatalog, catalogByGroup, canonicalProductValue } from "./frontend_catalog_helpers";

export function useEavesCatalog(customerId) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!customerId) return;

    loadCatalog({ customerId, taskKey: "eaves" })
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      });

    return () => { cancelled = true; };
  }, [customerId]);

  return { items, error };
}

export function EavesProductDropdown({ items, groupKey, value, onChange }) {
  const options = useMemo(() => catalogByGroup(items, groupKey), [items, groupKey]);

  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select...</option>
      {options.map((item) => (
        <option
          key={`${item.groupKey || ""}:${item.usageKey || ""}:${item.itemNumber || item.id}`}
          value={canonicalProductValue(item) || ""}
        >
          {item.label}
        </option>
      ))}
    </select>
  );
}

// Expected parent context usage:
// const customerId = appModel.currentCustomerShortName;  // REQUIRED
// const jobId = appModel.currentJobId;                    // REQUIRED
// if (!customerId || !jobId) throw new Error("Missing customer/job context");
//
// Never do:
// const jobId = ... || "TestAI";
// short_name: "BUN-NSW-ACT";
