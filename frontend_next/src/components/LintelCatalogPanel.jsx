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
        background: '#0f172a',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: '#f8fafc',
        fontFamily: "'Inter', 'Outfit', sans-serif",
        boxSizing: 'border-box'
      }}
    >
      {/* Panel Header */}
      <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>
          Lintel Catalog
        </h3>
        <p style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#94a3b8' }}>
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
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '6px',
              padding: '6px 10px 6px 28px',
              color: '#fff',
              fontSize: '12px',
              outline: 'none',
              transition: 'border-color 0.2s',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => e.target.style.borderColor = '#f59e0b'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
          />
          <span style={{ position: 'absolute', left: '10px', top: '7px', fontSize: '12px', color: '#64748b' }}>
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
              
              return (
                <div
                  key={item.id}
                  onClick={() => onSelectCatalogItem(item)}
                  style={{
                    background: isSelected ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                    border: isSelected ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: isSelected ? '#f59e0b' : '#f1f5f9' }}>
                      {item.height}x{item.width} {item.description}
                    </span>
                    <span style={{ fontSize: '10px', background: '#334155', color: '#cbd5e1', padding: '2px 6px', borderRadius: '4px' }}>
                      {item.type}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Code: {item.id}</span>
                    <span>Unit: {item.unit}</span>
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
