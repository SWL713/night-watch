const FONT = 'DejaVu Sans Mono, Consolas, monospace';

export default function CMEPositionViz({ cmes, positions, cmeColors, onCMEClick }) {
  if (!cmes || cmes.length === 0) return null;

  // SVG dimensions
  const width = 1000;
  const height = 200;
  
  const margin = 30;
  const sunX = margin + 25;
  const earthX = width - margin - 20;
  const centerY = height / 2;
  
  const sunRadius = 20;
  const earthRadius = 11;
  
  const distanceScale = (earthX - sunX - sunRadius - earthRadius) / 1.0;
  
  return (
    <svg 
      width="100%" 
      height="100%" 
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ maxWidth: '100%', maxHeight: '100%' }}
    >
      <line
        x1={sunX + sunRadius}
        y1={centerY}
        x2={earthX - earthRadius}
        y2={centerY}
        stroke="rgba(100,150,200,0.3)"
        strokeWidth="2"
        strokeDasharray="5,3"
      />
      
      <circle cx={sunX} cy={centerY} r={sunRadius} fill="url(#sunGradient)" stroke="#ff8800" strokeWidth="1.5" />
      <text x={sunX} y={centerY + 4} fill="#fff" fontSize="10" fontFamily={FONT} fontWeight="700" textAnchor="middle">SUN</text>
      
      <circle cx={earthX} cy={centerY} r={earthRadius} fill="url(#earthGradient)" stroke="#4488ff" strokeWidth="1.5" />
      <text x={earthX} y={centerY + 3} fill="#fff" fontSize="8" fontFamily={FONT} fontWeight="700" textAnchor="middle">🜨</text>
      
      {cmes.map((cme, idx) => {
        const distanceAU = cme.position?.distance_au || 0;
        const cmeX = sunX + sunRadius + (distanceAU * distanceScale);
        const cmeY = centerY;
        const color = cmeColors[idx % cmeColors.length];
        const cmeRadius = 6;
        
        return (
          <g key={cme.id}>
            <line x1={sunX + sunRadius} y1={centerY} x2={cmeX} y2={cmeY} stroke={color} strokeWidth="2" opacity="0.5" />
            <circle cx={cmeX} cy={cmeY} r={cmeRadius} fill={color} stroke={color} strokeWidth="1.5" opacity="0.9" style={{ cursor: 'pointer' }} onClick={() => onCMEClick?.(cme)} />
            <text x={cmeX} y={cmeY - cmeRadius - 5} fill={color} fontSize="11" fontFamily={FONT} fontWeight="700" textAnchor="middle">{idx + 1}</text>
            <text x={cmeX} y={cmeY + cmeRadius + 12} fill={color} fontSize="8" fontFamily={FONT} textAnchor="middle" opacity="0.8">{distanceAU.toFixed(2)} AU</text>
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
