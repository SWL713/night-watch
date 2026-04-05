/**
 * Early Detection Tab — EPAM + STEREO-A plots
 * Exact copy of SpaceWeatherPanel's Early Detection sub-tab,
 * placed under CME Dashboard for quick access.
 */

import { useState, useMemo, Component } from 'react';
import { PlotCanvas, Toggle } from './SpaceWeatherPanel.jsx';

class EarlyDetectionErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 20, color: '#ee5577', fontFamily: 'monospace', background: '#06080f', height: '100%', whiteSpace: 'pre-wrap', fontSize: 11 }}>
        Early Detection error:{'\n'}{String(this.state.error?.message || this.state.error)}{'\n'}{String(this.state.error?.stack || '').slice(0, 500)}
      </div>
    );
    return this.props.children;
  }
}

const FONT = 'DejaVu Sans Mono, Consolas, monospace';

const C = {
  bg: '#06080f', border: '#0d1525', textDim: '#1a2a3a',
  e38: '#44aaff', e175: '#44eeff',
  p47: '#44ff88', p68: '#88ff44', p115: '#ffee44',
  p310: '#ffaa44', p795: '#ff6644', p1060: '#ff2244',
  bz_pos: '#44ddaa', bz_neg: '#ee5577', bt: '#ffcc44',
  speed: '#4488ff', density: '#aa66ff',
  now: 'rgba(255,255,255,0.35)',
};

const PRESETS = [
  { label: '6H',  ms: 6*3600000 },
  { label: '12H', ms: 12*3600000 },
  { label: '24H', ms: 24*3600000 },
  { label: '48H', ms: 48*3600000 },
  { label: '7D',  ms: 7*86400000 },
];

