import React from 'react';
import './CMEDetailPopup.css';

export default function CMEDetailPopup({ cme, cmeNumber, cmeColor, onClose }) {
  const formatDate = (isoString) => {
    if (!isoString) return 'Unknown';
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const formatETA = (hours) => {
    if (!hours) return 'N/A';
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    if (days > 0) {
      return `${days}d ${remainingHours}h`;
    }
    return `${remainingHours}h`;
  };

  const getConfidenceLabel = (spread) => {
    if (!spread) return 'Unknown';
    if (spread < 2) return 'High';
    if (spread < 6) return 'Medium';
    return 'Low';
  };

  return (
    <div className="cme-popup-overlay" onClick={onClose}>
      <div className="cme-popup" onClick={(e) => e.stopPropagation()} style={{ borderColor: cmeColor }}>
        <div className="popup-header" style={{ borderBottomColor: cmeColor }}>
          <h3>
            <span className="cme-number-large" style={{ color: cmeColor }}>
              {cmeNumber}
            </span>
            CME {cme.id}
          </h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="popup-body">
          <div className="popup-section">
            <h4 style={{ color: cmeColor }}>Source Information</h4>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">Type:</span>
                <span className="value">{cme.properties.type || 'Unknown'}</span>
              </div>
              <div className="info-item">
                <span className="label">State:</span>
                <span className={`value state-badge ${cme.state.current.toLowerCase()}`}>
                  {cme.state.current}
                </span>
              </div>
              <div className="info-item">
                <span className="label">Launch Time:</span>
                <span className="value">{formatDate(cme.source.launch_time)}</span>
              </div>
              <div className="info-item">
                <span className="label">Initial Speed:</span>
                <span className="value">
                  {cme.properties.speed_initial 
                    ? `${Math.round(cme.properties.speed_initial)} km/s`
                    : 'Unknown'}
                </span>
              </div>
              <div className="info-item">
                <span className="label">Current Speed:</span>
                <span className="value">
                  {cme.properties.speed_current 
                    ? `${Math.round(cme.properties.speed_current)} km/s`
                    : 'Unknown'}
                </span>
              </div>
            </div>
          </div>

          <div className="popup-section">
            <h4 style={{ color: cmeColor }}>Current Position</h4>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">Distance:</span>
                <span className="value">{cme.position.distance_au.toFixed(3)} AU</span>
              </div>
              <div className="info-item">
                <span className="label">Progress to Earth:</span>
                <span className="value">{cme.position.progress_percent.toFixed(1)}%</span>
              </div>
              <div className="info-item">
                <span className="label">ETA:</span>
                <span className="value">{formatETA(cme.position.eta_hours)}</span>
              </div>
              {cme.position.eta_timestamp && (
                <div className="info-item">
                  <span className="label">Estimated Arrival:</span>
                  <span className="value">{formatDate(cme.position.eta_timestamp)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="popup-section">
            <h4 style={{ color: cmeColor }}>Arrival Predictions</h4>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">Model Count:</span>
                <span className="value">{cme.arrival.num_models} predictions</span>
              </div>
              <div className="info-item">
                <span className="label">Confidence:</span>
                <span className="value">
                  {getConfidenceLabel(cme.arrival.confidence_spread_hours)}
                  {cme.arrival.confidence_spread_hours > 0 && 
                    ` (±${cme.arrival.confidence_spread_hours.toFixed(1)}h)`
                  }
                </span>
              </div>
              {cme.arrival.average_prediction && (
                <div className="info-item">
                  <span className="label">Avg Prediction:</span>
                  <span className="value">
                    {formatDate(new Date(cme.arrival.average_prediction * 1000))}
                  </span>
                </div>
              )}
              {cme.arrival.median_prediction && (
                <div className="info-item">
                  <span className="label">Median Prediction:</span>
                  <span className="value">
                    {formatDate(new Date(cme.arrival.median_prediction * 1000))}
                  </span>
                </div>
              )}
            </div>
          </div>

          {cme.arrival.scoreboard_url && (
            <div className="popup-section">
              <a 
                href={cme.arrival.scoreboard_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="scoreboard-link"
                style={{ 
                  background: cmeColor,
                  boxShadow: `0 0 15px ${cmeColor}88`
                }}
              >
                View on CCMC Scoreboard →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
