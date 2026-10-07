import React from "react";
import EnteredTaskActions from "@/components/shared/EnteredTaskActions";
import "./taskUi.css";

export function TaskCard({ children, className = "", style }) {
  return (
    <section className={`task-ui-card ${className}`.trim()} style={style}>
      {children}
    </section>
  );
}

export function TaskSectionHeader({
  title,
  isOpen,
  onToggle,
  actions,
  right,
  className = "",
}) {
  const clickable = typeof onToggle === "function";
  return (
    <div
      className={`task-ui-section-header${clickable ? " is-clickable" : ""} ${className}`.trim()}
      onClick={clickable ? onToggle : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      } : undefined}
    >
      <span className="task-ui-section-title">{title}</span>
      <div className="task-ui-section-right" onClick={(event) => event.stopPropagation()}>
        {right}
        {actions}
        {clickable && !actions ? (
          <button
            type="button"
            className="task-ui-chevron"
            onClick={onToggle}
            aria-label={isOpen ? "Collapse section" : "Expand section"}
            title={isOpen ? "Collapse" : "Expand"}
          >
            {isOpen ? "▲" : "▼"}
          </button>
        ) : null}
      </div>
    </div>
  );
}


export function TaskActionButtons({
  onAutoFill,
  onAddData,
  onClear,
  onSave,
  autoFillDisabled = false,
  addDataDisabled = false,
  saveDisabled = false,
  saveStatus = "idle",
  autoFillLabel = "Fill",
  saveLabel = "Save",
  dataSource = null,
  isReadOnly = false,
  onEdit = null,
  isLoadingFromDb = false,
}) {
  return (
    <EnteredTaskActions
      onAutoFill={onAutoFill}
      onAddData={onAddData}
      onClear={onClear}
      onSave={onSave}
      autoFillDisabled={autoFillDisabled}
      addDataDisabled={addDataDisabled}
      saveDisabled={saveDisabled}
      saveStatus={saveStatus}
      autoFillLabel={autoFillLabel}
      saveLabel={saveLabel}
      dataSource={dataSource}
      isReadOnly={isReadOnly}
      onEdit={onEdit}
      isLoadingFromDb={isLoadingFromDb}
    />
  );
}

export function TaskInlineEnteredSection({ title, children, footer, className = "", isOpen, onToggle, right }) {
  const isCollapsible = typeof isOpen === "boolean" && typeof onToggle === "function";
  const isVisible = isCollapsible ? isOpen : true;
  return (
    <section className={`task-ui-inline-entered${isCollapsible ? " is-collapsible" : ""} ${className}`.trim()}>
      {title ? (isCollapsible ? (
        <TaskSectionHeader title={title} isOpen={isOpen} onToggle={onToggle} right={right} />
      ) : (
        <div className="task-ui-inline-entered-title">{title}</div>
      )) : null}
      {isVisible ? <div className="task-ui-inline-entered-body">{children}</div> : null}
      {isVisible && footer ? <div className="task-ui-inline-entered-footer">{footer}</div> : null}
    </section>
  );
}
export function EnteredDataCard({
  title,
  isOpen,
  onToggle,
  onAutoFill,
  onAddData,
  onClear,
  onSave,
  autoFillDisabled = false,
  addDataDisabled = false,
  saveDisabled = false,
  saveStatus = "idle",
  autoFillLabel = "Fill",
  saveLabel = "Save",
  dataSource = null,
  isReadOnly = false,
  onEdit = null,
  isLoadingFromDb = false,
  children,
  footer,
  className = "",
}) {
  return (
    <TaskCard className={`task-ui-entered-card ${className}`.trim()}>
      <TaskSectionHeader
        title={title}
        isOpen={isOpen}
        onToggle={onToggle}
        actions={(
          <EnteredTaskActions
            onAutoFill={onAutoFill}
            onAddData={onAddData}
            onClear={onClear}
            onSave={onSave}
            isOpen={isOpen}
            onToggle={onToggle}
            autoFillDisabled={autoFillDisabled}
            addDataDisabled={addDataDisabled}
            saveDisabled={saveDisabled}
            saveStatus={saveStatus}
            autoFillLabel={autoFillLabel}
            saveLabel={saveLabel}
            dataSource={dataSource}
            isReadOnly={isReadOnly}
            onEdit={onEdit}
            isLoadingFromDb={isLoadingFromDb}
          />
        )}
      />
      {isOpen ? <div className="task-ui-entered-body">{children}</div> : null}
      {isOpen && footer ? <div className="task-ui-summary-footer">{footer}</div> : null}
    </TaskCard>
  );
}

export function TaskFieldGrid({ children, columns = 4, className = "", style }) {
  return (
    <div
      className={`task-ui-field-grid ${className}`.trim()}
      style={{ "--task-ui-columns": columns, ...style }}
    >
      {children}
    </div>
  );
}

