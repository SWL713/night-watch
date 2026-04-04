const FONT = 'DejaVu Sans Mono, Consolas, monospace';
const DIM = '#7a8a90';
const TEXT = '#e0e6ed';

export default function CMEDetailPopup({ cme, cmeNumber, cmeColor, onClose }) {
  const fmtDate = (v) => {
    if (!v) return 'Unknown';
    // Handle both ISO strings and Unix timestamps
    const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
    if (isNaN(d)) return 'Unknown';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  };

  const fmtDateShort = (v) => {
    if (!v) return '?';
    const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
    if (isNaN(d)) return '?';
    return `${(d.getUTCMonth()+1)}/${d.getUTCDate()} ${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')}`;
  };

  const arr = cme.arrival || {};
  const pos = cme.position || {};
  const props = cme.properties || {};
  const cls = cme.classification || {};
  const rating = cme.aurora_rating || {};

  // Compute ± window from earliest/latest
  const medianTs = arr.median_prediction || arr.average_prediction;
  const earliestTs = arr.earliest_prediction;
  const latestTs = arr.latest_prediction;
  let plusMinusHours = null;
  if (medianTs && earliestTs && latestTs) {
    plusMinusHours = Math.round(((latestTs - earliestTs) / 2) / 3600);
  }

  // State badge colors
  const stateColors = {
    QUIET: '#556677', WATCH: '#FFA500', INBOUND: '#FF6B00', IMMINENT: '#FF0080',
    ARRIVED: '#00cc88', STORM_ACTIVE: '#ee3355', SUBSIDING: '#8888aa',
  };
  const stateCol = stateColors[cme.state?.current] || '#4a6a70';
  const stateDark = ['WATCH', 'ARRIVED'].includes(cme.state?.current);

  // Aurora stars
  const stars = rating.stars ?? 0;
  const starStr = '★'.repeat(stars) + '☆'.repeat(5 - stars);

  // Section header
  const Hdr = ({ children }) => (
    <h4 style={{ margin: '0 0 8px 0', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, color: cmeColor }}>{children}</h4>
  );

  // Grid cell
  const Cell = ({ label, children, wide }) => (
    <div style={wide ? { gridColumn: '1 / -1' } : {}}>
      <div style={{ color: DIM, fontSize: 7, marginBottom: 2, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: TEXT, fontSize: 11 }}>{children}</div>
    </div>
  );

  return (
    <div onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, padding: 16, backdropFilter: 'blur(4px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0f1419', border: `2px solid ${cmeColor}`, borderRadius: 8,
        maxWidth: 620, width: '100%', maxHeight: '85vh', overflowY: 'auto',
        boxShadow: `0 0 30px ${cmeColor}88`, fontFamily: FONT,
      }}>
        {/* Header */}
        <div style={{
          background: '#0a0e1a', padding: '10px 16px', borderBottom: `2px solid ${cmeColor}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: cmeColor, fontSize: 20, fontWeight: 'bold' }}>{cmeNumber}</span>
            <span style={{ color: TEXT, fontSize: 13 }}>{cme.id}</span>
            <span style={{
              background: stateCol, color: stateDark ? '#000' : '#fff',
              padding: '2px 8px', borderRadius: 3, fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
            }}>{cme.state?.current}</span>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid #555', color: '#888',
            width: 28, height: 28, borderRadius: '50%', fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Aurora Rating */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
            <span style={{ fontSize: 22, color: stars >= 4 ? '#ffaa00' : stars >= 2 ? '#ffcc66' : '#667788', letterSpacing: 2 }}>{starStr}</span>
            <div>
              <div style={{ fontSize: 10, color: TEXT }}>Aurora potential {stars}/5 <span style={{ color: DIM, fontSize: 9 }}>({rating.confidence || 0}% conf)</span></div>
              <div style={{ fontSize: 8, color: DIM }}>{rating.basis || ''}</div>
            </div>
          </div>

          {/* Source */}
          <div>
            <Hdr>Source</Hdr>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Cell label="LAUNCH TIME">{fmtDate(cme.source?.launch_time)}</Cell>
              <Cell label="SOURCE REGION">{cme.source?.region || cme.source?.associated_flare || 'Unknown'}</Cell>
              {(cme.source?.location?.latitude !== 0 || cme.source?.location?.longitude !== 0) && (
                <Cell label="LOCATION">{cme.source.location.latitude}° lat, {cme.source.location.longitude}° lon</Cell>
              )}
              {cme.source?.coronal_hole && <Cell label="CORONAL HOLE">Associated</Cell>}
            </div>
          </div>

          {/* Properties */}
          <div>
            <Hdr>Properties</Hdr>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <Cell label="TYPE">{props.type || 'Unknown'}</Cell>
              <Cell label="INITIAL SPEED">{props.speed_initial ? `${Math.round(props.speed_initial)} km/s` : 'Unknown'}</Cell>
              <Cell label="CURRENT SPEED">{props.speed_current ? `${Math.round(props.speed_current)} km/s` : 'Unknown'}</Cell>
              <Cell label="HALF ANGLE">{props.half_angle ? `${props.half_angle}°` : 'Unknown'}</Cell>
              {(props.direction_lat !== 0 || props.direction_lon !== 0) && (
                <Cell label="DIRECTION">{props.direction_lat}° lat, {props.direction_lon}° lon</Cell>
              )}
            </div>
          </div>

          {/* Arrival Prediction */}
          <div>
            <Hdr>Arrival Prediction</Hdr>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Cell label="PREDICTED ARRIVAL" wide>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(medianTs)}</span>
                {plusMinusHours != null && plusMinusHours > 0 && (
                  <span style={{ color: '#ffaa33', fontWeight: 600, marginLeft: 6, fontSize: 11 }}>±{plusMinusHours}h</span>
                )}
              </Cell>
              <Cell label="EARLIEST">{fmtDateShort(earliestTs)} UTC</Cell>
              <Cell label="LATEST">{fmtDateShort(latestTs)} UTC</Cell>
              <Cell label="MODELS">{arr.num_models || 'Unknown'}</Cell>
              {arr.confidence_spread_hours != null && <Cell label="SPREAD">{arr.confidence_spread_hours.toFixed(1)}h</Cell>}
            </div>
          </div>

          {/* Position & Propagation */}
          <div>
            <Hdr>Position</Hdr>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <Cell label="DISTANCE">{pos.distance_au != null ? `${pos.distance_au.toFixed(3)} AU` : 'Unknown'}</Cell>
              {pos.distance_rsun != null && <Cell label="SOLAR RADII">{pos.distance_rsun.toFixed(1)} R☉</Cell>}
              <Cell label="PROGRESS">{pos.progress_percent != null ? `${pos.progress_percent.toFixed(1)}%` : 'Unknown'}</Cell>
              {pos.eta_hours != null && (
                <Cell label="ETA">
                  {Math.round(pos.eta_hours)}h
                  {plusMinusHours != null && plusMinusHours > 0 && (
                    <span style={{ color: '#ffaa33', marginLeft: 4 }}>±{plusMinusHours}h</span>
                  )}
                </Cell>
              )}
            </div>
          </div>

          {/* Classification */}
          {cls.bs_type && (
            <div>
              <Hdr>Classification</Hdr>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <Cell label="B-S TYPE"><span style={{ fontWeight: 700 }}>{cls.bs_type}</span></Cell>
                {cls.confidence != null && <Cell label="CONFIDENCE">{cls.confidence.toFixed(0)}%</Cell>}
                <Cell label="STATUS">{cls.status}</Cell>
              </div>
            </div>
          )}

          {/* State History */}
          {cme.state?.history?.length > 0 && (
            <div>
              <Hdr>State History</Hdr>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {cme.state.history.map((h, i) => (
                  <span key={i} style={{ fontSize: 8, color: DIM, background: '#0a0e1a', padding: '2px 6px', borderRadius: 3, border: '1px solid #1a2a3a' }}>
                    {h.from} → {h.to}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Scoreboard Link */}
          {(arr.scoreboard_url || cme.scoreboard_url) && (
            <a href={arr.scoreboard_url || cme.scoreboard_url} target="_blank" rel="noopener noreferrer" style={{
              display: 'block', padding: '8px 16px', background: cmeColor, color: '#000',
              textDecoration: 'none', borderRadius: 6, fontWeight: 600, textAlign: 'center',
              textTransform: 'uppercase', letterSpacing: 1, fontSize: 9,
            }}>
              CCMC Scoreboard
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
