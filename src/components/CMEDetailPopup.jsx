const FONT = 'DejaVu Sans Mono, Consolas, monospace';

export default function CMEDetailPopup({ cme, cmeNumber, cmeColor, onClose }) {
  const formatDate = (isoString) => {
    if (!isoString) return 'Unknown';
    return new Date(isoString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '16px',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0f1419',
          border: `2px solid ${cmeColor}`,
          borderRadius: 8,
          maxWidth: 600,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: `0 0 30px ${cmeColor}88`,
        }}
      >
        {/* Header */}
        <div
          style={{
            background: '#0a0e1a',
            padding: '12px 16px',
            borderBottom: `2px solid ${cmeColor}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: cmeColor, fontSize: 20, fontWeight: 'bold' }}>
              {cmeNumber}
            </span>
            <span style={{ color: '#e0e6ed', fontSize: 14, fontFamily: FONT }}>
              {cme.id}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '2px solid #7a8a90',
              color: '#7a8a90',
              width: 32,
              height: 32,
              borderRadius: '50%',
              fontSize: 16,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#FF0080';
              e.currentTarget.style.color = '#FF0080';
              e.currentTarget.style.boxShadow = '0 0 12px #FF008066';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#7a8a90';
              e.currentTarget.style.color = '#7a8a90';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Source */}
          <div>
            <h4
              style={{
                margin: '0 0 10px 0',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: 1,
                fontWeight: 700,
                color: cmeColor,
              }}
            >
              Source
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 11 }}>
              <div>
                <div style={{ color: '#7a8a90', fontSize: 8, marginBottom: 3 }}>LAUNCH TIME</div>
                <div style={{ color: '#e0e6ed' }}>{formatDate(cme.source.launch_time)}</div>
              </div>
              <div>
                <div style={{ color: '#7a8a90', fontSize: 8, marginBottom: 3 }}>REGION</div>
                <div style={{ color: '#e0e6ed' }}>{cme.source.region || 'Unknown'}</div>
              </div>
            </div>
          </div>

          {/* Properties */}
          <div>
            <h4
              style={{
                margin: '0 0 10px 0',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: 1,
                fontWeight: 700,
                color: cmeColor,
              }}
            >
              Properties
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 11 }}>
              <div>
                <div style={{ color: '#7a8a90', fontSize: 8, marginBottom: 3 }}>TYPE</div>
                <div style={{ color: '#e0e6ed' }}>{cme.properties.type || 'Unknown'}</div>
              </div>
              <div>
                <div style={{ color: '#7a8a90', fontSize: 8, marginBottom: 3 }}>CURRENT SPEED</div>
                <div style={{ color: '#e0e6ed' }}>
                  {cme.properties.speed_current
                    ? `${Math.round(cme.properties.speed_current)} km/s`
                    : 'Unknown'}
                </div>
              </div>
              <div>
                <div style={{ color: '#7a8a90', fontSize: 8, marginBottom: 3 }}>INITIAL SPEED</div>
                <div style={{ color: '#e0e6ed' }}>
                  {cme.properties.speed_initial
                    ? `${Math.round(cme.properties.speed_initial)} km/s`
                    : 'Unknown'}
                </div>
              </div>
              <div>
                <div style={{ color: '#7a8a90', fontSize: 8, marginBottom: 3 }}>WIDTH</div>
                <div style={{ color: '#e0e6ed' }}>
                  {cme.properties.width ? `${cme.properties.width}°` : 'Unknown'}
                </div>
              </div>
            </div>
          </div>

          {/* Position */}
          <div>
            <h4
              style={{
                margin: '0 0 10px 0',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: 1,
                fontWeight: 700,
                color: cmeColor,
              }}
            >
              Position
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 11 }}>
              <div>
                <div style={{ color: '#7a8a90', fontSize: 8, marginBottom: 3 }}>DISTANCE</div>
                <div style={{ color: '#e0e6ed' }}>
                  {cme.position.distance_au.toFixed(3)} AU ({cme.position.distance_rsun.toFixed(1)} R☉)
                </div>
              </div>
              <div>
                <div style={{ color: '#7a8a90', fontSize: 8, marginBottom: 3 }}>PROGRESS</div>
                <div style={{ color: '#e0e6ed' }}>{cme.position.progress_percent.toFixed(1)}%</div>
              </div>
              <div>
                <div style={{ color: '#7a8a90', fontSize: 8, marginBottom: 3 }}>ETA (HOURS)</div>
                <div style={{ color: '#e0e6ed' }}>
                  {cme.position.eta_hours ? Math.round(cme.position.eta_hours) : 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ color: '#7a8a90', fontSize: 8, marginBottom: 3 }}>ETA</div>
                <div style={{ color: '#e0e6ed', fontSize: 9 }}>
                  {cme.position.eta_timestamp ? formatDate(cme.position.eta_timestamp) : 'N/A'}
                </div>
              </div>
            </div>
          </div>

          {/* State */}
          <div>
            <h4
              style={{
                margin: '0 0 10px 0',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: 1,
                fontWeight: 700,
                color: cmeColor,
              }}
            >
              State
            </h4>
            <div>
              <span
                style={{
                  background:
                    cme.state.current === 'WATCH'
                      ? '#FFA500'
                      : cme.state.current === 'INBOUND'
                      ? '#FF6B00'
                      : cme.state.current === 'IMMINENT'
                      ? '#FF0080'
                      : '#4a6a70',
                  color: cme.state.current === 'WATCH' ? '#000' : '#fff',
                  padding: '4px 12px',
                  borderRadius: 4,
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  display: 'inline-block',
                }}
              >
                {cme.state.current}
              </span>
            </div>
          </div>

          {/* Arrival Models */}
          <div>
            <h4
              style={{
                margin: '0 0 10px 0',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: 1,
                fontWeight: 700,
                color: cmeColor,
              }}
            >
              Arrival Prediction
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ color: '#7a8a90', fontSize: 8, minWidth: 80 }}>MODELS:</div>
                <div style={{ color: '#e0e6ed' }}>{cme.arrival.num_models}</div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ color: '#7a8a90', fontSize: 8, minWidth: 80 }}>MEDIAN:</div>
                <div style={{ color: '#e0e6ed', fontSize: 9 }}>
                  {cme.arrival.median_time ? formatDate(cme.arrival.median_time) : 'N/A'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ color: '#7a8a90', fontSize: 8, minWidth: 80 }}>RANGE:</div>
                <div style={{ color: '#e0e6ed', fontSize: 9 }}>
                  {cme.arrival.earliest_time && cme.arrival.latest_time
                    ? `${formatDate(cme.arrival.earliest_time)} - ${formatDate(cme.arrival.latest_time)}`
                    : 'N/A'}
                </div>
              </div>
            </div>
          </div>

          {/* Scoreboard Link */}
          {cme.scoreboard_url && (
            <a
              href={cme.scoreboard_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                padding: '10px 16px',
                background: cmeColor,
                color: '#000',
                textDecoration: 'none',
                borderRadius: 6,
                fontWeight: 600,
                transition: 'all 0.3s ease',
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: 1,
                fontSize: 10,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.filter = 'brightness(1.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.filter = 'none';
              }}
            >
              View Scoreboard
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