export function TaskField({
  label,
  value,
  onChange,
  options,
  optionLabels,
  type = "text",
  placeholder,
  inputMode,
  disabled = false,
  readOnly = false,
  min,
  max,
  step,
  width,
  flex,
  minWidth,
  className = "",
  children,
}) {
  const isSelect = Array.isArray(options);
  const wrapStyle = {
    width: width || undefined,
    flex: flex || undefined,
    minWidth: minWidth || undefined,
  };

  return (
    <label className={`task-ui-field ${className}`.trim()} style={wrapStyle}>
      {label !== undefined && label !== null ? <span className="task-ui-field-label">{label}</span> : null}
      {children || (isSelect ? (
        <select
          className="task-ui-control task-ui-select"
          value={value ?? ""}
          onChange={(event) => onChange?.(event.target.value)}
          disabled={disabled}
        >
          {options.map((option) => {
            const optionValue = typeof option === "object" ? option.value : option;
            const fallbackLabel = typeof option === "object" ? option.label : option;
            const optionLabel = optionLabels?.[optionValue] ?? fallbackLabel;
            return <option key={String(optionValue)} value={optionValue}>{optionLabel}</option>;
          })}
        </select>
      ) : (
        <input
          className="task-ui-control task-ui-input"
          type={type}
          value={value ?? ""}
          placeholder={placeholder}
          inputMode={inputMode}
          disabled={disabled}
          readOnly={readOnly}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange?.(event.target.value)}
        />
      ))}
    </label>
  );
}

export function isAiGeneratedTaskRow(row) {
  if (!row || typeof row !== "object") return false;
  const autoFillSource = String(row.autofill_source ?? row.autoFillSource ?? "").trim().toLowerCase();
  const source = String(row.source ?? row.source_type ?? row.sourceType ?? "").trim().toLowerCase();
  // Explicit manual provenance always wins, including rows recalled from SQL
  // through Add data that may still carry legacy AI flags in saved payloads.
  if (autoFillSource === "manual" || source === "manual") return false;
  // Rows loaded from the database carry the DB badge instead.
  if (autoFillSource === "db" || source === "db") return false;

  if (row.ai_generated === true || row.aiGenerated === true || row.generatedByAI === true) return true;
  if (autoFillSource && autoFillSource !== "manual") return true;

  if (
    source === "floor_ceiling_sync" ||
    source === "floor_ceiling_ai" ||
    source === "floor-ceiling-ai" ||
    source === "window_autofill"
  ) {
    return true;
  }

  const rowId = String(row.id ?? "").trim().toLowerCase();
  return /(?:^|[-_])ai(?:[-_]|$)/.test(rowId);
}

export function isDbLoadedTaskRow(row) {
  if (!row || typeof row !== "object") return false;
  const autoFillSource = String(row.autofill_source ?? row.autoFillSource ?? "").trim().toLowerCase();
  const source = String(row.source ?? row.source_type ?? row.sourceType ?? "").trim().toLowerCase();
  if (autoFillSource === "manual" || source === "manual") return false;
  return autoFillSource === "db" || source === "db";
}

export function TaskRowNumber({ index, value, row, className = "" }) {
  const isAiGenerated = isAiGeneratedTaskRow(row);
  const isDbLoaded = !isAiGenerated && isDbLoadedTaskRow(row);
  const isGptGenerated = String(row?.generated_by || "").toLowerCase() === "gpt"
    || String(row?.source || "").toLowerCase().startsWith("gpt_")
    || String(row?.source || "").toLowerCase() === "gpt_document_ai";
  const displayValue = value ?? (Number.isFinite(Number(index)) ? Number(index) + 1 : "");

  return (
    <span className={`task-ui-row-number${isAiGenerated ? " is-ai-generated" : ""} ${className}`.trim()}>
      <span className="task-ui-row-number-value">{displayValue}</span>
      {isAiGenerated ? (
        <span
          className="task-ui-ai-row-badge"
          title={isGptGenerated ? "Generated by EzeIn" : "Generated by AI"}
          aria-label={isGptGenerated ? "Generated by EzeIn" : "Generated by AI"}
        >
          {isGptGenerated ? "EzeIn" : "AI"}
        </span>
      ) : null}
      {isDbLoaded ? (
        <span
          className="task-ui-ai-row-badge task-ui-db-row-badge"
          title="Loaded from database"
          aria-label="Loaded from database"
        >
          DB
        </span>
      ) : null}
    </span>
  );
}

export function TaskSummaryTable({ children, minWidth, className = "", compact = false }) {
  return (
    <div className="task-ui-table-scroll">
      <table
        className={`task-ui-summary-table${compact ? " is-compact" : ""} ${className}`.trim()}
        style={minWidth ? { minWidth } : undefined}
      >
        {children}
      </table>
    </div>
  );
}

export function TaskSummarySubsection({ title, children, className = "" }) {
  return (
    <section className={`task-ui-summary-subsection ${className}`.trim()}>
      <div className="task-ui-summary-subsection-title">{title}</div>
      {children}
    </section>
  );
}

export function TaskEmptyRow({ colSpan, children }) {
  return (
    <tr>
      <td className="task-ui-empty-row" colSpan={colSpan}>{children}</td>
    </tr>
  );
}

export function TaskSummaryFooter({ children, right }) {
  return (
    <div className="task-ui-summary-footer-inner">
      <span>{children}</span>
      {right ? <div className="task-ui-summary-footer-right">{right}</div> : null}
    </div>
  );
}
