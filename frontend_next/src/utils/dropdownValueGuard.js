// Shared guard for any value that is rendered/stored through a dropdown.
// Generated rows must never invent free-form values for select-backed fields.

const text = (value) => String(value ?? "").trim();
const norm = (value) => text(value)
  .toLowerCase()
  .replace(/[×x]/g, "x")
  .replace(/[–—]/g, "-")
  .replace(/\s+/g, " ")
  .trim();

export const DEFAULT_DROPDOWN_PLACEHOLDERS = new Set([
  "",
  "select",
  "select...",
  "please select",
  "please select...",
  "none configured",
  "no options",
]);

export function dropdownValues(options = [], getValue = null) {
  const values = [];
  for (const option of Array.isArray(options) ? options : []) {
    const raw = getValue
      ? getValue(option)
      : (option && typeof option === "object"
        ? (option.value ?? option.label ?? option.description ?? option.name ?? option.code)
        : option);
    const value = text(raw);
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

export function firstDropdownValue(options = [], { getValue = null, exclude = [] } = {}) {
  const excluded = new Set([...DEFAULT_DROPDOWN_PLACEHOLDERS, ...(exclude || []).map(norm)]);
  return dropdownValues(options, getValue).find((value) => !excluded.has(norm(value))) || "";
}

export function resolveDropdownValue(candidate, options = [], {
  getValue = null,
  aliases = null,
  fallback = "",
} = {}) {
  const values = dropdownValues(options, getValue);
  if (!values.length) return fallback;

  const raw = text(candidate);
  if (!raw) return fallback;

  const exact = values.find((value) => value === raw);
  if (exact) return exact;

  const normalized = norm(raw);
  const normalizedMatch = values.find((value) => norm(value) === normalized);
  if (normalizedMatch) return normalizedMatch;

  if (aliases && typeof aliases === "object") {
    const aliasTarget = aliases[raw] ?? aliases[normalized];
    if (aliasTarget !== undefined) {
      const resolvedAlias = resolveDropdownValue(aliasTarget, values, { fallback: "" });
      if (resolvedAlias) return resolvedAlias;
    }
  }

  return fallback;
}

export function resolveOrFirstDropdownValue(candidate, options = [], config = {}) {
  const resolved = resolveDropdownValue(candidate, options, config);
  if (resolved) return resolved;
  return firstDropdownValue(options, config);
}

export function sanitizeGeneratedDropdownRow(row, fieldRules = {}) {
  if (!row || typeof row !== "object") return row;
  const next = { ...row };
  for (const [field, rule] of Object.entries(fieldRules || {})) {
    const options = typeof rule?.options === "function" ? rule.options(next) : (rule?.options || []);
    next[field] = resolveDropdownValue(next[field], options, {
      getValue: rule?.getValue || null,
      aliases: rule?.aliases || null,
      fallback: rule?.fallback ?? "",
    });
  }
  return next;
}

export function isDropdownBackedValue(value, options = [], config = {}) {
  if (!text(value)) return true;
  return Boolean(resolveDropdownValue(value, options, { ...config, fallback: "" }));
}
