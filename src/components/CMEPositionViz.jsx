const FONT = 'DejaVu Sans Mono, Consolas, monospace';

export default function CMEPositionViz({ cmes, positions, cmeColors, onCMEClick }) {
  if (!cmes || cmes.length === 0) return null;

  const width = 1000;
  const height = 140;
  
  const margin = 25;
  const sunX = margin + 35;
  const earthX = width - margin - 25;
  const centerY = height / 2;
  
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
      {/* BIGGER OUTER GLOW */}
      <style>
        {`
          @keyframes cme-throb {
            0%, 100% { 
              transform: scale(1);
              filter: drop-shadow(0 0 6px currentColor) drop-shadow(0 0 10px currentColor);
              opacity: 0.85;
            }
            50% { 
              transform: scale(1.25);
              filter: drop-shadow(0 0 20px currentColor) drop-shadow(0 0 32px currentColor) drop-shadow(0 0 40px currentColor);
              opacity: 1;
            }
          }
          .cme-pulse {
            animation: cme-throb 1.8s ease-in-out infinite;
            transform-origin: center;
            transform-box: fill-box;
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
      <text x={sunX} y={centerY + 7} fill="#fff" fontSize="22" fontFamily={FONT} fontWeight="700" textAnchor="middle">SUN</text>
      
      <circle cx={earthX} cy={centerY} r={earthRadius} fill="url(#earthGradient)" stroke="#4488ff" strokeWidth="2" />
      <text x={earthX} y={centerY + 5} fill="#fff" fontSize="18" fontFamily={FONT} fontWeight="700" textAnchor="middle">🜨</text>
      
      {cmes.map((cme, idx) => {
        const distanceAU = cme.position?.distance_au || 0;
        const cmeX = sunX + sunRadius + (distanceAU * distanceScale);
        const cmeY = centerY;
        const color = cmeColors[idx % cmeColors.length];
        
        return (
          <g key={cme.id}>
            <line x1={sunX + sunRadius} y1={centerY} x2={cmeX} y2={cmeY} stroke={color} strokeWidth="2.5" opacity="0.5" />
            
            <circle 
              className="cme-pulse"
              cx={cmeX} 
              cy={cmeY} 
              r={cmeRadius} 
              fill={color} 
              stroke={color} 
              strokeWidth="2"
              style={{ 
                cursor: 'pointer',
                color: color
              }} 
              onClick={() => onCMEClick?.(cme)} 
            />
            
            <text x={cmeX} y={cmeY - cmeRadius - 8} fill={color} fontSize="18" fontFamily={FONT} fontWeight="700" textAnchor="middle">{idx + 1}</text>
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
