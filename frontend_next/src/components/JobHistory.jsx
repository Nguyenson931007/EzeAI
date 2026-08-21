import React, { useState, useEffect } from 'react';
import { ApiService } from '@/models/api.service';
import { useDialog } from '@/components/DialogContext';

const JobHistory = ({ username, onLoadJob }) => {
  const { showAlert, showConfirm, showPrompt } = useDialog();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const LIMIT = 12; 

  const fetchTotalCount = async () => {
    try {
      const data = await ApiService.getJobsCount();
      if (data && typeof data.count === 'number') {
        setTotalCount(data.count);
      }
    } catch (err) {
      console.error('Error fetching count:', err);
    }
  };

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * LIMIT;
      const data = await ApiService.getAllJobs(LIMIT, offset);
      if (Array.isArray(data)) {
        setJobs(data);
      } else if (data && Array.isArray(data.jobs)) {
        setJobs(data.jobs);
      } else {
        setJobs([]);
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const data = await ApiService.getJobHistory();
      if (Array.isArray(data)) {
        setHistory(data);
      } else if (data && Array.isArray(data.history)) {
        setHistory(data.history);
      } else {
        setHistory([]);
      }
    } catch (err) {
      console.error('Error fetching history:', err);
      setHistory([]);
    }
  };

  useEffect(() => {
    fetchTotalCount();
    fetchHistory();
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchTotalCount(); // Re-fetch count on every page change too
    const container = document.querySelector('.history-container');
    if (container) container.scrollTop = 0;
  }, [currentPage]);

  const handleDelete = async (e, jobId) => {
    e.stopPropagation();
    if (!await showConfirm('Are you sure you want to delete this job?')) return;
    try {
      const res = await ApiService.deleteJob(jobId);
      if (res.status === 'success' || !res.detail) {
        fetchJobs();
        fetchTotalCount();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleShare = async (e, job) => {
    e.stopPropagation();
    try {
      if (job.share_token) {
        const shareLink = `${window.location.origin}/share/${job.share_token}`;
        await navigator.clipboard.writeText(shareLink);
          await showAlert("Share link copied to clipboard!");
      } else {
        const res = await ApiService.toggleShare(job.id, true);
        if (res.status === 'success') {
          const shareLink = `${window.location.origin}/share/${res.share_token}`;
          await navigator.clipboard.writeText(shareLink);
          await showAlert("Sharing enabled and link copied to clipboard!");
          fetchJobs();
        }
      }
    } catch (err) {
      console.error('Share error:', err);
      await showAlert("Failed to handle sharing");
    }
  };

  const handleRename = async (e, jobId, currentName) => {
    e.stopPropagation();
    const newName = await showPrompt('Enter new project name:', currentName);
    if (!newName || newName === currentName) return;
    
    try {
      const res = await ApiService.renameJob(jobId, newName);
      if (res.status === 'success') {
        fetchJobs();
      }
    } catch (err) {
      console.error('Rename error:', err);
    }
  };

  const handleLoad = async (jobId, projectName) => {
    try {
      const data = await ApiService.getJobData(jobId);
      if (data.status === 'success') {
        const parsedData = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
        onLoadJob(parsedData, projectName);
      }
    } catch (err) {
      console.error('Load job error:', err);
      await showAlert(`Load Failed: ${err.message}`);
    }
  };

  const totalPages = Math.ceil(totalCount / LIMIT) || 1;

  const renderPageNumbers = () => {
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }

    return pages.map((p, idx) => (
      <button 
        key={idx}
        className={`pag-num ${p === currentPage ? 'active' : ''}`}
        onClick={() => setCurrentPage(p)}
      >
        {p}
      </button>
    ));
  };


  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const filteredJobs = safeJobs.filter(job => 
    (job?.project_name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="history-container" onWheel={(e) => e.stopPropagation()}>
      <div className="history-header">
        <div className="title-area">
          <h2>Project History</h2>
          <div className="stats-badge">
            {totalCount > 0 ? `Total ${totalCount} projects` : 'Loading projects...'} | Page {currentPage}
          </div>
          <button className="btn-history-toggle" onClick={() => setShowHistory(true)}>
            🕒 Ownership History
          </button>
        </div>

        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input 
            type="text" 
            placeholder="Search projects..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="history-list">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Fetching projects...</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📁</div>
            <h3>No Projects Found</h3>
            <p>Try a different search term or start a new measurement.</p>
          </div>
        ) : (
          <>
            <div className="job-grid">
              {filteredJobs.map((job, idx) => (
                <div key={`job_${job.id || idx}_${idx}`} className="job-card" onClick={() => handleLoad(job.id, job.project_name)}>
                  
                  <div className="job-thumbnail">
                    {job.thumbnail ? (
                      <img src={job.thumbnail} alt={job.project_name} loading="eager" decoding="async" />
                    ) : (
                      <div className="no-preview">No Preview</div>
                    )}
                    <div className="job-overlay">
                      <button className="btn-open-overlay">Open Project</button>
                    </div>
                  </div>

                  <div className="job-details">
                    <div className="job-meta">
                      <span className="job-id">#{job.id}</span>
                      <span className="job-date">{new Date(job.created_at).toLocaleDateString()}</span>
                    </div>
                    
                    <div className="title-row">
                      <h3 className="job-title" title={job.project_name}>{job.project_name}</h3>
                      <button className="rename-btn" onClick={(e) => handleRename(e, job.id, job.project_name)} title="Rename">
                        ✎
                      </button>
                    </div>
                    
                    <div className="job-info-row">
                      <div className="info-item">
                        <span className="label">Rooms</span>
                        <span className="value">{job.room_count}</span>
                      </div>
                      <div className="info-item">
                        <span className="label">Area</span>
                        <span className="value">{job.total_area?.toFixed(1)}m²</span>
                      </div>
                      <div className="info-item">
                        <span className="label">User</span>
                        <span className="value-user">{job.username}</span>
                      </div>
                    </div>

                    <div className="job-actions">
                      <button className={`action-btn share ${job.share_token ? 'active' : ''}`} onClick={(e) => handleShare(e, job)} title={job.share_token ? "Copy Share Link" : "Enable Sharing"}>
                        {job.share_token ? '🔗' : '📤'}
                      </button>
                      <button className="action-btn delete" onClick={(e) => handleDelete(e, job.id)} title="Delete Project">
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="pagination-wrapper">
              <button 
                className="pag-btn prev-next" 
                disabled={currentPage === 1}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentPage(prev => Math.max(1, prev - 1));
                }}
              >
                ← Prev
              </button>
              
              <div className="page-numbers">
                {renderPageNumbers()}
              </div>

              <button 
                className="pag-btn prev-next" 
                disabled={currentPage >= totalPages}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentPage(prev => prev + 1);
                }}
              >
                Next →
              </button>
            </div>
          </>
        )}
      </div>

      {showHistory && (
        <div className="history-modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="history-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px' }}>📜</span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>Project Ownership History</h3>
              </div>
              <button className="btn-close" onClick={() => setShowHistory(false)}>×</button>
            </div>
            <div className="modal-body">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Project Name</th>
                    <th>Action</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {(!Array.isArray(history) || history.length === 0) ? (
                    <tr><td colSpan="3" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>No ownership history recorded yet.</td></tr>
                  ) : history.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 700, color: '#2563eb' }}>{item?.project_name || 'N/A'}</td>
                      <td>
                        <span style={{ color: '#dc2626', fontWeight: 600 }}>{item?.old_user || 'Unknown'}</span>
                        <span style={{ margin: '0 8px', color: '#94a3b8' }}>→</span>
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>{item?.new_user || 'Unknown'}</span>
                      </td>
                      <td style={{ fontSize: '12px', color: '#64748b' }}>
                        {item?.changed_at ? new Date(item.changed_at).toLocaleString() : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .history-container {
          padding: 32px 40px;
          color: var(--text, #101a33);
          background: var(--bg-canvas, #eef2fc);
          height: calc(100vh - 92px);
          overflow-y: auto;
          flex: 1;
          position: relative;
        }

        .history-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 24px;
          border-bottom: 1px solid var(--border, #dbe3f5);
          padding-bottom: 16px;
        }

        .title-area h2 {
          font-size: 24px;
          margin: 0;
          font-weight: 700;
          color: var(--blue-900, #0f2f76);
        }

        .stats-badge {
          margin-top: 6px;
          display: inline-block;
          background: var(--blue-50, #eef3ff);
          color: var(--blue-700, #1746b3);
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          border: 1px solid var(--blue-100, #e2eaff);
        }

        .search-box {
          position: relative;
          width: 320px;
        }

        .search-box input {
          width: 100%;
          background: #ffffff;
          border: 1px solid var(--border, #dbe3f5);
          border-radius: 6px;
          padding: 10px 14px 10px 38px;
          color: var(--text, #101a33);
          font-size: 13px;
          outline: none;
        }

        .search-box input:focus {
          border-color: var(--blue, #2563eb);
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
        }

        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 14px;
          color: var(--text-dim, #5b6b8c);
        }

        .job-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
          position: relative;
          z-index: 1;
        }

        .job-card {
          background: #ffffff;
          border-radius: 8px;
          border: 1px solid var(--border, #dbe3f5);
          overflow: hidden;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
        }

        .job-card:hover {
          transform: translateY(-3px);
          border-color: var(--blue, #2563eb);
          box-shadow: 0 8px 16px rgba(37, 99, 235, 0.08);
        }

        .job-thumbnail {
          position: relative;
          height: 150px;
          background: #f8fafc;
          border-bottom: 1px solid var(--border, #dbe3f5);
        }

        .job-thumbnail img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .job-overlay {
          position: absolute;
          inset: 0;
          background: rgba(15, 47, 118, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .job-card:hover .job-overlay {
          opacity: 1;
        }

        .btn-open-overlay {
          background: var(--blue-700, #1746b3);
          color: #fff;
          border: none;
          padding: 8px 18px;
          border-radius: 4px;
          font-weight: 600;
          font-size: 12px;
        }

        .no-preview {
          color: var(--text-faint, #94a3c4);
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
        }

        .job-details {
          padding: 14px 16px;
        }

        .job-meta {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: var(--text-dim, #5b6b8c);
          margin-bottom: 6px;
        }

        .title-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
          gap: 8px;
        }

        .job-title {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: var(--text, #101a33);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }

        .rename-btn {
          background: transparent;
          border: none;
          color: var(--text-dim, #5b6b8c);
          cursor: pointer;
          font-size: 14px;
          padding: 0;
          transition: color 0.15s;
        }

        .rename-btn:hover {
          color: var(--blue, #2563eb);
        }

        .job-info-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1.2fr;
          gap: 8px;
          background: var(--bg-panel, #f6f8fe);
          padding: 8px 10px;
          border-radius: 6px;
          border: 1px solid var(--border, #dbe3f5);
        }

        .info-item .label {
          font-size: 9px;
          color: var(--text-faint, #94a3c4);
          text-transform: uppercase;
        }

        .info-item .value {
          font-size: 13px;
          color: var(--blue-700, #1746b3);
          font-weight: 700;
        }

        .value-user {
          font-size: 11px;
          color: var(--text, #101a33);
          font-weight: 600;
        }

        .job-actions {
          margin-top: 10px;
          display: flex;
          justify-content: flex-end;
        }

        .action-btn.delete {
          background: #fee2e2;
          color: var(--red, #dc2626);
          border: none;
          width: 30px;
          height: 30px;
          border-radius: 4px;
          cursor: pointer;
        }

        .pagination-wrapper {
          margin-top: 32px;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 12px;
          padding-bottom: 32px;
          position: relative;
          z-index: 100;
        }

        .page-numbers {
          display: flex;
          gap: 6px;
        }

        .pag-num {
          background: #ffffff;
          border: 1px solid var(--border, #dbe3f5);
          color: var(--text-dim, #5b6b8c);
          width: 32px;
          height: 32px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
        }

        .pag-num.active {
          background: var(--blue-700, #1746b3);
          border-color: var(--blue-700, #1746b3);
          color: #fff;
        }

        .pag-num.dots {
          border: none;
          background: transparent;
          cursor: default;
        }

        .prev-next {
          background: #ffffff;
          border: 1px solid var(--border, #dbe3f5);
          color: var(--text, #101a33);
          padding: 0 14px;
          height: 32px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
          pointer-events: auto !important;
        }

        .prev-next:disabled {
          opacity: 0.3;
          cursor: not-allowed;
          pointer-events: none;
        }

        .loading-state, .empty-state {
          text-align: center;
          padding: 100px;
          color: #64748b;
        }
        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(129, 140, 248, 0.1);
          border-left-color: #818cf8;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .btn-history-toggle {
          margin-top: 10px;
          background: rgba(129, 140, 248, 0.1);
          border: 1px solid rgba(129, 140, 248, 0.3);
          color: #818cf8;
          padding: 6px 14px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          font-size: 13px;
          transition: all 0.2s;
        }
        .btn-history-toggle:hover {
          background: #818cf8;
          color: #fff;
        }

        .history-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.5);
          backdrop-filter: blur(4px);
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .history-modal {
          background: #ffffff;
          width: 100%;
          max-width: 720px;
          max-height: 85vh;
          border-radius: 16px;
          border: 1px solid #cbd5e1;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.18);
          overflow: hidden;
        }
        .modal-header {
          padding: 16px 24px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .btn-close {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          color: #64748b;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .btn-close:hover {
          background: #e2e8f0;
          color: #1e293b;
        }
        .modal-body {
          padding: 20px 24px;
          overflow-y: auto;
        }
        .history-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .history-table th {
          text-align: left;
          padding: 10px 14px;
          border-bottom: 2px solid #e2e8f0;
          background: #f1f5f9;
          color: #475569;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .history-table td {
          padding: 12px 14px;
          border-bottom: 1px solid #f1f5f9;
          color: #1e293b;
        }
      ` }} />
    </div>
  );
};

export default JobHistory;
