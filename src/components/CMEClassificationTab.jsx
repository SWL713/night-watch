import { useState, useEffect } from 'react';

const FONT = 'DejaVu Sans Mono, Consolas, monospace';
const C = {
  bg: '#06080f',
  plotBg: '#04060d',
  border: '#0d1525',
  grid: 'rgba(30,45,70,0.6)',
  zero: 'rgba(60,90,120,0.5)',
  text: '#2a4a5a',
  textDim: '#1a2a3a',
  bz_neg: '#ee5577',
  bz_pos: '#44ddaa',
  by: '#4488ff',
  phi: '#44aaff',
};

const CME_COLORS = [
  '#00FFF0', '#FF00FF', '#00FF00', '#FFFF00', 
  '#FF0080', '#0080FF', '#FF8000', '#80FF00',
];

export default function CMEClassificationTab({ cmes, classifications }) {
  const [showBz, setShowBz] = useState(true);
  const [showBy, setShowBy] = useState(true);
  const [magData, setMagData] = useState([]);
  const [selectedCMEIndex, setSelectedCMEIndex] = useState(0);

  useEffect(() => {
    const fetchMagData = async () => {
      try {
        const response = await fetch(`/night-watch/data/space_weather.json?t=${Date.now()}`);
        if (!response.ok) return;
        
        const data = await response.json();
        
        // Extract last 24 hours
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
          
          setMagData(recentData);
        }
      } catch (err) {
        console.error('Error loading mag data:', err);
      }
    };

    fetchMagData();
    const interval = setInterval(fetchMagData, 60000);
    return () => clearInterval(interval);
  }, []);

  const renderBzByPlot = () => {
    if (magData.length === 0) {
      return (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: 160,
          color: C.textDim,
          fontSize: 9
        }}>
          Loading magnetic field data...
        </div>
      );
    }

    const width = 800;
    const height = 160;
    const padL = 40, padR = 10, padT = 10, padB = 20;
    const plotWidth = width - padL - padR;
    const plotHeight = height - padT - padB;

    const allVals = magData.flatMap(d => [d.bz, d.by]).filter(v => v != null);
    const minVal = Math.min(...allVals, -10);
    const maxVal = Math.max(...allVals, 10);

    const scaleY = (v) => {
      const norm = (v - minVal) / (maxVal - minVal);
      return padT + plotHeight - (norm * plotHeight);
    };

    const scaleX = (idx) => {
      return padL + (idx / (magData.length - 1)) * plotWidth;
    };

    const bzPath = magData.map((d, i) => 
      d.bz != null ? `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(d.bz)}` : ''
    ).join(' ');

    const byPath = magData.map((d, i) => 
      d.by != null ? `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(d.by)}` : ''
    ).join(' ');

    return (
      <svg width={width} height={height} style={{ background: C.plotBg, borderRadius: 4 }}>
        <line x1={padL} y1={scaleY(0)} x2={width - padR} y2={scaleY(0)} stroke={C.zero} strokeWidth="2" />
        {showBz && <path d={bzPath} fill="none" stroke={C.bz_pos} strokeWidth="2" style={{ filter: 'drop-shadow(0 0 3px #44ddaa88)' }} />}
        {showBy && <path d={byPath} fill="none" stroke={C.by} strokeWidth="2" style={{ filter: 'drop-shadow(0 0 3px #4488ff88)' }} />}
        <line x1={padL} y1={padT} x2={padL} y2={height - padB} stroke={C.grid} strokeWidth="1" />
        <line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} stroke={C.grid} strokeWidth="1" />
        <text x={padL - 28} y={scaleY(maxVal)} fill={C.textDim} fontSize="9">{maxVal.toFixed(0)}</text>
        <text x={padL - 28} y={scaleY(0)} fill={C.textDim} fontSize="9">0</text>
        <text x={padL - 28} y={scaleY(minVal)} fill={C.textDim} fontSize="9">{minVal.toFixed(0)}</text>
        <text x={padL - 32} y={height / 2} fill={C.textDim} fontSize="10" transform={`rotate(-90 ${padL - 32} ${height / 2})`}>nT</text>
        <text x={width / 2} y={height - 4} fill={C.textDim} fontSize="9" textAnchor="middle">Last 24 Hours</text>
      </svg>
    );
  };

  const renderPhiPlot = () => {
    if (magData.length === 0) {
      return (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: 120,
          color: C.textDim,
          fontSize: 9
        }}>
          Loading phi data...
        </div>
      );
    }

    const width = 800;
    const height = 120;
    const padL = 40, padR = 10, padT = 10, padB = 20;
    const plotWidth = width - padL - padR;
    const plotHeight = height - padT - padB;

    const scaleY = (angle) => {
      const norm = (angle + 180) / 360;
      return padT + plotHeight - (norm * plotHeight);
    };

    const scaleX = (idx) => {
      return padL + (idx / (magData.length - 1)) * plotWidth;
    };

    const phiPath = magData.map((d, i) => 
      d.phi != null ? `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(d.phi)}` : ''
    ).join(' ');

    return (
      <svg width={width} height={height} style={{ background: C.plotBg, borderRadius: 4 }}>
        <line x1={padL} y1={scaleY(0)} x2={width - padR} y2={scaleY(0)} stroke={C.zero} strokeWidth="2" />
        <line x1={padL} y1={scaleY(90)} x2={width - padR} y2={scaleY(90)} stroke={C.grid} strokeWidth="1" strokeDasharray="3,3" />
        <line x1={padL} y1={scaleY(-90)} x2={width - padR} y2={scaleY(-90)} stroke={C.grid} strokeWidth="1" strokeDasharray="3,3" />
        <path d={phiPath} fill="none" stroke={C.phi} strokeWidth="2" style={{ filter: 'drop-shadow(0 0 3px #44aaff88)' }} />
        <line x1={padL} y1={padT} x2={padL} y2={height - padB} stroke={C.grid} />
        <line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} stroke={C.grid} />
        <text x={padL - 28} y={scaleY(180)} fill={C.textDim} fontSize="9">180°</text>
        <text x={padL - 28} y={scaleY(0)} fill={C.textDim} fontSize="9">0°</text>
        <text x={padL - 28} y={scaleY(-180)} fill={C.textDim} fontSize="9">-180°</text>
        <text x={padL - 32} y={height / 2} fill={C.textDim} fontSize="10" transform={`rotate(-90 ${padL - 32} ${height / 2})`}>Phi (deg)</text>
      </svg>
    );
  };

  if (cmes.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: C.text,
        fontSize: 11
      }}>
        No active CMEs to classify
      </div>
    );
  }

  const selectedCME = cmes[selectedCMEIndex];
  const selectedColor = CME_COLORS[selectedCMEIndex % CME_COLORS.length];
  const classification = classifications[selectedCME.id];

  return (
    <div style={{ 
      flex: 1, 
      display: 'flex', 
      flexDirection: 'column', 
      overflow: 'auto',
      padding: '8px'
    }}>
      {/* Bz/By Plot */}
      <div style={{ 
        background: C.bg, 
        border: `1px solid ${C.border}`, 
        borderRadius: 4, 
        padding: '8px',
        marginBottom: 8
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: 8
        }}>
          <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1 }}>
            MAGNETIC FIELD (nT)
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={showBz} 
                onChange={(e) => setShowBz(e.target.checked)}
                style={{ accentColor: C.bz_pos }}
              />
              <span style={{ color: C.bz_pos, fontSize: 8, fontWeight: 700 }}>Bz</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={showBy} 
                onChange={(e) => setShowBy(e.target.checked)}
                style={{ accentColor: C.by }}
              />
              <span style={{ color: C.by, fontSize: 8, fontWeight: 700 }}>By</span>
            </label>
          </div>
        </div>
        <div style={{ width: '100%', overflowX: 'auto' }}>
          {renderBzByPlot()}
        </div>
      </div>

      {/* Phi Plot */}
      <div style={{ 
        background: C.bg, 
        border: `1px solid ${C.border}`, 
        borderRadius: 4, 
        padding: '8px',
        marginBottom: 8
      }}>
        <div style={{ marginBottom: 8 }}>
          <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1 }}>
            IMF PHI GSM (°)
          </span>
        </div>
        <div style={{ width: '100%', overflowX: 'auto' }}>
          {renderPhiPlot()}
        </div>
      </div>

      {/* Classification Details */}
      <div style={{ 
        background: C.bg, 
        border: `2px solid ${selectedColor}`, 
        borderRadius: 4, 
        padding: '10px'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8,
          marginBottom: 8,
          paddingBottom: 8,
          borderBottom: `1px solid ${C.border}`
        }}>
          <span style={{ color: selectedColor, fontSize: 16, fontWeight: 'bold' }}>
            {selectedCMEIndex + 1}
          </span>
          <span style={{ color: C.textDim, fontSize: 8, fontFamily: FONT, flex: 1 }}>
            {selectedCME.id}
          </span>
          <span style={{
            background: selectedCME.state.current === 'WATCH' ? '#FFA500' : '#4a6a70',
            color: selectedCME.state.current === 'WATCH' ? '#000' : '#fff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 7,
            fontWeight: 700
          }}>
            {selectedCME.state.current}
          </span>
        </div>

        {classification ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: C.textDim }}>BOTHMER-SCHWENN TYPE:</span>
              <span style={{ color: '#e0e6ed' }}>{classification.bs_type || 'Pending'}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: C.textDim }}>CONFIDENCE:</span>
              <span style={{ color: '#e0e6ed' }}>
                {classification.confidence ? `${classification.confidence}%` : 'Pending'}
              </span>
            </div>
            {classification.window_start && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: C.textDim }}>WINDOW:</span>
                <span style={{ color: '#e0e6ed', fontSize: 7 }}>
                  {new Date(classification.window_start).toLocaleString()} - 
                  {new Date(classification.window_end).toLocaleString()}
                </span>
              </div>
            )}
            {classification.aurora_prediction && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: C.textDim }}>AURORA:</span>
                <span style={{ color: '#e0e6ed' }}>{classification.aurora_prediction}</span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '12px 0', color: C.textDim, fontSize: 8 }}>
            Classification pending - awaiting arrival window
          </div>
        )}

        {/* CME Selector Buttons - Horizontal at bottom */}
        {cmes.length > 1 && (
          <div style={{ 
            display: 'flex', 
            gap: 4, 
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${C.border}`,
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            {cmes.map((cme, idx) => (
              <button
                key={cme.id}
                onClick={() => setSelectedCMEIndex(idx)}
                style={{
                  background: idx === selectedCMEIndex 
                    ? `${CME_COLORS[idx % CME_COLORS.length]}22` 
                    : 'transparent',
                  border: `1px solid ${CME_COLORS[idx % CME_COLORS.length]}`,
                  color: CME_COLORS[idx % CME_COLORS.length],
                  minWidth: 28,
                  height: 28,
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: 'bold',
                  transition: 'all 0.2s ease',
                  boxShadow: idx === selectedCMEIndex 
                    ? `0 0 12px ${CME_COLORS[idx % CME_COLORS.length]}88` 
                    : 'none'
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
