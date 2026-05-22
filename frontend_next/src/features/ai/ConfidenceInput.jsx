import React, { useState } from 'react';

export default function ConfidenceInput({ value, onChange }) {
  const [localVal, setLocalVal] = useState(value.toFixed(2));
  const [focused, setFocused] = useState(false);

  React.useEffect(() => {
    if (!focused) setLocalVal(value.toFixed(2));
  }, [value, focused]);

  const handleBlur = () => {
    setFocused(false);
    let numeric = parseFloat(localVal);
    if (isNaN(numeric)) numeric = value;
    const clamped = Math.max(0, Math.min(1, numeric));
    setLocalVal(clamped.toFixed(2));
    onChange(clamped);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { handleBlur(); e.target.blur(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); const v = Math.min(1, value + 0.01); setLocalVal(v.toFixed(2)); onChange(v); }
    if (e.key === 'ArrowDown') { e.preventDefault(); const v = Math.max(0, value - 0.01); setLocalVal(v.toFixed(2)); onChange(v); }
  };

  return (
    <input
      type="text"
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onDoubleClick={(e) => e.target.select()}
      style={{
        width: 42,
        background: focused ? 'rgba(47,129,255,0.08)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${focused ? 'rgba(47,129,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
        color: '#f5f7ff',
        fontSize: 11,
        fontWeight: 700,
        fontFamily: "'Inter', monospace",
        textAlign: 'center',
        padding: '3px 4px',
        borderRadius: 6,
        outline: 'none',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
      }}
      title="Double click to edit or use Up/Down keys"
    />
  );
}
