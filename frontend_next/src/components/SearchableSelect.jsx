import React, { useState, useEffect, useRef, useMemo } from 'react';

function HighlightMatch({ text, query }) {
  if (!query || !query.trim()) return <span>{text}</span>;
  const q = query.trim().toLowerCase();
  const lower = String(text || '').toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return <span>{text}</span>;

  return (
    <span>
      {text.slice(0, idx)}
      <mark style={{
        background: '#fef08a',
        color: '#854d0e',
        padding: '0 2px',
        borderRadius: '2px',
        fontWeight: 700
      }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </span>
  );
}

/**
 * SearchableSelect — A responsive combobox / searchable dropdown component.
 * Allows users to click or type into the field to search & filter options in real time.
 * Supports keyboard navigation (ArrowUp, ArrowDown, Enter, Escape).
 */
export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = "Select or search...",
  disabled = false,
  style = {},
  inputStyle = {},
  dropdownStyle = {},
  className = "",
  id,
  isYellow = false,
  allowCustom = false,
  clearable = true
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [openUp, setOpenUp] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Normalize options to [{ value, label, sublabel, raw }]
  const normalizedOptions = useMemo(() => {
    return (options || []).map(opt => {
      if (typeof opt === 'string' || typeof opt === 'number') {
        return { value: String(opt), label: String(opt), raw: opt };
      }
      return {
        value: String(opt.value ?? opt.id ?? opt.label ?? ''),
        label: String(opt.label ?? opt.name ?? opt.value ?? ''),
        sublabel: opt.sublabel || opt.category || opt.family || null,
        raw: opt
      };
    });
  }, [options]);

  // Find selected item label
  const selectedItem = useMemo(() => {
    if (value === undefined || value === null || value === '') return null;
    return normalizedOptions.find(o => String(o.value).toLowerCase() === String(value).toLowerCase()) || null;
  }, [value, normalizedOptions]);

  // When isOpen changes or value changes, keep input text in sync
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery(selectedItem ? selectedItem.label : (value ? String(value) : ''));
      setHighlightedIndex(-1);
    }
  }, [isOpen, selectedItem, value]);

  // Filter and intelligently rank options based on searchQuery
  const filteredOptions = useMemo(() => {
    if (!searchQuery || !isOpen) return normalizedOptions;
    // If the searchQuery exactly equals current selected item's label, show all options
    if (selectedItem && searchQuery.trim().toLowerCase() === selectedItem.label.trim().toLowerCase()) {
      return normalizedOptions;
    }
    const q = searchQuery.trim().toLowerCase();
    
    // Filter matching options
    const matches = normalizedOptions.filter(o => 
      o.label.toLowerCase().includes(q) || 
      o.value.toLowerCase().includes(q) ||
      (o.sublabel && o.sublabel.toLowerCase().includes(q))
    );

    // Rank matching options for superior search experience:
    // 1. Exact match
    // 2. Starts with query
    // 3. Word starts with query
    // 4. Substring in label
    // 5. Value/sublabel match
    return matches.sort((a, b) => {
      const aLabel = a.label.toLowerCase();
      const bLabel = b.label.toLowerCase();

      if (aLabel === q) return -1;
      if (bLabel === q) return 1;

      const aStarts = aLabel.startsWith(q);
      const bStarts = bLabel.startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      const wordRegex = new RegExp('\\b' + q.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'));
      const aWord = wordRegex.test(aLabel);
      const bWord = wordRegex.test(bLabel);
      if (aWord && !bWord) return -1;
      if (!aWord && bWord) return 1;

      return aLabel.localeCompare(bLabel);
    });
  }, [searchQuery, normalizedOptions, isOpen, selectedItem]);

  // Calculate dropdown orientation (flip up if not enough space below)
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < 220 && spaceAbove > 180) {
        setOpenUp(true);
      } else {
        setOpenUp(false);
      }
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-option-item="true"]');
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (optionValue) => {
    if (onChange) {
      onChange(optionValue);
    }
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1 < filteredOptions.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 >= 0 ? prev - 1 : filteredOptions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        handleSelect(filteredOptions[highlightedIndex].value);
      } else if (filteredOptions.length > 0) {
        handleSelect(filteredOptions[0].value);
      } else if (allowCustom && searchQuery.trim()) {
        handleSelect(searchQuery.trim());
      }
    } else if (e.key === 'Tab') {
      if (isOpen) {
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length && searchQuery.trim() !== (selectedItem?.label || '')) {
          handleSelect(filteredOptions[highlightedIndex].value);
        } else {
          setIsOpen(false);
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const hasValue = value !== undefined && value !== null && String(value).trim() !== '';

  return (
    <div
      ref={containerRef}
      className={`searchable-select-container ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        boxSizing: 'border-box',
        ...style
      }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          disabled={disabled}
          value={searchQuery}
          placeholder={placeholder}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
            setHighlightedIndex(0);
            if (allowCustom && onChange) {
              onChange(e.target.value);
            }
          }}
          onFocus={() => {
            setIsOpen(true);
            if (inputRef.current) {
              inputRef.current.select();
            }
          }}
          onClick={(e) => {
            if (!isOpen) {
              setIsOpen(true);
              e.currentTarget.select();
            }
          }}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            padding: hasValue && clearable ? '8px 48px 8px 10px' : '8px 28px 8px 10px',
            fontSize: '12px',
            fontWeight: 600,
            background: isYellow ? '#fffbeb' : '#ffffff',
            color: '#0f172a',
            border: isYellow ? '1px solid #fde047' : (isOpen ? '1px solid #2563eb' : '1px solid #cbd5e1'),
            borderRadius: '6px',
            outline: 'none',
            boxSizing: 'border-box',
            boxShadow: isOpen ? '0 0 0 2px rgba(37,99,235,0.15)' : '0 1px 2px rgba(0,0,0,0.03)',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            cursor: disabled ? 'not-allowed' : 'text',
            ...inputStyle
          }}
        />

        {/* Right side buttons: Clear & Chevron */}
        <div style={{
          position: 'absolute',
          right: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          {hasValue && clearable && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                if (onChange) onChange('');
                setSearchQuery('');
                if (inputRef.current) inputRef.current.focus();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '11px',
                padding: '1px 3px',
                lineHeight: 1,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = '#fee2e2'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent'; }}
              title="Clear selection"
            >
              ✕
            </button>
          )}

          <span
            onClick={() => {
              if (!disabled) {
                setIsOpen(prev => !prev);
                if (!isOpen && inputRef.current) inputRef.current.focus();
              }
            }}
            style={{
              cursor: 'pointer',
              color: '#64748b',
              fontSize: '10px',
              userSelect: 'none',
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s ease',
              padding: '2px'
            }}
          >
            ▼
          </span>
        </div>
      </div>

      {/* Floating Dropdown List */}
      {isOpen && !disabled && (
        <div
          ref={listRef}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            ...(openUp ? { bottom: 'calc(100% + 4px)', top: 'auto' } : { top: 'calc(100% + 4px)', bottom: 'auto' }),
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 0 1px rgba(0, 0, 0, 0.1)',
            maxHeight: '220px',
            overflowY: 'auto',
            zIndex: 999999,
            padding: '4px',
            boxSizing: 'border-box',
            ...dropdownStyle
          }}
        >
          {/* Search match stats */}
          <div style={{
            padding: '4px 8px 6px',
            fontSize: '10px',
            fontWeight: 700,
            color: '#64748b',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>{filteredOptions.length} option{filteredOptions.length === 1 ? '' : 's'}</span>
            {searchQuery && (
              <span style={{ color: '#2563eb', fontWeight: 600 }}>Filtering: "{searchQuery}"</span>
            )}
          </div>

          {filteredOptions.length === 0 ? (
            <div style={{
              padding: '12px 10px',
              textAlign: 'center',
              fontSize: '11px',
              color: '#94a3b8',
              fontStyle: 'italic'
            }}>
              No matching options found
            </div>
          ) : (
            filteredOptions.map((opt, idx) => {
              const isSelected = selectedItem ? selectedItem.value === opt.value : String(value) === opt.value;
              const isHighlighted = idx === highlightedIndex;

              return (
                <div
                  key={`${opt.value}-${idx}`}
                  data-option-item="true"
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input blur before click fires
                    handleSelect(opt.value);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  style={{
                    padding: '6px 10px',
                    fontSize: '11.5px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    background: isHighlighted
                      ? '#eff6ff'
                      : (isSelected ? '#f0fdf4' : 'transparent'),
                    borderLeft: isSelected ? '3px solid #16a34a' : '3px solid transparent',
                    color: isSelected ? '#166534' : (isHighlighted ? '#1e40af' : '#1e293b'),
                    fontWeight: isSelected ? 700 : (isHighlighted ? 600 : 500),
                    transition: 'background 0.1s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                      <HighlightMatch
                        text={opt.label}
                        query={selectedItem && searchQuery.trim().toLowerCase() === selectedItem.label.trim().toLowerCase() ? "" : searchQuery}
                      />
                    </span>
                    {isSelected && (
                      <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 800 }}>✓</span>
                    )}
                  </div>
                  {opt.sublabel && (
                    <span style={{ fontSize: '9.5px', color: '#64748b', fontWeight: 400 }}>
                      <HighlightMatch
                        text={opt.sublabel}
                        query={selectedItem && searchQuery.trim().toLowerCase() === selectedItem.label.trim().toLowerCase() ? "" : searchQuery}
                      />
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
