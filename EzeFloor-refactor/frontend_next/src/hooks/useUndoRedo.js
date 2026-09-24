import { useState } from "react";

const clone = (v) => structuredClone(v);

export function useUndoRedo(initial) {
  const [past, setPast] = useState([]);
  const [present, setPresent] = useState(clone(initial));
  const [future, setFuture] = useState([]);

  /* ===== SET WITH DATA ONLY ===== */
  const set = (next) => {
    const value = typeof next === "function"
      ? next(present)   // ⬅️ resolve function HERE
      : next;

    setPast(p => [...p, clone(present)]);
    setPresent(clone(value));
    setFuture([]);
  };

  const reset = (value) => {
    setPast([]);
    setFuture([]);
    setPresent(clone(value));
  };

  const undo = () => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setPast(p => p.slice(0, -1));
    setFuture(f => [clone(present), ...f]);
    setPresent(clone(prev));
  };

  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setFuture(f => f.slice(1));
    setPast(p => [...p, clone(present)]);
    setPresent(clone(next));
  };

  return {
    state: present,
    set,
    reset,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
