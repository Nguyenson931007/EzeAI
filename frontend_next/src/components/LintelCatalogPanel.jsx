import React, { useState, useEffect } from 'react';

export default function LintelCatalogPanel({
  selectedLintel,
  onSelectCatalogItem
}) {
  const [catalog, setCatalog] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Fetch catalog on mount
  useEffect(() => {
    fetch('/lintel_catalog.json')
      .then(res => res.json())
      .then(data => {
        setCatalog(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading lintel catalog:", err);
        setLoading(false);
      });
  }, []);

  const [customPlys, setCustomPlys] = useState({});

  // Filter catalog based on height search
  const filteredCatalog = catalog.filter(item => {
    if (!searchTerm) return true;
    const query = searchTerm.toLowerCase();
    const sizeStr = `${item.height}x${item.width}`.toLowerCase();
    const sizeStrAlt = `${item.width}x${item.height}`.toLowerCase();
    return (
      item.height.toString().includes(query) ||
      item.width.toString().includes(query) ||
      sizeStr.includes(query) ||
      sizeStrAlt.includes(query) ||
      item.id.includes(query)
    );
  });

  return (
    <div
      style={{
        width: '280px',
        background: '#ffffff',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: '#1e293b',
        fontFamily: "'Inter', 'Outfit', sans-serif",
        boxSizing: 'border-box'
      }}
    >
      {/* Panel Header */}
      <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid #e2e8f0' }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
          Lintel Catalog
        </h3>
        <p style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#64748b' }}>
          Select a catalog size to assign to the active lintel
        </p>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Filter by height (e.g. 90, 170)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              padding: '6px 10px 6px 28px',
              color: '#1e293b',
              fontSize: '12px',
              outline: 'none',
              transition: 'border-color 0.2s',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => e.target.style.borderColor = '#2563eb'}
            onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
          />
          <span style={{ position: 'absolute', left: '10px', top: '7px', fontSize: '12px', color: '#94a3b8' }}>
            🔍
          </span>
        </div>
      </div>

      {/* Catalog items list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
        {loading ? (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
            Loading catalog...
          </div>
        ) : filteredCatalog.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
            No sizes found matching search.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredCatalog.map(item => {
              const isSelected = selectedLintel && selectedLintel.catalogId === item.id;
              const isLocked = false;

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (isLocked) return;
                    onSelectCatalogItem({
                      ...item,
                      ply: customPlys[item.id] ?? item.ply ?? 1
                    });
                  }}
                  style={{
                    background: isSelected ? '#eff6ff' : '#f8fafc',
                    border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    cursor: isLocked ? 'not-allowed' : 'pointer',
                    opacity: isLocked ? 0.5 : 1,
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 2px 8px rgba(37, 99, 235, 0.15)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected && !isLocked) {
                      e.currentTarget.style.background = '#f1f5f9';
                      e.currentTarget.style.borderColor = '#cbd5e1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected && !isLocked) {
                      e.currentTarget.style.background = '#f8fafc';
                      e.currentTarget.style.borderColor = '#e2e8f0';
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? '#2563eb' : '#1e293b' }}>
                      {item.height}x{item.width} {item.description}
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: 600, background: isSelected ? '#dbeafe' : '#e2e8f0', color: isSelected ? '#1d4ed8' : '#475569', padding: '2px 6px', borderRadius: '4px' }}>
                      {item.type}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: '#64748b' }}>
                      <span>Code: {item.id}</span>
                      <span>Unit: {item.unit}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>Ply:</span>
                      <input
                        type="number"
                        min="1"
                        placeholder={item.ply ?? 1}
                        value={isSelected ? (selectedLintel.ply || "") : (customPlys[item.id] || "")}
                        disabled={isLocked}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          if (isLocked) return;
                          const val = e.target.value === "" ? "" : parseInt(e.target.value);
                          if (val === "" || (!isNaN(val) && val > 0)) {
                            if (val !== "") {
                              setCustomPlys(prev => ({ ...prev, [item.id]: val }));
                            } else {
                              setCustomPlys(prev => {
                                const newPlys = { ...prev };
                                delete newPlys[item.id];
                                return newPlys;
                              });
                            }

                            if (isSelected) {
                              onSelectCatalogItem({
                                ...item,
                                ply: val === "" ? (item.ply || 1) : val
                              });
                            }
                          }
                        }}
                        style={{
                          width: '46px',
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          color: '#1e293b',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          padding: '4px 6px',
                          textAlign: 'center',
                          outline: 'none',
                          cursor: isLocked ? 'not-allowed' : 'text'
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
