import { useState, useEffect } from "react";
import { BASE_URL } from "@/models/api.service";

// In-memory catalog cache to avoid duplicate network calls
const catalogCache = new Map();

/**
 * Fetch catalog items from API /api/catalog
 */
export async function loadCatalog({ customerId, taskKey }) {
  if (!customerId || !taskKey) return [];

  const cacheKey = `${customerId}:${taskKey}`;
  if (catalogCache.has(cacheKey)) {
    return catalogCache.get(cacheKey);
  }

  try {
    const url = `${BASE_URL}/api/catalog?customer_id=${encodeURIComponent(customerId)}&task_key=${encodeURIComponent(taskKey)}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[Catalog] Failed to load catalog for ${customerId}/${taskKey}:`, response.status);
      return [];
    }
    const payload = await response.json();
    const items = payload.items || [];
    catalogCache.set(cacheKey, items);
    return items;
  } catch (err) {
    console.error(`[Catalog] Network error loading catalog for ${customerId}/${taskKey}:`, err);
    return [];
  }
}

/**
 * Filter items by groupKey (or multiple groupKeys)
 */
export function catalogByGroup(items, groupKey) {
  if (!items || !Array.isArray(items)) return [];
  if (!groupKey) return items;
  if (Array.isArray(groupKey)) {
    const set = new Set(groupKey);
    return items.filter((item) => set.has(item.groupKey));
  }
  return items.filter((item) => item.groupKey === groupKey);
}

/**
 * Format canonical product string: "itemNumber · description"
 */
export function canonicalProductValue(item) {
  if (!item) return "";
  const number = String(item.itemNumber || "").trim();
  const description = String(item.description || item.label || "").trim();
  if (!number) return description || "";
  if (!description) return number;
  return `${number} · ${description}`;
}

/**
 * React hook for consuming catalog data in task components
 */
export function useCatalog(customerId, taskKey) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    if (!customerId || !taskKey) {
      setItems([]);
      return;
    }

    setLoading(true);
    loadCatalog({ customerId, taskKey })
      .then((data) => {
        if (isMounted) {
          setItems(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [customerId, taskKey]);

  return { items, loading, error };
}
