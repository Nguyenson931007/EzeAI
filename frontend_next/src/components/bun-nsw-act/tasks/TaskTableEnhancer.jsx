"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { normalizeFloorLevelCode } from "@/utils/floorLevel";

const DATA_ROW_SELECTOR = "tbody tr";
const NON_FILTERABLE_HEADERS = new Set(["#", "stt", "số thứ tự", "no", "no.", "label"]);
const NON_EDITABLE_HEADERS = new Set(["#", "stt", "số thứ tự", "no", "no."]);
// Row interaction is shared here for every task:
// - single click selects/highlights a row only
// - double click is reserved for the task's own inline editor
// Never synthesize editing from a single click in this shared layer.

function isGroupRow(row) {
  const cells = Array.from(row?.cells || []);
  if (row?.dataset?.taskGroupRow === "true") return true;
  if (cells.length !== 1 || Number(cells[0]?.colSpan || 1) <= 1) return false;
  const label = String(cells[0]?.innerText || "").trim();
  return /\b(level|ground|first|second|third)\b|^(GF|FF|SF|TF)\b/i.test(label);
}

function cellValue(row, columnIndex) {
  const cell = row?.cells?.[columnIndex];
  const field = cell?.querySelector?.("select, input, textarea");
  const value = field && field.value !== undefined ? field.value : cell?.innerText;
  return String(value || "").replace(/\s+/g, " ").trim() || "(Blank)";
}

function dataRows(table) {
  return Array.from(table?.querySelectorAll(DATA_ROW_SELECTOR) || []).filter((row) => !isGroupRow(row));
}

