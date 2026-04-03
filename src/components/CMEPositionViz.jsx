const FONT = 'DejaVu Sans Mono, Consolas, monospace';

export default function CMEPositionViz({ cmes, positions, cmeColors, onCMEClick }) {
  if (!cmes || cmes.length === 0) return null;

  const width = 1000;
  const height = 140;
  
  const margin = 25;
  const sunX = margin + 35;
  const earthX = width - margin - 25;
  const centerY = height / 2;
  
  // SUN 1.5X BIGGER (was 30, now 45)
  const sunRadius = 45;
  const earthRadius = 16;
  const cmeRadius = 10;
  
  const distanceScale = (earthX - sunX - sunRadius - earthRadius) / 1.0;
  
  return (
    <svg 
      width="100%" 
      height="100%" 
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ maxWidth: '100%', maxHeight: '100%' }}
    >
      {/* INDIVIDUAL CME GLOW PULSE */}
      <style>
        {`
          @keyframes cme-glow-pulse {
            0%, 100% { 
              filter: drop-shadow(0 0 3px currentColor);
            }
            50% { 
              filter: drop-shadow(0 0 12px currentColor) drop-shadow(0 0 20px currentColor);
            }
          }
          .cme-glow {
            animation: cme-glow-pulse 2s ease-in-out infinite;
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
      
      {/* Sun */}
      <circle cx={sunX} cy={centerY} r={sunRadius} fill="url(#sunGradient)" stroke="#ff8800" strokeWidth="2" />
      <text x={sunX} y={centerY + 7} fill="#fff" fontSize="22" fontFamily={FONT} fontWeight="700" textAnchor="middle">SUN</text>
      
      {/* Earth */}
      <circle cx={earthX} cy={centerY} r={earthRadius} fill="url(#earthGradient)" stroke="#4488ff" strokeWidth="2" />
      <text x={earthX} y={centerY + 5} fill="#fff" fontSize="18" fontFamily={FONT} fontWeight="700" textAnchor="middle">🜨</text>
      
      {/* CMEs - INDIVIDUAL GLOW PULSE */}
      {cmes.map((cme, idx) => {
        const distanceAU = cme.position?.distance_au || 0;
        const cmeX = sunX + sunRadius + (distanceAU * distanceScale);
        const cmeY = centerY;
        const color = cmeColors[idx % cmeColors.length];
        
        return (
          <g key={cme.id}>
            <line x1={sunX + sunRadius} y1={centerY} x2={cmeX} y2={cmeY} stroke={color} strokeWidth="2.5" opacity="0.5" />
            
            {/* INDIVIDUAL GLOWING CME */}
            <circle 
              className="cme-glow"
              cx={cmeX} 
              cy={cmeY} 
              r={cmeRadius} 
              fill={color} 
              stroke={color} 
              strokeWidth="2"
              style={{ 
                cursor: 'pointer',
                color: color  // for currentColor in drop-shadow
              }} 
              onClick={() => onCMEClick?.(cme)} 
            />
            
            {/* TEXT 2X BIGGER */}
            <text x={cmeX} y={cmeY - cmeRadius - 6} fill={color} fontSize="18" fontFamily={FONT} fontWeight="700" textAnchor="middle">{idx + 1}</text>
            <text x={cmeX} y={cmeY + cmeRadius + 16} fill={color} fontSize="14" fontFamily={FONT} textAnchor="middle" opacity="0.8">{distanceAU.toFixed(2)} AU</text>
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
