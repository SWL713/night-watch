const FONT = 'DejaVu Sans Mono, Consolas, monospace';

export default function CMEPositionViz({ cmes, positions, cmeColors, onCMEClick }) {
  if (!cmes || cmes.length === 0) return null;

  const width = 1000;
  const height = 220;
  
  // Margins
  const margin = 30;
  const usableWidth = width - (2 * margin);
  
  // SMALLER sizes so everything fits
  const sunX = margin + 25;
  const earthX = width - margin - 20;
  const centerY = height / 2;
  
  const sunRadius = 22;    // was 35, now smaller
  const earthRadius = 12;  // was 18, now smaller
  
  const distanceScale = (earthX - sunX - sunRadius - earthRadius) / 1.0;
  
  return (
    <svg width={width} height={height} style={{ maxWidth: '100%', height: 'auto' }}>
      {/* Orbital path */}
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
      <circle cx={sunX} cy={centerY} r={sunRadius} fill="url(#sunGradient)" stroke="#ff8800" strokeWidth="1.5" />
      <text x={sunX} y={centerY + 4} fill="#fff" fontSize="10" fontFamily={FONT} fontWeight="700" textAnchor="middle">SUN</text>
      
      {/* Earth */}
      <circle cx={earthX} cy={centerY} r={earthRadius} fill="url(#earthGradient)" stroke="#4488ff" strokeWidth="1.5" />
      <text x={earthX} y={centerY + 3} fill="#fff" fontSize="8" fontFamily={FONT} fontWeight="700" textAnchor="middle">🜨</text>
      
      {/* CMEs */}
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
