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
      const res = await fetch(`${ApiService.BASE_URL || '/api'}/jobs/history`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setHistory(data);
        } else if (data && Array.isArray(data.history)) {
          setHistory(data.history);
        } else {
          setHistory([]);
        }
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
              {filteredJobs.map(job => (
                <div key={job.id} className="job-card" onClick={() => handleLoad(job.id, job.project_name)}>
                  
                  <div className="job-thumbnail">
                    {job.thumbnail ? (
                      <img src={job.thumbnail} alt={job.project_name} loading="lazy" />
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
              <h3>Project Ownership History</h3>
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
                    <tr><td colSpan="3" style={{ textAlign: 'center', padding: '20px' }}>No history yet</td></tr>
                  ) : history.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 'bold', color: '#818cf8' }}>{item?.project_name || 'N/A'}</td>
                      <td>
                        <span style={{ color: '#f87171' }}>{item?.old_user || 'Unknown'}</span>
                        <span style={{ margin: '0 8px', opacity: 0.5 }}>→</span>
                        <span style={{ color: '#4ade80' }}>{item?.new_user || 'Unknown'}</span>
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
          padding: 40px;
          color: #e2e8f0;
          background: #0f172a;
          height: calc(100vh - 86px);
          overflow-y: auto;
          flex: 1;
          position: relative;
        }

        .history-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 40px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          padding-bottom: 20px;
        }

        .title-area h2 {
          font-size: 32px;
          margin: 0;
          font-weight: 800;
          background: linear-gradient(to right, #818cf8, #c084fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .stats-badge {
          margin-top: 8px;
          display: inline-block;
          background: rgba(129, 140, 248, 0.1);
          color: #818cf8;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }

        .search-box {
          position: relative;
          width: 350px;
        }

        .search-box input {
          width: 100%;
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 12px;
          padding: 14px 16px 14px 44px;
          color: #fff;
          font-size: 15px;
        }

        .search-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 18px;
          opacity: 0.5;
        }

        .job-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 24px;
          position: relative;
          z-index: 1;
        }

        .job-card {
          background: #1e293b;
          border-radius: 16px;
          border: 1px solid #334155;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
        }

        .job-card:hover {
          transform: translateY(-8px);
          border-color: #6366f1;
        }

        .job-thumbnail {
          position: relative;
          height: 160px;
          background: #020617;
        }

        .job-thumbnail img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .job-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.3s;
        }

        .job-card:hover .job-overlay {
          opacity: 1;
        }

        .btn-open-overlay {
          background: #818cf8;
          color: #fff;
          border: none;
          padding: 8px 20px;
          border-radius: 8px;
          font-weight: 700;
        }

        .no-preview {
          color: #475569;
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
        }

        .job-details {
          padding: 20px;
        }

        .job-meta {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #64748b;
          margin-bottom: 8px;
        }

        .title-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
          gap: 10px;
        }

        .job-title {
          margin: 0;
          font-size: 18px;
          color: #f8fafc;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }

        .rename-btn {
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          font-size: 16px;
          padding: 0;
          transition: color 0.2s;
        }

        .rename-btn:hover {
          color: #818cf8;
        }

        .job-info-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1.2fr;
          gap: 12px;
          background: rgba(15, 23, 42, 0.5);
          padding: 12px;
          border-radius: 12px;
        }

        .info-item .label {
          font-size: 10px;
          color: #64748b;
        }

        .info-item .value {
          font-size: 15px;
          color: #818cf8;
          font-weight: 700;
        }

        .value-user {
          font-size: 13px;
          color: #c084fc;
          font-weight: 700;
        }

        .job-actions {
          margin-top: 15px;
          display: flex;
          justify-content: flex-end;
        }

        .action-btn.delete {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border: none;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          cursor: pointer;
        }

        .pagination-wrapper {
          margin-top: 50px;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 16px;
          padding-bottom: 50px;
          position: relative;
          z-index: 100; /* Ensure it's clickable */
        }

        .page-numbers {
          display: flex;
          gap: 8px;
        }

        .pag-num {
          background: #1e293b;
          border: 1px solid #334155;
          color: #94a3b8;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
        }

        .pag-num.active {
          background: #818cf8;
          border-color: #818cf8;
          color: #fff;
        }

        .pag-num.dots {
          border: none;
          background: transparent;
          cursor: default;
        }

        .prev-next {
          background: #1e293b;
          border: 1px solid #334155;
          color: #fff;
          padding: 0 20px;
          height: 40px;
          border-radius: 10px;
          font-weight: 700;
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
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(4px);
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .history-modal {
          background: #1e293b;
          width: 100%;
          max-width: 700px;
          max-height: 80vh;
          border-radius: 20px;
          border: 1px solid #334155;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .modal-header {
          padding: 20px 24px;
          border-bottom: 1px solid #334155;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .modal-header h3 { margin: 0; color: #fff; }
        .btn-close { background: transparent; border: none; color: #64748b; font-size: 28px; cursor: pointer; }
        .modal-body { padding: 24px; overflow-y: auto; }
        .history-table { width: 100%; border-collapse: collapse; }
        .history-table th { text-align: left; padding: 12px; border-bottom: 2px solid #334155; color: #64748b; font-size: 12px; text-transform: uppercase; }
        .history-table td { padding: 14px 12px; border-bottom: 1px solid #334155; color: #cbd5e1; }
      ` }} />
    </div>
  );
};

export default JobHistory;
