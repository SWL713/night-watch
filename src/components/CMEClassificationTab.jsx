import React, { useState, useEffect } from 'react';
import './CMEClassificationTab.css';

export default function CMEClassificationTab({ cmes, classifications }) {
  const [showBz, setShowBz] = useState(true);
  const [showBy, setShowBy] = useState(true);
  const [bzByData, setBzByData] = useState([]);
  const [phiData, setPhiData] = useState([]);

  useEffect(() => {
    // Fetch L1 magnetic field data for plots
    const fetchMagData = async () => {
      try {
        const response = await fetch(`/data/space_weather.json?t=${Date.now()}`);
        if (!response.ok) return;
        
        const data = await response.json();
        
        // Extract last 24 hours of Bz/By data
        const now = Date.now();
        const last24h = now - (24 * 60 * 60 * 1000);
        
        if (data.l1 && data.l1.history) {
          const recentData = data.l1.history
            .filter(point => new Date(point.time_tag).getTime() > last24h)
            .map(point => ({
              time: new Date(point.time_tag),
              bz: point.bz_gsm,
              by: point.by_gsm,
              phi: Math.atan2(point.by_gsm, point.bz_gsm) * (180 / Math.PI)
            }));
          
          setBzByData(recentData);
          setPhiData(recentData);
        }
      } catch (err) {
        console.error('Error fetching mag data:', err);
      }
    };

    fetchMagData();
    const interval = setInterval(fetchMagData, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const renderBzByPlot = () => {
    if (bzByData.length === 0) {
      return <div className="plot-empty">Loading magnetic field data...</div>;
    }

    const width = 800;
    const height = 200;
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    // Find min/max for scaling
    const allValues = bzByData.flatMap(d => [d.bz, d.by]);
    const minVal = Math.min(...allValues, -10);
    const maxVal = Math.max(...allValues, 10);

    const scaleY = (val) => {
      const normalized = (val - minVal) / (maxVal - minVal);
      return padding.top + plotHeight - (normalized * plotHeight);
    };

    const scaleX = (idx) => {
      return padding.left + (idx / (bzByData.length - 1)) * plotWidth;
    };

    // Create paths
    const bzPath = bzByData.map((d, i) => 
      `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(d.bz)}`
    ).join(' ');

    const byPath = bzByData.map((d, i) => 
      `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(d.by)}`
    ).join(' ');

    return (
      <svg width={width} height={height} className="plot-svg">
        {/* Grid lines */}
        <line
          x1={padding.left}
          y1={scaleY(0)}
          x2={width - padding.right}
          y2={scaleY(0)}
          stroke="#444"
          strokeWidth="1"
          strokeDasharray="2,2"
        />

        {/* Bz line */}
        {showBz && (
          <path
            d={bzPath}
            fill="none"
            stroke="#4A90E2"
            strokeWidth="2"
          />
        )}

        {/* By line */}
        {showBy && (
          <path
            d={byPath}
            fill="none"
            stroke="#E24A4A"
            strokeWidth="2"
          />
        )}

        {/* Axes */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke="#666"
          strokeWidth="1"
        />
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke="#666"
          strokeWidth="1"
        />

        {/* Y-axis labels */}
        <text x={padding.left - 35} y={scaleY(maxVal)} fill="#666" fontSize="10">
          {maxVal.toFixed(0)}
        </text>
        <text x={padding.left - 35} y={scaleY(0)} fill="#666" fontSize="10">
          0
        </text>
        <text x={padding.left - 35} y={scaleY(minVal)} fill="#666" fontSize="10">
          {minVal.toFixed(0)}
        </text>

        {/* Axis labels */}
        <text x={padding.left - 40} y={height / 2} fill="#666" fontSize="12" transform={`rotate(-90 ${padding.left - 40} ${height / 2})`}>
          nT
        </text>
        <text x={width / 2} y={height - 5} fill="#666" fontSize="12" textAnchor="middle">
          Last 24 Hours
        </text>
      </svg>
    );
  };

  const renderPhiPlot = () => {
    if (phiData.length === 0) {
      return <div className="plot-empty">Loading phi data...</div>;
    }

    const width = 800;
    const height = 150;
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const scaleY = (angle) => {
      // Map -180 to 180 degrees to plot height
      const normalized = (angle + 180) / 360;
      return padding.top + plotHeight - (normalized * plotHeight);
    };

    const scaleX = (idx) => {
      return padding.left + (idx / (phiData.length - 1)) * plotWidth;
    };

    const phiPath = phiData.map((d, i) => 
      `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(d.phi)}`
    ).join(' ');

    return (
      <svg width={width} height={height} className="plot-svg">
        {/* Reference lines at 0, 90, -90 */}
        <line x1={padding.left} y1={scaleY(0)} x2={width - padding.right} y2={scaleY(0)} stroke="#444" strokeDasharray="2,2" />
        <line x1={padding.left} y1={scaleY(90)} x2={width - padding.right} y2={scaleY(90)} stroke="#444" strokeDasharray="2,2" />
        <line x1={padding.left} y1={scaleY(-90)} x2={width - padding.right} y2={scaleY(-90)} stroke="#444" strokeDasharray="2,2" />

        {/* Phi line */}
        <path d={phiPath} fill="none" stroke="#9B59B6" strokeWidth="2" />

        {/* Axes */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#666" />
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#666" />

        {/* Y-axis labels */}
        <text x={padding.left - 35} y={scaleY(180)} fill="#666" fontSize="10">180°</text>
        <text x={padding.left - 35} y={scaleY(0)} fill="#666" fontSize="10">0°</text>
        <text x={padding.left - 35} y={scaleY(-180)} fill="#666" fontSize="10">-180°</text>

        <text x={padding.left - 40} y={height / 2} fill="#666" fontSize="12" transform={`rotate(-90 ${padding.left - 40} ${height / 2})`}>
          Phi (degrees)
        </text>
      </svg>
    );
  };

  return (
    <div className="cme-classification-tab">
      {/* Bz/By Plot */}
      <div className="plot-section">
        <div className="plot-header">
          <h3>Bz/By Magnetic Field</h3>
          <div className="plot-controls">
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={showBz}
                onChange={(e) => setShowBz(e.target.checked)}
              />
              <span style={{ color: '#4A90E2' }}>Bz</span>
            </label>
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={showBy}
                onChange={(e) => setShowBy(e.target.checked)}
              />
              <span style={{ color: '#E24A4A' }}>By</span>
            </label>
          </div>
        </div>
        <div className="plot-container">
          {renderBzByPlot()}
        </div>
      </div>

      {/* Phi Plot */}
      <div className="plot-section">
        <h3>Phi Angle</h3>
        <div className="plot-container">
          {renderPhiPlot()}
        </div>
      </div>

      {/* Classification Details */}
      <div className="classification-details">
        <h3>CME Classifications</h3>
        {cmes.length === 0 ? (
          <p className="no-classifications">No active CMEs to classify</p>
        ) : (
          <div className="classification-list">
            {cmes.map((cme, idx) => {
              const classification = classifications[cme.id];
              
              return (
                <div key={cme.id} className="classification-item">
                  <div className="classification-header">
                    <span className="cme-number">❶{idx + 1}</span>
                    <span className="cme-id">{cme.id}</span>
                    <span className={`cme-state ${cme.state.current.toLowerCase()}`}>
                      {cme.state.current}
                    </span>
                  </div>
                  
                  {classification ? (
                    <div className="classification-info">
                      <div className="info-row">
                        <span className="label">Bothmer-Schwenn Type:</span>
                        <span className="value">{classification.bs_type || 'Pending'}</span>
                      </div>
                      <div className="info-row">
                        <span className="label">Confidence:</span>
                        <span className="value">
                          {classification.confidence ? `${classification.confidence}%` : 'Pending'}
                        </span>
                      </div>
                      {classification.window_start && (
                        <div className="info-row">
                          <span className="label">Classification Window:</span>
                          <span className="value">
                            {new Date(classification.window_start).toLocaleString()} - 
                            {new Date(classification.window_end).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {classification.aurora_prediction && (
                        <div className="info-row">
                          <span className="label">Aurora Prediction:</span>
                          <span className="value">{classification.aurora_prediction}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="classification-pending">
                      <p>Classification pending - awaiting arrival window</p>
                      <p className="hint">
                        Classification begins when CME reaches classification window
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
