import React, { useState, useEffect } from 'react';
import './CMEClassificationTab.css';

// Neon colors matching Queue tab
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

export default function CMEClassificationTab({ cmes, classifications }) {
  const [showBz, setShowBz] = useState(true);
  const [showBy, setShowBy] = useState(true);
  const [bzByData, setBzByData] = useState([]);
  const [phiData, setPhiData] = useState([]);
  const [selectedCMEIndex, setSelectedCMEIndex] = useState(0);

  useEffect(() => {
    // Fetch L1 magnetic field data for plots
    const fetchMagData = async () => {
      try {
        const response = await fetch(`/night-watch/data/space_weather.json?t=${Date.now()}`);
        if (!response.ok) {
          console.warn('Could not load space_weather.json');
          return;
        }
        
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
    const interval = setInterval(fetchMagData, 60000);
    return () => clearInterval(interval);
  }, []);

  const renderBzByPlot = () => {
    if (bzByData.length === 0) {
      return <div className="plot-empty">Loading magnetic field data...</div>;
    }

    const width = 800;
    const height = 180;
    const padding = { top: 15, right: 15, bottom: 25, left: 45 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

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

    const bzPath = bzByData.map((d, i) => 
      `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(d.bz)}`
    ).join(' ');

    const byPath = bzByData.map((d, i) => 
      `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(d.by)}`
    ).join(' ');

    return (
      <svg width={width} height={height} className="plot-svg">
        <line x1={padding.left} y1={scaleY(0)} x2={width - padding.right} y2={scaleY(0)} stroke="#1a3a40" strokeWidth="2" />
        {showBz && <path d={bzPath} fill="none" stroke="#00FFF0" strokeWidth="2" style={{ filter: 'drop-shadow(0 0 4px #00FFF088)' }} />}
        {showBy && <path d={byPath} fill="none" stroke="#FF00FF" strokeWidth="2" style={{ filter: 'drop-shadow(0 0 4px #FF00FF88)' }} />}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#4a6a70" strokeWidth="1" />
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#4a6a70" strokeWidth="1" />
        <text x={padding.left - 32} y={scaleY(maxVal)} fill="#7a8a90" fontSize="10">{maxVal.toFixed(0)}</text>
        <text x={padding.left - 32} y={scaleY(0)} fill="#7a8a90" fontSize="10">0</text>
        <text x={padding.left - 32} y={scaleY(minVal)} fill="#7a8a90" fontSize="10">{minVal.toFixed(0)}</text>
        <text x={padding.left - 35} y={height / 2} fill="#7a8a90" fontSize="11" transform={`rotate(-90 ${padding.left - 35} ${height / 2})`}>nT</text>
        <text x={width / 2} y={height - 5} fill="#7a8a90" fontSize="11" textAnchor="middle">Last 24 Hours</text>
      </svg>
    );
  };

  const renderPhiPlot = () => {
    if (phiData.length === 0) {
      return <div className="plot-empty">Loading phi data...</div>;
    }

    const width = 800;
    const height = 130;
    const padding = { top: 15, right: 15, bottom: 25, left: 45 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const scaleY = (angle) => {
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
        <line x1={padding.left} y1={scaleY(0)} x2={width - padding.right} y2={scaleY(0)} stroke="#1a3a40" strokeWidth="2" />
        <line x1={padding.left} y1={scaleY(90)} x2={width - padding.right} y2={scaleY(90)} stroke="#1a3a40" strokeWidth="1" strokeDasharray="3,3" />
        <line x1={padding.left} y1={scaleY(-90)} x2={width - padding.right} y2={scaleY(-90)} stroke="#1a3a40" strokeWidth="1" strokeDasharray="3,3" />
        <path d={phiPath} fill="none" stroke="#FFFF00" strokeWidth="2" style={{ filter: 'drop-shadow(0 0 4px #FFFF0088)' }} />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#4a6a70" />
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#4a6a70" />
        <text x={padding.left - 32} y={scaleY(180)} fill="#7a8a90" fontSize="10">180°</text>
        <text x={padding.left - 32} y={scaleY(0)} fill="#7a8a90" fontSize="10">0°</text>
        <text x={padding.left - 32} y={scaleY(-180)} fill="#7a8a90" fontSize="10">-180°</text>
        <text x={padding.left - 35} y={height / 2} fill="#7a8a90" fontSize="11" transform={`rotate(-90 ${padding.left - 35} ${height / 2})`}>Phi (deg)</text>
      </svg>
    );
  };

  if (cmes.length === 0) {
    return (
      <div className="cme-classification-tab">
        <div className="no-cmes">No active CMEs to classify</div>
      </div>
    );
  }

  const selectedCME = cmes[selectedCMEIndex];
  const selectedColor = CME_COLORS[selectedCMEIndex % CME_COLORS.length];
  const classification = classifications[selectedCME.id];

  return (
    <div className="cme-classification-tab">
      {/* Bz/By Plot */}
      <div className="plot-section">
        <div className="plot-header">
          <h3>Bz/By Magnetic Field</h3>
          <div className="plot-controls">
            <label className="toggle-control">
              <input type="checkbox" checked={showBz} onChange={(e) => setShowBz(e.target.checked)} />
              <span style={{ color: '#00FFF0' }}>Bz</span>
            </label>
            <label className="toggle-control">
              <input type="checkbox" checked={showBy} onChange={(e) => setShowBy(e.target.checked)} />
              <span style={{ color: '#FF00FF' }}>By</span>
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

      {/* Classification for Selected CME */}
      <div className="classification-details" style={{ borderColor: selectedColor }}>
        <div className="classification-header">
          <span className="cme-number" style={{ color: selectedColor }}>
            {selectedCMEIndex + 1}
          </span>
          <span className="cme-id">{selectedCME.id}</span>
          <span className={`cme-state ${selectedCME.state.current.toLowerCase()}`}>
            {selectedCME.state.current}
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
          </div>
        )}

        {/* CME Selector at Bottom - Horizontal */}
        {cmes.length > 1 && (
          <div className="cme-selector-bottom">
            {cmes.map((cme, idx) => (
              <button
                key={cme.id}
                className={`cme-selector-btn-small ${idx === selectedCMEIndex ? 'active' : ''}`}
                onClick={() => setSelectedCMEIndex(idx)}
                style={{
                  borderColor: CME_COLORS[idx % CME_COLORS.length],
                  color: CME_COLORS[idx % CME_COLORS.length],
                  background: idx === selectedCMEIndex ? `${CME_COLORS[idx % CME_COLORS.length]}22` : 'transparent'
                }}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