export default function EarlyDetectionTab({ epamData, stereoData, cmes }) {
  const [presetMs, setPresetMs] = useState(24 * 3600000);
  const [crosshairT, setCrosshairT] = useState(null);
  const [showElec, setShowElec] = useState(true);
  const [showProt, setShowProt] = useState(true);
  const [showStereo, setShowStereo] = useState(true);
  const [zoomMode, setZoomMode] = useState(false);
  const [zoomRange, setZoomRange] = useState(null);
  const [zoomStart, setZoomStart] = useState(null);

  const epam = epamData || [];
  const stereo = stereoData || [];

  const now = Date.now();
  const timeRange = useMemo(() => {
    if (zoomRange) return zoomRange;
    return [now - presetMs, now];
  }, [presetMs, zoomRange, now]);

  const handleZoomTap = (t) => {
    if (!zoomMode) return setCrosshairT(t);
    if (!zoomStart) { setZoomStart(t); }
    else {
      const t1 = Math.min(zoomStart, t);
      const t2 = Math.max(zoomStart, t);
      setZoomRange([t1, t2]);
      setZoomStart(null);
      setZoomMode(false);
    }
  };

  const commonProps = {
    timeRange,
    crosshairTime: zoomMode ? null : crosshairT,
    onCrosshair: zoomMode ? handleZoomTap : setCrosshairT,
    annotations: [],
    nowTime: now, speedKms: 450,
    showLabels: true,
    zoomMode,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, fontFamily: FONT, overflow: 'hidden' }}>

      {/* Time range + controls */}
      <div style={{ display: 'flex', gap: 3, padding: '3px 8px', borderBottom: `1px solid ${C.border}`, alignItems: 'center', flexShrink: 0 }}>
        {PRESETS.map(p => (
          <button key={p.ms} onClick={() => { setPresetMs(p.ms); setZoomRange(null); }} style={{
            padding: '2px 8px', fontSize: 8, fontFamily: FONT, cursor: 'pointer',
            background: presetMs === p.ms && !zoomRange ? '#0d1a2a' : '#060810',
            border: `1px solid ${presetMs === p.ms && !zoomRange ? '#44ddaa' : '#1a2a3a'}`,
            color: presetMs === p.ms && !zoomRange ? '#44ddaa' : '#2a4a5a',
            borderRadius: 2,
          }}>{p.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <Toggle label="ZOOM" active={zoomMode} color="#ffaa44" onClick={() => { setZoomMode(v => !v); setZoomStart(null); }} />
        {zoomRange && <Toggle label="RESET" active={false} color="#ee5577" onClick={() => setZoomRange(null)} />}
      </div>

      {/* EPAM banner */}
      <div style={{ padding: '4px 10px', borderBottom: `1px solid ${C.border}`, color: '#2a4a5a', fontSize: 8, letterSpacing: 0.5, flexShrink: 0 }}>
        ACE EPAM · Energetic Particle Data · ~2 days · 5-min averaged
        {epam.length === 0 && <span style={{ color: '#ff5544', marginLeft: 8 }}>NO DATA</span>}
      </div>

      {/* Electrons */}
      {showElec && epam.length > 0 && (
        <div style={{ borderBottom: `1px solid ${C.border}`, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '3px 8px 2px', display: 'flex', gap: 3, alignItems: 'center' }}>
            <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1, flex: 1 }}>ELECTRONS (cm⁻² s⁻¹ sr⁻¹ MeV⁻¹)</span>
            <span style={{ color: C.e38, fontSize: 7 }}>■ 38–53 keV</span>
            <span style={{ color: C.e175, fontSize: 7, marginLeft: 4 }}>■ 175–315 keV</span>
          </div>
          <PlotCanvas
            data={epam}
            series={[
              { key: 'e38', color: C.e38, width: 1.3 },
              { key: 'e175', color: C.e175, width: 1.3 },
            ]}
            yMin={1e1} yMax={1e6} logScale={true}
            {...commonProps}
          />
        </div>
      )}

      {/* EPAM signal alert — shows when any CME has a non-quiet EPAM signal */}
      {(() => {
        const allCMEs = cmes || [];
        const alerts = allCMEs
          .filter(c => c.epam_analysis && c.epam_analysis.description !== 'quiet')
          .map(c => ({ id: c.id, ...c.epam_analysis }));
        if (!alerts.length) return null;
        return (
          <div style={{
            margin: '4px 10px', padding: '6px 10px',
            border: '1px solid #ffaa00', borderRadius: 4,
            background: 'rgba(255,170,0,0.08)',
            fontFamily: FONT, flexShrink: 0,
          }}>
            {alerts.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < alerts.length - 1 ? 4 : 0 }}>
                <span style={{ color: a.esp_detected ? '#ff5544' : '#ffaa00', fontSize: 10, fontWeight: 700 }}>
                  {a.esp_detected ? '⚠' : '●'}
                </span>
                <span style={{ color: '#ffaa00', fontSize: 9, fontWeight: 600, flex: 1 }}>
                  {a.description.toUpperCase()}
                </span>
                <span style={{ color: '#7a8a90', fontSize: 7 }}>
                  {a.id.replace('CME_', '')} · +{a.confidence_boost}% conf
                </span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Protons */}
      {showProt && epam.length > 0 && (
        <div style={{ borderBottom: `1px solid ${C.border}`, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '3px 8px 2px', display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1, width: '100%' }}>PROTONS (cm⁻² s⁻¹ sr⁻¹ MeV⁻¹)</span>
            {[['p47','47–68'],['p68','68–115'],['p115','115–195'],['p310','310–580'],['p795','795–1193'],['p1060','1060–1900']].map(([k,l]) => (
              <span key={k} style={{ color: C[k], fontSize: 6 }}>■ {l}</span>
            ))}
          </div>
          <PlotCanvas
            data={epam}
            series={[
              { key: 'p47', color: C.p47, width: 1.0 },
              { key: 'p68', color: C.p68, width: 1.0 },
              { key: 'p115', color: C.p115, width: 1.0 },
              { key: 'p310', color: C.p310, width: 1.1 },
              { key: 'p795', color: C.p795, width: 1.2 },
              { key: 'p1060', color: C.p1060, width: 1.3 },
            ]}
            yMin={1e1} yMax={1e6} logScale={true}
            {...commonProps}
          />
        </div>
      )}

      {/* STEREO-A Bn */}
      {showStereo && (
        <div style={{ borderBottom: `1px solid ${C.border}`, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '3px 8px 2px', flexShrink: 0 }}>
            <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1 }}>STEREO-A UPSTREAM · Bn (RTN ecliptic-north)</span>
            {stereo.length > 0
              ? <span style={{ color: '#2a4a5a', fontSize: 6, marginLeft: 8 }}>{stereo.length} PTS</span>
              : <span style={{ color: '#ff5544', fontSize: 6, marginLeft: 8 }}>NO DATA</span>
            }
          </div>
          {stereo.length > 0
            ? <PlotCanvas
                data={stereo}
                series={[
                  { key: 'bn', color: C.bz_pos, width: 1.6, colorFn: v => v < 0 ? C.bz_neg : C.bz_pos },
                  { key: 'bt_tot', color: C.bt, width: 1.0, dash: [3, 2] },
                ]}
                yMin={null} yMax={null}
                {...commonProps}
              />
            : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#1a2a3a', fontSize: 8 }}>PIPELINE WILL POPULATE ON NEXT RUN</span>
              </div>
          }
        </div>
      )}

      {/* STEREO-A Speed & Density */}
      {showStereo && stereo.length > 0 && (
        <div style={{ borderBottom: `1px solid ${C.border}`, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '3px 8px 2px', flexShrink: 0 }}>
            <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1 }}>STEREO-A UPSTREAM · Speed &amp; Density</span>
          </div>
          <PlotCanvas
            data={stereo}
            series={[
              { key: 'speed', color: C.speed, width: 1.3 },
              { key: 'density', color: C.density, width: 1.3 },
            ]}
            yMin={null} yMax={null}
            {...commonProps}
          />
        </div>
      )}

      {/* Toggles */}
      <div style={{ display: 'flex', gap: 3, padding: '6px 8px', borderTop: `1px solid ${C.border}`, flexWrap: 'wrap', flexShrink: 0 }}>
        <Toggle label="ELECTRONS" active={showElec} color={C.e38} onClick={() => setShowElec(v => !v)} />
        <Toggle label="PROTONS" active={showProt} color={C.p310} onClick={() => setShowProt(v => !v)} />
        <Toggle label="STEREO-A" active={showStereo} color="#cc88ff" onClick={() => setShowStereo(v => !v)} />
      </div>
    </div>
  );
}
