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
          <div className="cme-tabs">
            <button className="cme-tab">Queue</button>
            <button className="cme-tab">Classification</button>
          </div>
        </div>
        <div className="cme-loading">Loading CME data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cme-dashboard">
        <div className="cme-header">
          <div className="cme-tabs">
            <button className="cme-tab">Queue</button>
            <button className="cme-tab">Classification</button>
          </div>
        </div>
        <div className="cme-error">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="cme-dashboard">
      {/* Header with tabs only - NO title */}
      <div className="cme-header">
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
      </div>
    </div>
  );
}
