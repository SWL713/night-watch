const FONT = 'DejaVu Sans Mono, Consolas, monospace';

export default function CMEPositionViz({ cmes, positions, cmeColors, onCMEClick }) {
  if (!cmes || cmes.length === 0) return null;

  const width = 1000;
  const height = 140;  // 30% less (was 200)
  
  const margin = 25;
  const sunX = margin + 30;
  const earthX = width - margin - 25;
  const centerY = height / 2;
  
  // 2X BIGGER DOTS
  const sunRadius = 30;    // was 20
  const earthRadius = 16;  // was 11
  const cmeRadius = 10;    // was 6
  
  // Rescale distance to fit
  const distanceScale = (earthX - sunX - sunRadius - earthRadius) / 1.0;
  
  return (
    <svg 
      width="100%" 
      height="100%" 
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ maxWidth: '100%', maxHeight: '100%' }}
    >
      {/* PULSE ANIMATION */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 0.9; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.15); }
          }
          .cme-pulse {
            animation: pulse 2s ease-in-out infinite;
            transform-origin: center;
          }
        `}
      </style>

      <line
        x1={sunX + sunRadius}
        y1={centerY}
        x2={earthX - earthRadius}
        y2={centerY}
        stroke="rgba(100,150,200,0.3)"
        strokeWidth="2"
        strokeDasharray="5,3"
      />
      
      <circle cx={sunX} cy={centerY} r={sunRadius} fill="url(#sunGradient)" stroke="#ff8800" strokeWidth="2" />
      <text x={sunX} y={centerY + 5} fill="#fff" fontSize="11" fontFamily={FONT} fontWeight="700" textAnchor="middle">SUN</text>
      
      <circle cx={earthX} cy={centerY} r={earthRadius} fill="url(#earthGradient)" stroke="#4488ff" strokeWidth="2" />
      <text x={earthX} y={centerY + 4} fill="#fff" fontSize="9" fontFamily={FONT} fontWeight="700" textAnchor="middle">🜨</text>
      
      {cmes.map((cme, idx) => {
        const distanceAU = cme.position?.distance_au || 0;
        const cmeX = sunX + sunRadius + (distanceAU * distanceScale);
        const cmeY = centerY;
        const color = cmeColors[idx % cmeColors.length];
        
        return (
          <g key={cme.id}>
            <line x1={sunX + sunRadius} y1={centerY} x2={cmeX} y2={cmeY} stroke={color} strokeWidth="2.5" opacity="0.5" />
            
            {/* PULSING CME */}
            <circle 
              className="cme-pulse"
              cx={cmeX} 
              cy={cmeY} 
              r={cmeRadius} 
              fill={color} 
              stroke={color} 
              strokeWidth="2" 
              style={{ cursor: 'pointer' }} 
              onClick={() => onCMEClick?.(cme)} 
            />
            
            {/* SMALLER TEXT - match card size */}
            <text x={cmeX} y={cmeY - cmeRadius - 6} fill={color} fontSize="9" fontFamily={FONT} fontWeight="700" textAnchor="middle">{idx + 1}</text>
            <text x={cmeX} y={cmeY + cmeRadius + 12} fill={color} fontSize="7" fontFamily={FONT} textAnchor="middle" opacity="0.8">{distanceAU.toFixed(2)} AU</text>
          </g>
        );
      })}
      
      <defs>
        <radialGradient id="sunGradient">
          <stop offset="0%" stopColor="#ffdd44" />
          <stop offset="100%" stopColor="#ff8800" />
        </radialGradient>
        <radialGradient id="earthGradient">
          <stop offset="0%" stopColor="#6699ff" />
          <stop offset="100%" stopColor="#2255aa" />
        </radialGradient>
      </defs>
    </svg>
  );
}
