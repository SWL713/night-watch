import React, { useState } from 'react';
import CMEPositionViz from './CMEPositionViz';
import CMEDetailPopup from './CMEDetailPopup';
import './CMEQueueTab.css';

// Neon colors for each CME
const CME_COLORS = [
  '#00FFF0', // Cyan
  '#FF00FF', // Magenta
  '#00FF00', // Green
  '#FFFF00', // Yellow
  '#FF0080', // Pink
  '#0080FF', // Blue
  '#FF8000', // Orange
  '#80FF00', // Lime
];

export default function CMEQueueTab({ cmes, positions }) {
  const [selectedCME, setSelectedCME] = useState(null);

  const formatDate = (isoString) => {
    if (!isoString) return 'Unknown';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatETA = (hours) => {
    if (!hours) return 'N/A';
    return `${Math.round(hours)}h`;
  };

  if (cmes.length === 0) {
    return (
      <div className="cme-queue-empty">
        <p>No active CMEs currently tracked</p>
      </div>
    );
  }

  return (
    <div className="cme-queue-tab">
      {/* Top 20% - Position Visualization */}
      <div className="cme-viz-container">
        <CMEPositionViz 
          cmes={cmes} 
          positions={positions}
          cmeColors={CME_COLORS}
          onCMEClick={setSelectedCME}
        />
      </div>

      {/* Bottom 80% - CME Cards */}
      <div className="cme-cards-container">
        {cmes.map((cme, idx) => {
          const cmeColor = CME_COLORS[idx % CME_COLORS.length];
          
          return (
            <div
              key={cme.id}
              className="cme-card compact"
              onClick={() => setSelectedCME(cme)}
              style={{ borderColor: cmeColor }}
            >
              <div className="card-header">
                <span className="cme-number" style={{ color: cmeColor }}>
                  {idx + 1}
                </span>
                <span className="cme-id">{cme.id}</span>
                <span className={`cme-state ${cme.state.current.toLowerCase()}`}>
                  {cme.state.current}
                </span>
              </div>
              
              <div className="card-details">
                <div className="detail-row">
                  <span className="label">Type:</span>
                  <span className="value">{cme.properties.type || 'Unknown'}</span>
                  <span className="label">ETA:</span>
                  <span className="value">{formatETA(cme.position.eta_hours)}</span>
                </div>
                
                <div className="detail-row">
                  <span className="label">Launch:</span>
                  <span className="value">{formatDate(cme.source.launch_time)}</span>
                </div>
                
                <div className="detail-row">
                  <span className="label">Progress:</span>
                  <span className="value progress-bar">
                    <div className="progress-track">
                      <div 
                        className="progress-fill" 
                        style={{ 
                          width: `${cme.position.progress_percent}%`,
                          background: `linear-gradient(90deg, ${cmeColor}88 0%, ${cmeColor} 100%)`
                        }}
                      />
                    </div>
                    <span className="progress-text">
                      {cme.position.progress_percent.toFixed(1)}% ({cme.position.distance_au.toFixed(2)} AU)
                    </span>
                  </span>
                </div>
                
                <div className="detail-row">
                  <span className="label">Speed:</span>
                  <span className="value">
                    {cme.properties.speed_current 
                      ? `${Math.round(cme.properties.speed_current)} km/s`
                      : 'Unknown'}
                  </span>
                  <span className="label">Models:</span>
                  <span className="value">{cme.arrival.num_models}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Popup */}
      {selectedCME && (
        <CMEDetailPopup
          cme={selectedCME}
          cmeNumber={cmes.findIndex(c => c.id === selectedCME.id) + 1}
          cmeColor={CME_COLORS[cmes.findIndex(c => c.id === selectedCME.id) % CME_COLORS.length]}
          onClose={() => setSelectedCME(null)}
        />
      )}
    </div>
  );
}
