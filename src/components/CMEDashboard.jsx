import React, { useState } from 'react';
import { useCMEData } from '../hooks/useCMEData';
import CMEQueueTab from './CMEQueueTab';
import CMEClassificationTab from './CMEClassificationTab';
import './CMEDashboard.css';

export default function CMEDashboard() {
  const { cmes, positions, classifications, loading, error } = useCMEData();
  const [activeTab, setActiveTab] = useState('queue');

  if (loading) {
    return (
      <div className="cme-dashboard">
        <div className="cme-header">
          <h2>CME DASHBOARD</h2>
        </div>
        <div className="cme-loading">Loading CME data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cme-dashboard">
        <div className="cme-header">
          <h2>CME DASHBOARD</h2>
        </div>
        <div className="cme-error">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="cme-dashboard">
      {/* Header with tabs */}
      <div className="cme-header">
        <h2>CME DASHBOARD</h2>
        <div className="cme-tabs">
          <button
            className={`cme-tab ${activeTab === 'queue' ? 'active' : ''}`}
            onClick={() => setActiveTab('queue')}
          >
            Queue
          </button>
          <button
            className={`cme-tab ${activeTab === 'classification' ? 'active' : ''}`}
            onClick={() => setActiveTab('classification')}
          >
            Classification
          </button>
          <button
            className={`cme-tab ${activeTab === 'positions' ? 'active' : ''}`}
            onClick={() => setActiveTab('positions')}
          >
            Positions
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="cme-content">
        {activeTab === 'queue' && (
          <CMEQueueTab cmes={cmes} positions={positions} />
        )}
        {activeTab === 'classification' && (
          <CMEClassificationTab cmes={cmes} classifications={classifications} />
        )}
        {activeTab === 'positions' && (
          <div className="cme-positions-tab">
            <h3>Detailed Positions</h3>
            <div className="positions-table">
              {cmes.map((cme, idx) => (
                <div key={cme.id} className="position-row">
                  <span className="cme-number">❶{idx + 1}</span>
                  <span className="cme-id">{cme.id}</span>
                  <span className="cme-distance">{cme.position.distance_au.toFixed(2)} AU</span>
                  <span className="cme-progress">{cme.position.progress_percent.toFixed(1)}%</span>
                  <span className="cme-eta">
                    {cme.position.eta_hours ? `${Math.round(cme.position.eta_hours)}h` : 'N/A'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