function normalizedHeader(value) {
  return String(value || "").replace(/[▾▽]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// One inline-edit contract for every task table:
// double-click a row to edit, Enter commits it, Escape/click-out remains owned
// by the task.  Legacy green Save/✓ buttons stay as internal commit hooks but
// are hidden from the UI so every customer/task behaves the same way.
function isInlineSaveButton(button) {
  if (!button) return false;
  const label = String(button.title || button.getAttribute?.("aria-label") || "").trim();
  const text = String(button.textContent || "").replace(/\s+/g, " ").trim();
  return /^save(?:\s+(?:row|edit))?$/i.test(label) || /^(?:save|✓)$/i.test(text);
}

function isNonFilterableHeader(value) {
  const label = normalizedHeader(value);
  return NON_FILTERABLE_HEADERS.has(label) || /^label\b/.test(label);
}

function normalizedLevel(value) {
  return normalizeFloorLevelCode(value);
}

function groupLevel(row) {
  if (row?.dataset?.taskFloorLevel) return normalizedLevel(row.dataset.taskFloorLevel);
  const text = String(row?.cells?.[0]?.innerText || "").toUpperCase();
  const code = text.match(/\b(GF|FF|SF|TF|\d+F)\b/);
  if (code) return normalizedLevel(code[1]);
  const named = text.match(/\b(GROUND|FIRST|SECOND|THIRD)\s+FLOOR\b/);
  return normalizedLevel(named?.[0] || text);
}

function ensureLevelGroups(table) {
  const tbody = table?.tBodies?.[0];
  const headerRow = table?.tHead?.rows?.[table.tHead.rows.length - 1];
  if (!tbody || !headerRow) return;
  const existingGroups = Array.from(tbody.rows).filter(isGroupRow);
  if (existingGroups.some((row) => row.dataset.taskGeneratedGroup !== "true")) return;

  const headers = Array.from(headerRow.cells).map((cell) => normalizedHeader(cell.innerText));
  const levelColumn = headers.findIndex((label) => label === "level" || label === "floor" || label === "floor level");
  if (levelColumn < 0) return;

  const rows = Array.from(tbody.rows).filter((row) => (
    !isGroupRow(row) && row.cells.length > levelColumn && Number(row.cells[0]?.colSpan || 1) <= 1
  ));
  const desiredLevels = [];
  rows.forEach((row) => {
    const level = normalizedLevel(cellValue(row, levelColumn));
    if (desiredLevels[desiredLevels.length - 1] !== level) desiredLevels.push(level);
  });
  const existingLevels = existingGroups.map(groupLevel);
  if (desiredLevels.join("|") === existingLevels.join("|")) return;
  existingGroups.forEach((row) => row.remove());

  let previousLevel = null;
  rows.forEach((row) => {
    const level = normalizedLevel(cellValue(row, levelColumn));
    row.dataset.taskFloorLevel = level;
    if (level === previousLevel) return;
    const groupRow = document.createElement("tr");
    groupRow.dataset.taskGroupRow = "true";
    groupRow.dataset.taskGeneratedGroup = "true";
    groupRow.dataset.taskFloorLevel = level;
    const cell = document.createElement("td");
    cell.colSpan = headerRow.cells.length;
    cell.textContent = `Level: ${level}`;
    groupRow.appendChild(cell);
    tbody.insertBefore(groupRow, row);
    previousLevel = level;
  });
}

function applyStickyIdentityColumns(table) {
  const headerRow = table?.tHead?.rows?.[table.tHead.rows.length - 1];
  if (!headerRow) return;
  const headers = Array.from(headerRow.cells);
  const indexColumn = headers.findIndex((header) => {
    const label = normalizedHeader(header.innerText);
    return label === "#" || label === "stt" || label === "số thứ tự" || label === "no" || label === "no.";
  });
  const labelColumn = headers.findIndex((header) => /^label\b/.test(normalizedHeader(header.innerText)));

  table.querySelectorAll(".task-sticky-index-column, .task-sticky-label-column").forEach((cell) => {
    cell.classList.remove("task-sticky-index-column", "task-sticky-label-column");
    cell.style.removeProperty("--task-sticky-left");
  });

  const pinColumn = (columnIndex, className, left) => {
    if (columnIndex < 0) return;
    const header = headers[columnIndex];
    header.classList.add(className);
    header.style.setProperty("--task-sticky-left", `${Math.max(0, left)}px`);
    Array.from(table.tBodies || []).forEach((tbody) => {
      Array.from(tbody.rows || []).forEach((row) => {
        if (isGroupRow(row) || !row.cells[columnIndex]) return;
        const cell = row.cells[columnIndex];
        cell.classList.add(className);
        cell.style.setProperty("--task-sticky-left", `${Math.max(0, left)}px`);
        const rowBackground = window.getComputedStyle(row).backgroundColor;
        if (rowBackground && rowBackground !== "rgba(0, 0, 0, 0)") cell.style.backgroundColor = rowBackground;
      });
    });
  };

  pinColumn(indexColumn, "task-sticky-index-column", 0);
  if (labelColumn >= 0) {
    const indexWidth = indexColumn >= 0 ? headers[indexColumn].getBoundingClientRect().width : 0;
    pinColumn(labelColumn, "task-sticky-label-column", indexWidth);
  }
}

function updateGroupVisibility(table, collapsedGroups) {
  const rows = Array.from(table?.querySelectorAll(DATA_ROW_SELECTOR) || []);
  rows.forEach((row, index) => {
    if (!isGroupRow(row)) return;
    const level = groupLevel(row);
    const isCollapsed = collapsedGroups.has(level);
    row.dataset.taskFloorLevel = level;
    row.dataset.taskCollapsed = isCollapsed ? "true" : "false";
    let hasVisibleChild = false;
    for (let next = index + 1; next < rows.length && !isGroupRow(rows[next]); next += 1) {
      const filterVisible = rows[next].dataset.taskFilterVisible !== "false";
      rows[next].style.display = filterVisible && !isCollapsed ? "" : "none";
      if (filterVisible) {
        hasVisibleChild = true;
      }
    }
    row.style.display = hasVisibleChild ? "" : "none";
    const toggle = row.querySelector(":scope .task-floor-toggle");
    if (toggle) {
      toggle.textContent = isCollapsed ? "▸" : "▾";
      toggle.setAttribute("aria-expanded", String(!isCollapsed));
      toggle.title = isCollapsed ? `Show ${level}` : `Hide ${level}`;
    }
  });
}

/**
 * Enhances the existing task tables without forcing every task to duplicate
 * sticky-header, typography, scrolling and Excel-style filter code.
 */
export default function TaskTableEnhancer({ children, taskId, onBeforeInlineCommit }) {
  const rootRef = useRef(null);
  const filtersRef = useRef(new Map());
  const collapsedGroupsRef = useRef(new WeakMap());
  const inlineHistoryCapturedRef = useRef(false);
  // Shared Excel-style row edit layout lock.  Every task keeps ownership of
  // its business edit state, while this enhancer freezes the table geometry
  // before the double-click changes text cells into controls.
  const rowEditLayoutsRef = useRef(new WeakMap());
  // Keep the original inline styles for every row that receives the temporary
  // edit-layout lock. This matters when React switches directly from row A to
  // row B in one render: without a per-row snapshot, row A can keep the blue
  // editing class even though only row B is still being edited.
  const lockedRowLayoutsRef = useRef(new WeakMap());
  const [menu, setMenu] = useState(null);
  const [draftValues, setDraftValues] = useState(() => new Set());

  const captureInlineHistoryOnce = useCallback(() => {
    if (inlineHistoryCapturedRef.current) return;
    inlineHistoryCapturedRef.current = true;
    if (typeof onBeforeInlineCommit === "function") {
      onBeforeInlineCommit(taskId);
    }
  }, [onBeforeInlineCommit, taskId]);

  const captureRowEditLayout = useCallback((table, row) => {
    if (!table || !row) return;
    const headerRow = table.tHead?.rows?.[table.tHead.rows.length - 1];
    const headers = Array.from(headerRow?.cells || []);
    const cells = Array.from(row.cells || []);
    const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
    const snapshot = {
      rowIndex: bodyRows.indexOf(row),
      tableWidth: Math.max(1, Math.ceil(table.getBoundingClientRect().width)),
      rowHeight: Math.max(1, Math.ceil(row.getBoundingClientRect().height)),
      tableStyle: {
        width: table.style.width,
        minWidth: table.style.minWidth,
        maxWidth: table.style.maxWidth,
        tableLayout: table.style.tableLayout,
      },
      headers: headers.map((header) => ({
        node: header,
        widthPx: Math.max(1, Math.ceil(header.getBoundingClientRect().width)),
        width: header.style.width,
        minWidth: header.style.minWidth,
        maxWidth: header.style.maxWidth,
      })),
      rowStyle: {
        height: row.style.height,
        minHeight: row.style.minHeight,
        maxHeight: row.style.maxHeight,
      },
      cells: cells.map((cell) => ({
        node: cell,
        widthPx: Math.max(1, Math.ceil(cell.getBoundingClientRect().width)),
        width: cell.style.width,
        minWidth: cell.style.minWidth,
        maxWidth: cell.style.maxWidth,
        height: cell.style.height,
        minHeight: cell.style.minHeight,
        maxHeight: cell.style.maxHeight,
      })),
    };
    rowEditLayoutsRef.current.set(table, snapshot);
  }, []);

  const rememberLockedRowLayout = useCallback((row) => {
    if (!row || lockedRowLayoutsRef.current.has(row)) return;
    lockedRowLayoutsRef.current.set(row, {
      rowStyle: {
        height: row.style.height,
        minHeight: row.style.minHeight,
        maxHeight: row.style.maxHeight,
      },
      cells: Array.from(row.cells || []).map((cell) => ({
        node: cell,
        width: cell.style.width,
        minWidth: cell.style.minWidth,
        maxWidth: cell.style.maxWidth,
        height: cell.style.height,
        minHeight: cell.style.minHeight,
        maxHeight: cell.style.maxHeight,
      })),
    });
  }, []);

  const unlockRowEdit = useCallback((row) => {
    if (!row) return;
    const saved = lockedRowLayoutsRef.current.get(row);
    row.classList.remove("task-row-editing-locked");
    row.style.removeProperty("--task-edit-row-height");

    if (saved) {
      row.style.height = saved.rowStyle.height;
      row.style.minHeight = saved.rowStyle.minHeight;
      row.style.maxHeight = saved.rowStyle.maxHeight;
      saved.cells.forEach(({ node, width, minWidth, maxWidth, height, minHeight, maxHeight }, index) => {
        const target = node?.isConnected ? node : row.cells?.[index];
        if (!target) return;
        target.style.width = width;
        target.style.minWidth = minWidth;
        target.style.maxWidth = maxWidth;
        target.style.height = height;
        target.style.minHeight = minHeight;
        target.style.maxHeight = maxHeight;
      });
      lockedRowLayoutsRef.current.delete(row);
    }
  }, []);

  const restoreRowEditLayout = useCallback((table, snapshot) => {
    if (!table || !snapshot) return;
    table.classList.remove("task-row-edit-layout-locked");
    // A direct A -> B edit switch can leave more than one DOM row carrying
    // the temporary lock class. Always clear every stale lock in the table.
    table.querySelectorAll("tbody tr.task-row-editing-locked").forEach((row) => unlockRowEdit(row));
    table.style.width = snapshot.tableStyle.width;
    table.style.minWidth = snapshot.tableStyle.minWidth;
    table.style.maxWidth = snapshot.tableStyle.maxWidth;
    table.style.tableLayout = snapshot.tableStyle.tableLayout;
    snapshot.headers.forEach(({ node, width, minWidth, maxWidth }) => {
      if (!node?.isConnected) return;
      node.style.width = width;
      node.style.minWidth = minWidth;
      node.style.maxWidth = maxWidth;
    });
    const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
    const row = bodyRows[snapshot.rowIndex];
    snapshot.cells.forEach(({ node, width, minWidth, maxWidth, height, minHeight, maxHeight }, index) => {
      const target = node?.isConnected ? node : row?.cells?.[index];
      if (!target) return;
      target.style.width = width;
      target.style.minWidth = minWidth;
      target.style.maxWidth = maxWidth;
      target.style.height = height;
      target.style.minHeight = minHeight;
      target.style.maxHeight = maxHeight;
    });
    if (row) {
      row.style.height = snapshot.rowStyle.height;
      row.style.minHeight = snapshot.rowStyle.minHeight;
      row.style.maxHeight = snapshot.rowStyle.maxHeight;
    }
    rowEditLayoutsRef.current.delete(table);
  }, [unlockRowEdit]);

  const findEditingRow = useCallback((table, snapshot) => {
    if (!table) return null;
    let row = table.querySelector(
      'tbody tr[data-editing-row-id], tbody tr[data-editing-area-row-id]'
    );
    if (row) return row;

    const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
    const preferred = snapshot?.rowIndex >= 0 ? bodyRows[snapshot.rowIndex] : null;
    const hasEditor = (candidate) => Boolean(
      candidate && !isGroupRow(candidate) && candidate.querySelector(
        'input, select, textarea, [data-search-dropdown]'
      )
    );
    if (hasEditor(preferred)) return preferred;
    return bodyRows.find(hasEditor) || null;
  }, []);

  const applyRowEditLayout = useCallback((table) => {
    const snapshot = rowEditLayoutsRef.current.get(table);
    if (!snapshot) return;
    const editRow = findEditingRow(table, snapshot);
    if (!editRow) {
      restoreRowEditLayout(table, snapshot);
      return;
    }

    // Only one row may visually be in edit mode. React can batch "save old
    // row" + "open new row", so explicitly unlock the previous DOM row first.
    table.querySelectorAll("tbody tr.task-row-editing-locked").forEach((row) => {
      if (row !== editRow) unlockRowEdit(row);
    });
    rememberLockedRowLayout(editRow);

    table.classList.add("task-row-edit-layout-locked");
    table.style.width = `${snapshot.tableWidth}px`;
    table.style.minWidth = `${snapshot.tableWidth}px`;
    table.style.maxWidth = `${snapshot.tableWidth}px`;
    table.style.tableLayout = "fixed";

    snapshot.headers.forEach(({ node, widthPx }) => {
      if (!node?.isConnected) return;
      node.style.width = `${widthPx}px`;
      node.style.minWidth = `${widthPx}px`;
      node.style.maxWidth = `${widthPx}px`;
    });

    editRow.classList.add("task-row-editing-locked");
    editRow.style.setProperty("--task-edit-row-height", `${snapshot.rowHeight}px`);
    editRow.style.height = `${snapshot.rowHeight}px`;
    editRow.style.minHeight = `${snapshot.rowHeight}px`;
    editRow.style.maxHeight = `${snapshot.rowHeight}px`;

    const liveCells = Array.from(editRow.cells || []);
    snapshot.cells.forEach(({ widthPx }, index) => {
      const cell = liveCells[index];
      if (!cell) return;
      cell.style.width = `${widthPx}px`;
      cell.style.minWidth = `${widthPx}px`;
      cell.style.maxWidth = `${widthPx}px`;
      cell.style.height = `${snapshot.rowHeight}px`;
      cell.style.minHeight = `${snapshot.rowHeight}px`;
      cell.style.maxHeight = `${snapshot.rowHeight}px`;
    });
  }, [findEditingRow, rememberLockedRowLayout, restoreRowEditLayout, unlockRowEdit]);

  const applyFilters = useCallback((table) => {
    if (!table) return;
    const tableFilters = filtersRef.current.get(table) || new Map();
    dataRows(table).forEach((row) => {
      const visible = Array.from(tableFilters.entries()).every(([columnIndex, accepted]) => (
        !accepted || accepted.has(cellValue(row, columnIndex))
      ));
      row.dataset.taskFilterVisible = visible ? "true" : "false";
      row.style.display = visible ? "" : "none";
    });
    updateGroupVisibility(table, collapsedGroupsRef.current.get(table) || new Set());

    const headers = Array.from(table.tHead?.rows?.[table.tHead.rows.length - 1]?.cells || []);
    headers.forEach((header, columnIndex) => {
      header.classList.toggle("is-filter-active", tableFilters.has(columnIndex));
    });
  }, []);

  const openFilter = useCallback((event, table, columnIndex, title) => {
    event.preventDefault();
    event.stopPropagation();
    const values = Array.from(new Set(dataRows(table).map((row) => cellValue(row, columnIndex))))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    const tableFilters = filtersRef.current.get(table);
    const selected = tableFilters?.get(columnIndex);
    setDraftValues(new Set(tableFilters?.has(columnIndex) ? selected : values));
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({
      table,
      columnIndex,
      title: title || `Column ${columnIndex + 1}`,
      values,
      left: Math.min(rect.left, window.innerWidth - 270),
      top: Math.min(rect.bottom + 4, window.innerHeight - 390),
    });
  }, []);

  const enhanceTables = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll("table").forEach((table) => {
      const headerRow = table.tHead?.rows?.[table.tHead.rows.length - 1];
      if (!headerRow || !table.tBodies?.length) return;
      ensureLevelGroups(table);
      table.classList.add("task-data-table");
      const viewport = table.parentElement;
      if (viewport) viewport.classList.add("task-table-viewport");

      Array.from(headerRow.cells).forEach((header, columnIndex) => {
        const existingButton = header.querySelector(":scope > .task-table-filter-button");
        existingButton?.remove();
        const label = String(header.innerText || "").replace(/[▾▽]/g, "").replace(/\s+/g, " ").trim();
        if (!label || isNonFilterableHeader(label)) {
          header.classList.remove("task-table-filterable-header");
          header.removeAttribute("tabindex");
          return;
        }
        header.classList.add("task-table-filterable-header");
        header.tabIndex = 0;
        header.title = `Filter ${label}`;
        if (header.dataset.taskFilterBound === "true") return;
        header.dataset.taskFilterBound = "true";
        header.addEventListener("click", (event) => openFilter(event, table, columnIndex, label));
        header.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") openFilter(event, table, columnIndex, label);
        });
      });

      let previousGroupLevel = null;
      Array.from(table.querySelectorAll("tbody tr")).filter(isGroupRow).forEach((row) => {
        row.dataset.taskGroupRow = "true";
        row.classList.add("task-floor-group-row");
        const level = normalizedLevel(groupLevel(row));
        row.dataset.taskFloorLevel = level;
        row.dataset.taskDuplicateGroup = level === previousGroupLevel ? "true" : "false";
        previousGroupLevel = level;
        const cell = row.cells[0];
        if (cell) {
          cell.dataset.taskLevelCode = level;
          cell.dataset.taskLevelLabel = `Level: ${level}`;
        }
        if (row.dataset.taskDuplicateGroup === "true") return;
        if (!cell || cell.querySelector(":scope > .task-floor-toggle")) return;
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "task-floor-toggle";
        toggle.textContent = "▾";
        toggle.setAttribute("aria-label", `Toggle level ${level}`);
        toggle.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const collapsed = collapsedGroupsRef.current.get(table) || new Set();
          if (collapsed.has(level)) collapsed.delete(level);
          else collapsed.add(level);
          collapsedGroupsRef.current.set(table, collapsed);
          applyFilters(table);
        });
        cell.appendChild(toggle);
      });

      // Presentation hooks only. The original form/table DOM and each task's
      // business logic stay untouched; these classes let every task inherit
      // the Lockup visual language from one shared component.
      const tableCard = viewport?.parentElement;
      tableCard?.classList.add("task-ui-card", "task-ui-table-card");
      const footer = viewport?.nextElementSibling;
      if (footer && /entered|total/i.test(String(footer.textContent || ""))) {
        footer.classList.add("task-table-footer");
      }
      applyStickyIdentityColumns(table);
      applyFilters(table);
      applyRowEditLayout(table);

      dataRows(table).forEach((row) => {
        row.classList.add("task-row-selectable");
      });

      table.querySelectorAll("tbody button").forEach((button) => {
        const actionLabel = String(button.title || button.getAttribute("aria-label") || "").trim();
        button.classList.toggle("task-row-edit-action", /^edit\b/i.test(actionLabel));
        const inlineSave = isInlineSaveButton(button);
        button.classList.toggle("task-inline-save-button", inlineSave);
        if (inlineSave) {
          button.tabIndex = -1;
          button.setAttribute("aria-hidden", "true");
        }
      });
    });

    root.querySelectorAll(".entered-task-actions").forEach((actions) => {
      const header = actions.closest(".task-ui-section-header") || actions.parentElement;
      const card = header?.closest(".task-ui-entered-card") || header?.parentElement;
      header?.classList.add("task-entered-section-header");
      card?.classList.add("task-ui-card", "task-ui-entered-card");
    });

    root.querySelectorAll("div").forEach((element) => {
      if (element.closest("table") || element.classList.contains("entered-task-actions")) return;
      const style = element.style;
      if (style?.cursor !== "pointer" || style?.userSelect !== "none") return;
      element.classList.add("task-ui-section-header");
      element.parentElement?.classList.add("task-ui-card");
    });

    root.querySelectorAll("button").forEach((element) => {
      if (element.closest("table")) return;
      const style = element.style;
      if (style?.width !== "100%" || style?.display !== "flex" || style?.justifyContent !== "space-between") return;
      element.classList.add("task-ui-section-header", "task-ui-section-header-button");
      element.parentElement?.classList.add("task-ui-card");
    });

    const specialBanner = root.querySelector(".hardies-fire-walls-task > div:first-child");
    if (specialBanner) {
      specialBanner.classList.add("task-ui-special-banner");
      const bannerButtons = Array.from(specialBanner.querySelectorAll("button"));
      if (bannerButtons[0]) bannerButtons[0].classList.add("entered-task-action", "entered-task-action--autofill");
      if (bannerButtons[1] || bannerButtons[0]) {
        (bannerButtons[1] || bannerButtons[0]).classList.add("entered-task-action", "entered-task-action--confirm");
      }
    }
  }, [applyFilters, applyRowEditLayout, openFilter]);

  useEffect(() => {
    enhanceTables();
    const root = rootRef.current;
    if (!root) return undefined;
    let frame = null;
    const observer = new MutationObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(enhanceTables);
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enhanceTables, taskId]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    // Capture the exact read-mode geometry before React swaps the row content
    // to inputs/selects.  The business onDoubleClick handlers still own the
    // actual edit action; this only prevents Excel-like inline editing from
    // changing row height or column width.
    const captureBeforeRowEdit = (event) => {
      if (event.target?.closest?.(
        "button, input, select, textarea, a, [data-search-dropdown], [role='button']"
      )) return;
      const row = event.target?.closest?.("tbody tr");
      const table = row?.closest?.("table");
      if (!row || !table || !root.contains(table) || isGroupRow(row)) return;
      // Start a fresh logical edit transaction. History is captured lazily only
      // when this row is actually committed, so opening then cancelling an edit
      // never creates a no-op Ctrl+Z entry.
      inlineHistoryCapturedRef.current = false;
      captureRowEditLayout(table, row);
      requestAnimationFrame(() => {
        applyRowEditLayout(table);
        requestAnimationFrame(() => applyRowEditLayout(table));
      });
    };

    root.addEventListener("dblclick", captureBeforeRowEdit, true);
    return () => root.removeEventListener("dblclick", captureBeforeRowEdit, true);
  }, [applyRowEditLayout, captureRowEditLayout, taskId]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const commitInlineEditOnEnter = (event) => {
      if (event.defaultPrevented || event.isComposing || event.key !== "Enter") return;
      const row = event.target?.closest?.("tbody tr");
      const table = row?.closest?.("table");
      if (!row || !table || !root.contains(table) || isGroupRow(row)) return;
      if (!row.querySelector("input, select, textarea, [data-search-dropdown]")) return;

      const saveButton = Array.from(row.querySelectorAll("button")).find(isInlineSaveButton);
      if (!saveButton) return;

      captureInlineHistoryOnce();
      event.preventDefault();
      event.stopPropagation();
      saveButton.click();
      requestAnimationFrame(() => applyRowEditLayout(table));
    };

    root.addEventListener("keydown", commitInlineEditOnEnter, false);
    return () => root.removeEventListener("keydown", commitInlineEditOnEnter, false);
  }, [applyRowEditLayout, captureInlineHistoryOnce, taskId]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const getEditingRow = () => Array.from(root.querySelectorAll("tbody tr[data-editing-row-id]"))
      .find((row) => !isGroupRow(row));

    // Most task editors auto-save when the user clicks outside the active row.
    // Capture the pre-edit snapshot in the capture phase, before those task-level
    // document handlers commit their React state.
    const captureBeforeOutsideCommit = (event) => {
      const editingRow = getEditingRow();
      if (!editingRow) return;
      if (editingRow.contains(event.target)) return;
      captureInlineHistoryOnce();
    };

    // Keep compatibility with any task that still invokes its hidden internal
    // Save hook directly. Enter also reaches this path, but the once-guard makes
    // one row edit exactly one history transaction.
    const captureBeforeSaveClick = (event) => {
      const button = event.target?.closest?.("button");
      if (!button || !root.contains(button) || !isInlineSaveButton(button)) return;
      captureInlineHistoryOnce();
    };

    const captureBeforeFocusCommit = (event) => {
      const editingRow = event.target?.closest?.("tbody tr[data-editing-row-id]");
      if (!editingRow || !root.contains(editingRow)) return;
      const nextTarget = event.relatedTarget;
      if (nextTarget && editingRow.contains(nextTarget)) return;
      captureInlineHistoryOnce();
    };

    document.addEventListener("mousedown", captureBeforeOutsideCommit, true);
    root.addEventListener("click", captureBeforeSaveClick, true);
    root.addEventListener("focusout", captureBeforeFocusCommit, true);
    return () => {
      document.removeEventListener("mousedown", captureBeforeOutsideCommit, true);
      root.removeEventListener("click", captureBeforeSaveClick, true);
      root.removeEventListener("focusout", captureBeforeFocusCommit, true);
    };
  }, [captureInlineHistoryOnce, taskId]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const isControlTarget = (target) => Boolean(target?.closest?.(
      "button, input, select, textarea, a, [data-search-dropdown], [role='button']"
    ));

    const selectRowOnly = (event) => {
      if (isControlTarget(event.target)) return;
      const row = event.target?.closest?.("tbody tr");
      const table = row?.closest?.("table");
      if (!row || !table || !root.contains(table) || isGroupRow(row)) return;

      root.querySelectorAll("tbody tr.task-row-selected").forEach((selectedRow) => {
        if (selectedRow === row) return;
        selectedRow.classList.remove("task-row-selected");
        selectedRow.removeAttribute("aria-selected");
      });
      row.classList.add("task-row-selected");
      row.setAttribute("aria-selected", "true");
    };

    // Deliberately listen only for selection. Editing remains owned by each
    // task's onDoubleClick handler, so one click can never open an editor.
    root.addEventListener("click", selectRowOnly, false);
    return () => root.removeEventListener("click", selectRowOnly, false);
  }, [taskId]);

  useEffect(() => {
    setMenu(null);
    filtersRef.current = new Map();
    collapsedGroupsRef.current = new WeakMap();
    rowEditLayoutsRef.current = new WeakMap();
    lockedRowLayoutsRef.current = new WeakMap();
    inlineHistoryCapturedRef.current = false;
  }, [taskId]);

  useEffect(() => {
    if (!menu) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!event.target.closest(".task-table-filter-menu, .task-table-filterable-header")) setMenu(null);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu]);

  const applyMenuFilter = () => {
    if (!menu) return;
    const tableFilters = filtersRef.current.get(menu.table) || new Map();
    if (draftValues.size === menu.values.length) tableFilters.delete(menu.columnIndex);
    else tableFilters.set(menu.columnIndex, new Set(draftValues));
    filtersRef.current.set(menu.table, tableFilters);
    applyFilters(menu.table);
    setMenu(null);
  };

  const clearMenuFilter = () => {
    if (!menu) return;
    const tableFilters = filtersRef.current.get(menu.table) || new Map();
    tableFilters.delete(menu.columnIndex);
    filtersRef.current.set(menu.table, tableFilters);
    applyFilters(menu.table);
    setMenu(null);
  };

  return (
    <div ref={rootRef} className="task-module-enhanced">
      {children}

      {menu && (
        <div
          className="task-table-filter-menu"
          style={{ left: menu.left, top: menu.top }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="task-table-filter-menu__title">{menu.title}</div>
          <div className="task-table-filter-menu__tools">
            <button type="button" onClick={() => setDraftValues(new Set(menu.values))}>Select all</button>
            <button type="button" onClick={() => setDraftValues(new Set())}>Clear</button>
          </div>
          <div className="task-table-filter-menu__values">
            {menu.values.map((value) => (
              <label key={value}>
                <input
                  type="checkbox"
                  checked={draftValues.has(value)}
                  onChange={() => {
                    setDraftValues((current) => {
                      const next = new Set(current);
                      if (next.has(value)) next.delete(value);
                      else next.add(value);
                      return next;
                    });
                  }}
                />
                <span title={value}>{value}</span>
              </label>
            ))}
          </div>
          <div className="task-table-filter-menu__footer">
            <button type="button" onClick={() => setMenu(null)}>Cancel</button>
            <button type="button" onClick={clearMenuFilter}>Reset</button>
            <button type="button" className="is-primary" onClick={applyMenuFilter}>Apply</button>
          </div>
        </div>
      )}

      <style jsx global>{`
        .task-module-enhanced {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 11px;
          color: #0f2744;
        }
        .task-module-enhanced *,
        .task-table-filter-menu * {
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        }
        .task-module-enhanced section,
        .task-module-enhanced form,
        .task-module-enhanced .task-panel {
          color: #0f2744;
        }
        .task-module-enhanced > :first-child {
          gap: 6px !important;
        }
        .task-module-enhanced .task-ui-card {
          overflow: hidden !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 8px !important;
          background: #ffffff !important;
          box-shadow: none !important;
        }
        .task-module-enhanced .task-ui-section-header,
        .task-module-enhanced .task-entered-section-header {
          width: 100% !important;
          min-height: 38px !important;
          box-sizing: border-box !important;
          padding: 5px 8px !important;
          background: #f8fafc !important;
          border-bottom: 1px solid #cbd5e1 !important;
          color: #0f2744 !important;
          font-size: 12px !important;
          font-weight: 800 !important;
          line-height: 1.25 !important;
        }
        .task-module-enhanced .task-entered-section-header .entered-task-actions {
          margin-left: auto !important;
          margin-right: 0 !important;
        }
        .task-module-enhanced .task-entered-section-header {
          padding-right: 0 !important;
        }
        .task-module-enhanced .task-entered-section-header .entered-task-toggle {
          width: 12px !important;
          min-width: 12px !important;
          height: 24px !important;
          padding: 0 !important;
          margin-left: -1px !important;
          margin-right: 0 !important;
        }
        .task-module-enhanced .task-row-edit-action,
        .task-module-enhanced table tbody button[title^="Edit" i],
        .task-module-enhanced table tbody button[aria-label^="Edit" i] {
          display: none !important;
        }
        .task-module-enhanced table tbody .task-inline-save-button,
        .task-module-enhanced table tbody button[title^="Save" i],
        .task-module-enhanced table tbody button[aria-label^="Save" i] {
          display: none !important;
        }
        .task-module-enhanced button.task-ui-section-header-button {
          width: 100% !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          border: 0 !important;
          border-radius: 0 !important;
          cursor: pointer;
          text-align: left;
        }
        .task-module-enhanced .task-ui-section-header > span,
        .task-module-enhanced .task-entered-section-header > span {
          color: inherit;
          font: inherit;
        }
        .task-module-enhanced .task-ui-special-banner {
          padding: 10px 12px !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 8px !important;
          background: #f8fafc !important;
          color: #0f2744 !important;
          box-shadow: none !important;
        }
        .task-module-enhanced .task-ui-special-banner > div:first-child > div:last-child > div:first-child {
          color: #0f2744 !important;
          font-family: inherit !important;
          font-size: 12px !important;
          font-weight: 800 !important;
        }
        .task-module-enhanced .task-ui-special-banner > div:first-child > div:last-child > div:last-child {
          color: #64748b !important;
          font-family: inherit !important;
          font-size: 10.5px !important;
        }
        .task-module-enhanced .entered-task-action--autofill {
          min-height: 28px !important;
          padding: 3px 10px !important;
          border: 1px solid #93c5fd !important;
          border-radius: 5px !important;
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%) !important;
          color: #1d4ed8 !important;
          box-shadow: none !important;
          font-size: 10.5px !important;
          font-weight: 700 !important;
        }
        .task-module-enhanced .entered-task-action--clear {
          min-height: 28px !important;
          padding: 3px 10px !important;
          border: 1px solid #fecaca !important;
          border-radius: 5px !important;
          background: #ffffff !important;
          color: #b91c1c !important;
          font-size: 10.5px !important;
          font-weight: 700 !important;
        }
        .task-module-enhanced .entered-task-action--confirm {
          min-height: 28px !important;
          padding: 3px 10px !important;
          border: 1px solid #86efac !important;
          border-radius: 5px !important;
          background: #f0fdf4 !important;
          color: #15803d !important;
          box-shadow: none !important;
          font-size: 10.5px !important;
          font-weight: 700 !important;
        }
        .task-module-enhanced .entered-task-action--confirm.is-saved {
          border-color: #4ade80 !important;
          background: #dcfce7 !important;
        }
        .task-module-enhanced .entered-task-action--confirm.is-error {
          border-color: #fca5a5 !important;
          background: #fef2f2 !important;
          color: #b91c1c !important;
        }
        .task-module-enhanced input,
        .task-module-enhanced select,
        .task-module-enhanced textarea {
          box-sizing: border-box;
          border-color: #cbd5e1 !important;
          border-radius: 4px !important;
          background-color: #ffffff;
          color: #0f2744 !important;
          font-family: inherit !important;
          font-size: 10.5px !important;
        }
        .task-module-enhanced input:focus,
        .task-module-enhanced select:focus,
        .task-module-enhanced textarea:focus {
          border-color: #3b82f6 !important;
          outline: 1px solid #3b82f6 !important;
          outline-offset: -1px;
        }
        .task-module-enhanced label {
          color: #334155;
          font-family: inherit;
          font-size: 10.5px;
          font-weight: 700;
        }
        .task-module-enhanced table {
          font-family: inherit !important;
          font-size: 11px !important;
          color: #0f2744 !important;
          border-spacing: 0;
        }
        .task-module-enhanced table th {
          height: 34px;
          box-sizing: border-box;
          font-size: 10.5px !important;
          font-weight: 800 !important;
          line-height: 1.2;
          white-space: nowrap;
        }
        .task-module-enhanced tbody tr.task-row-selectable:not(.task-floor-group-row) {
          cursor: pointer;
        }
        .task-module-enhanced tbody tr.task-row-selected:not(.task-floor-group-row) {
          box-shadow: inset 3px 0 0 #2563eb, inset 0 0 0 1px #93c5fd;
        }
        .task-module-enhanced tbody tr.task-row-selected:not(.task-floor-group-row) > td {
          background-color: #eff6ff;
        }
        .task-module-enhanced table td {
          height: 31px;
          box-sizing: border-box;
          font-size: 10.5px !important;
          line-height: 1.25;
          color: #0f2744;
          border-bottom-color: #e2e8f0 !important;
        }
        .task-module-enhanced td[data-edit-field] {
          position: relative;
          overflow: hidden;
        }
        .task-module-enhanced tr.task-row-editing-locked > td {
          height: var(--task-edit-row-height, 31px) !important;
          min-height: var(--task-edit-row-height, 31px) !important;
          max-height: var(--task-edit-row-height, 31px) !important;
          padding-top: 2px !important;
          padding-bottom: 2px !important;
          overflow: hidden !important;
          white-space: nowrap !important;
          vertical-align: middle !important;
          background-clip: padding-box;
        }
        .task-module-enhanced tr.task-row-editing-locked > td[data-edit-field],
        .task-module-enhanced tr.task-row-editing-locked > td:has(input, select, textarea, [data-search-dropdown]) {
          background: #eff6ff !important;
          box-shadow: inset 0 0 0 1px #93c5fd;
        }
        .task-module-enhanced tr.task-row-editing-locked input,
        .task-module-enhanced tr.task-row-editing-locked select,
        .task-module-enhanced tr.task-row-editing-locked textarea,
        .task-module-enhanced tr.task-row-editing-locked [data-search-dropdown] {
          box-sizing: border-box !important;
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          height: 24px !important;
          min-height: 24px !important;
          max-height: 24px !important;
          margin: 0 !important;
          padding-top: 1px !important;
          padding-bottom: 1px !important;
          line-height: 20px !important;
        }
        .task-module-enhanced tr.task-row-editing-locked > td > div:has(input, select, textarea, [data-search-dropdown]) {
          box-sizing: border-box !important;
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          height: 24px !important;
          min-height: 24px !important;
          max-height: 24px !important;
          margin: 0 !important;
          gap: 3px !important;
          flex-wrap: nowrap !important;
          overflow: hidden !important;
          align-items: center !important;
        }
        .task-module-enhanced tr.task-row-editing-locked > td > div:has(input, select, textarea, [data-search-dropdown]) > input,
        .task-module-enhanced tr.task-row-editing-locked > td > div:has(input, select, textarea, [data-search-dropdown]) > select {
          flex: 1 1 0 !important;
          width: auto !important;
          min-width: 0 !important;
          max-width: 100% !important;
        }
        .task-module-enhanced td[data-edit-field] > input,
        .task-module-enhanced td[data-edit-field] > select,
        .task-module-enhanced td[data-edit-field] > div {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box;
        }
        .task-module-enhanced td[data-edit-field] select,
        .task-module-enhanced td[data-edit-field] input {
          max-width: 100% !important;
          min-width: 0 !important;
        }
        .task-module-enhanced td[data-edit-field="size"] > div > select {
          width: calc(50% - 6px) !important;
          min-width: 0 !important;
        }
        .task-module-enhanced input,
        .task-module-enhanced select,
        .task-module-enhanced button {
          font-family: inherit;
        }
        .task-table-viewport {
          position: relative;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          box-sizing: border-box !important;
          max-height: min(58vh, 640px);
          overflow: auto !important;
          overscroll-behavior: contain;
        }
        .task-table-viewport > .task-data-table {
          margin: 0 !important;
        }
        .task-data-table thead th {
          position: sticky !important;
          top: 0;
          z-index: 8 !important;
          background: #243f70 !important;
          color: #ffffff !important;
          box-shadow: inset 0 -2px 0 #3b82f6;
        }
        .task-data-table thead th.task-sticky-index-column,
        .task-data-table thead th.task-sticky-label-column {
          position: sticky !important;
          left: var(--task-sticky-left, 0px) !important;
          z-index: 14 !important;
          background: #243f70 !important;
        }
        .task-data-table tbody td.task-sticky-index-column,
        .task-data-table tbody td.task-sticky-label-column {
          position: sticky !important;
          left: var(--task-sticky-left, 0px) !important;
          z-index: 6 !important;
        }
        .task-data-table tbody td.task-sticky-label-column {
          box-shadow: 2px 0 0 #cbd5e1;
        }
        .task-table-filterable-header { cursor: pointer; }
        .task-table-filterable-header:hover { background: #315487 !important; }
        .task-table-filterable-header.is-filter-active {
          background: #1d4ed8 !important;
          box-shadow: inset 0 -3px 0 #fbbf24;
        }
        .task-floor-group-row > td {
          position: sticky !important;
          left: 0 !important;
          z-index: 7 !important;
          height: 30px !important;
          padding: 5px 34px 5px 10px !important;
          background: #eaf2ff !important;
          border-top: 2px solid #93c5fd !important;
          border-bottom: 1px solid #bfdbfe !important;
          color: #1e3a5f !important;
          font-size: 0 !important;
          font-weight: 800 !important;
          white-space: nowrap;
        }
        .task-floor-group-row > td > :not(.task-floor-toggle) {
          display: none !important;
        }
        .task-floor-group-row > td::before {
          content: attr(data-task-level-label);
          color: #1e3a5f;
          font-family: inherit;
          font-size: 10.5px;
          font-weight: 800;
        }
        .task-floor-group-row > td::after {
          content: none;
        }
        .task-floor-group-row[data-task-duplicate-group="true"] {
          display: none !important;
        }
        .task-floor-toggle {
          position: absolute;
          top: 50%;
          right: 8px;
          width: 20px;
          height: 20px;
          padding: 0;
          transform: translateY(-50%);
          border: 1px solid #93c5fd;
          border-radius: 4px;
          background: #ffffff;
          color: #1d4ed8;
          cursor: pointer;
          font-size: 12px;
          font-weight: 900;
          line-height: 18px;
        }
        .task-floor-toggle:hover { background: #dbeafe; }
        .task-table-footer {
          box-sizing: border-box !important;
          min-height: 36px;
          padding: 9px 12px !important;
          background: #f8fafc !important;
          border-top: 1px solid #cbd5e1 !important;
          color: #475569 !important;
          font-family: inherit !important;
          font-size: 10.5px !important;
          font-weight: 500 !important;
        }
        .task-table-filter-menu {
          position: fixed;
          z-index: 10050;
          width: 258px;
          max-height: 380px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: #ffffff;
          border: 1px solid #94a3b8;
          border-radius: 8px;
          box-shadow: 0 16px 40px rgba(15, 23, 42, .22);
          color: #0f172a;
          font-size: 11px;
        }
        .task-table-filter-menu__title {
          padding: 9px 10px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          font-size: 11.5px;
          font-weight: 800;
        }
        .task-table-filter-menu__tools,
        .task-table-filter-menu__footer {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px 9px;
        }
        .task-table-filter-menu__tools { border-bottom: 1px solid #e2e8f0; }
        .task-table-filter-menu__footer { justify-content: flex-end; border-top: 1px solid #e2e8f0; }
        .task-table-filter-menu button {
          min-height: 25px;
          padding: 3px 8px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          background: #ffffff;
          color: #334155;
          font-size: 10.5px;
          font-weight: 700;
          cursor: pointer;
        }
        .task-table-filter-menu button.is-primary {
          background: #2563eb;
          border-color: #2563eb;
          color: #ffffff;
        }
        .task-table-filter-menu__values {
          min-height: 70px;
          overflow: auto;
          padding: 5px 8px;
        }
        .task-table-filter-menu__values label {
          display: flex;
          align-items: center;
          gap: 7px;
          min-height: 27px;
          padding: 2px 4px;
          border-radius: 4px;
          cursor: pointer;
        }
        .task-table-filter-menu__values label:hover { background: #eff6ff; }
        .task-table-filter-menu__values span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
