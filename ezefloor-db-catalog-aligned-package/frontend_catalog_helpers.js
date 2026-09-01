export async function loadCatalog({ customerId, taskKey }) {
  if (!customerId || !taskKey) throw new Error("Missing customerId/taskKey");

  const response = await fetch(
    `/api/catalog?customer_id=${encodeURIComponent(customerId)}&task_key=${encodeURIComponent(taskKey)}`
  );

  if (!response.ok) throw new Error("Failed to load catalog");
  const payload = await response.json();
  return payload.items || [];
}

export function catalogByGroup(items, groupKey) {
  return (items || []).filter((item) => item.groupKey === groupKey);
}

export function canonicalProductValue(item) {
  if (!item) return null;
  const number = String(item.itemNumber || "").trim();
  const description = String(item.description || item.label || "").trim();
  if (!number) return description || null;
  if (!description) return number;
  return `${number} · ${description}`;
}
