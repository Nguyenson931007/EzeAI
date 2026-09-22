import { useState, useEffect } from "react";
import { BASE_URL } from "@/models/api.service";

// ProcurementApp-compatible catalog cache. Visible task loads first; the rest
// of the customer's catalog is warmed in the background for fast task switches.
const CACHE_TTL_MS = 5 * 60_000;
const taskCache = new Map();
const taskInflight = new Map();
const customerLoadedUntil = new Map();
const customerInflight = new Map();

const taskKeyFor = (customerId, taskKey) => `${String(customerId || "").trim()}::${String(taskKey || "").trim()}`;

function normalizeItem(row = {}) {
  const parameters = row.parameters && typeof row.parameters === "object" ? row.parameters : {};
  return {
    ...row,
    customerId: row.customerId ?? row.customer_id ?? "",
    taskKey: row.taskKey ?? row.task_key ?? "",
    usageKey: row.usageKey ?? row.usage_key ?? "",
    usageType: row.usageType ?? row.usage_type ?? "",
    sectionKey: row.sectionKey ?? row.section_key ?? null,
    groupKey: row.groupKey ?? row.group_key ?? null,
    subgroupKey: row.subgroupKey ?? row.subgroup_key ?? null,
    itemNumber: row.itemNumber ?? row.item_number ?? "",
    label: row.label ?? row.description ?? row.display_name ?? row.usage_label ?? "",
    description: row.description ?? row.label ?? row.display_name ?? "",
    unit: row.unit ?? "",
    sortOrder: row.sortOrder ?? row.sort_order ?? 0,
    parameters,
    metadata: parameters,
  };
}

async function requestJson(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Procurement catalog request failed (${response.status})`);
  }
  return response.json();
}

function cacheCustomerRows(customerId, rows) {
  const expiresAt = Date.now() + CACHE_TTL_MS;
  const grouped = new Map();
  for (const raw of Array.isArray(rows) ? rows : []) {
    const row = normalizeItem(raw);
    const task = String(row.taskKey || "").trim();
    if (!task) continue;
    if (!grouped.has(task)) grouped.set(task, []);
    grouped.get(task).push(row);
  }
  for (const [task, data] of grouped) {
    taskCache.set(taskKeyFor(customerId, task), { expiresAt, data });
  }
  customerLoadedUntil.set(String(customerId || "").trim(), expiresAt);
}

async function warmCustomer(customerId) {
  const customer = String(customerId || "").trim();
  if (!customer) return;
  if ((customerLoadedUntil.get(customer) || 0) > Date.now()) return;
  const existing = customerInflight.get(customer);
  if (existing) return existing;
  const pending = requestJson(`/data-find/using/all?customer_id=${encodeURIComponent(customer)}`)
    .then((rows) => cacheCustomerRows(customer, rows))
    .finally(() => customerInflight.delete(customer));
  customerInflight.set(customer, pending);
  return pending;
}

export async function loadCatalog({ customerId, taskKey }) {
  const customer = String(customerId || "").trim();
  const task = String(taskKey || "").trim();
  if (!customer || !task) return [];

  const key = taskKeyFor(customer, task);
  const cached = taskCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const existing = taskInflight.get(key);
  if (existing) return existing;

  const pending = requestJson(
    `/data-find/using?customer_id=${encodeURIComponent(customer)}&task_key=${encodeURIComponent(task)}`
  ).then((rows) => {
    const data = (Array.isArray(rows) ? rows : []).map(normalizeItem);
    taskCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    void warmCustomer(customer).catch((error) => console.warn("[ProcurementCatalog] warm cache failed", error));
    return data;
  }).finally(() => taskInflight.delete(key));

  taskInflight.set(key, pending);
  return pending;
}

export function invalidateCatalog(customerId, taskKey) {
  if (!customerId) {
    taskCache.clear();
    taskInflight.clear();
    customerLoadedUntil.clear();
    customerInflight.clear();
    return;
  }
  const customer = String(customerId).trim();
  customerLoadedUntil.delete(customer);
  customerInflight.delete(customer);
  if (taskKey) {
    const key = taskKeyFor(customer, taskKey);
    taskCache.delete(key);
    taskInflight.delete(key);
    return;
  }
  const prefix = `${customer}::`;
  for (const key of [...taskCache.keys()]) if (key.startsWith(prefix)) taskCache.delete(key);
  for (const key of [...taskInflight.keys()]) if (key.startsWith(prefix)) taskInflight.delete(key);
}

export function catalogByGroup(items, groupKey) {
  if (!Array.isArray(items)) return [];
  if (!groupKey) return items;
  const wanted = new Set((Array.isArray(groupKey) ? groupKey : [groupKey]).map((value) => String(value).toLowerCase()));
  return items.filter((item) => {
    const values = [
      item.groupKey,
      item.subgroupKey,
      item.parameters?.category,
      item.parameters?.area_key,
      item.parameters?.dropdown_key,
      item.parameters?.role,
    ].filter(Boolean).map((value) => String(value).toLowerCase());
    return values.some((value) => wanted.has(value));
  });
}

export function catalogByMetadata(items, key, value) {
  if (!Array.isArray(items)) return [];
  const wanted = Array.isArray(value) ? new Set(value.map(String)) : new Set([String(value)]);
  return items.filter((item) => wanted.has(String(item.parameters?.[key] ?? "")));
}

export function catalogOptionValues(items, keys = []) {
  const wanted = Array.isArray(keys) ? keys : [keys];
  const values = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    for (const key of wanted) {
      const value = key === "description" ? item.description : key === "itemNumber" ? item.itemNumber : item.parameters?.[key];
      const text = String(value ?? "").trim();
      if (text && !seen.has(text)) {
        seen.add(text);
        values.push(text);
      }
    }
  }
  return values;
}

export function canonicalProductValue(item) {
  if (!item) return "";
  const number = String(item.itemNumber || item.item_number || "").trim();
  const description = String(item.description || item.label || item.display_name || "").trim();
  if (!number) return description;
  if (!description) return number;
  return `${number} · ${description}`;
}

export function useCatalog(customerId, taskKey) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    if (!customerId || !taskKey) {
      setItems([]);
      setError(null);
      return undefined;
    }
    setLoading(true);
    setError(null);
    loadCatalog({ customerId, taskKey })
      .then((data) => {
        if (!active) return;
        setItems(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setItems([]);
        setError(err);
        setLoading(false);
      });
    return () => { active = false; };
  }, [customerId, taskKey]);

  return { items, loading, error };
}
