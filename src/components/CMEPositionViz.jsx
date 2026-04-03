const FONT = 'DejaVu Sans Mono, Consolas, monospace';

export default function CMEPositionViz({ cmes, positions, cmeColors, onCMEClick }) {
  if (!cmes || cmes.length === 0) return null;

  const width = 1000;
  const height = 220;
  
  // REDUCED margins to make more room
  const margin = 20;  // was 60
  const usableWidth = width - (2 * margin);
  
  // Sun at left, Earth at right with BIGGER radii
  const sunX = margin + 40;  // Bigger sun needs more space
  const earthX = width - margin - 30;
  const centerY = height / 2;
  
  const sunRadius = 35;    // was 20, now 75% bigger!
  const earthRadius = 18;  // was 10, now 80% bigger!
  
  // Scale for CME positions
  const distanceScale = (earthX - sunX - sunRadius - earthRadius) / 1.0; // 1.0 AU distance
  
  return (
    <svg width={width} height={height} style={{ maxWidth: '100%', height: 'auto' }}>
      {/* Orbital path - thicker */}
      <line
        x1={sunX + sunRadius}
        y1={centerY}
        x2={earthX - earthRadius}
        y2={centerY}
        stroke="rgba(100,150,200,0.3)"
        strokeWidth="3"
        strokeDasharray="6,4"
      />
      
      {/* Sun - BIGGER */}
      <circle
        cx={sunX}
        cy={centerY}
        r={sunRadius}
        fill="url(#sunGradient)"
        stroke="#ff8800"
        strokeWidth="2"
      />
      <text
        x={sunX}
        y={centerY + 5}
        fill="#fff"
        fontSize="11"
        fontFamily={FONT}
        fontWeight="700"
        textAnchor="middle"
      >
        SUN
      </text>
      
      {/* Earth - BIGGER */}
      <circle
        cx={earthX}
        cy={centerY}
        r={earthRadius}
        fill="url(#earthGradient)"
        stroke="#4488ff"
        strokeWidth="2"
      />
      <text
        x={earthX}
        y={centerY + 4}
        fill="#fff"
        fontSize="9"
        fontFamily={FONT}
        fontWeight="700"
        textAnchor="middle"
      >
        🜨
      </text>
      
      {/* CMEs - BIGGER dots and labels */}
      {cmes.map((cme, idx) => {
        const distanceAU = cme.position?.distance_au || 0;
        const cmeX = sunX + sunRadius + (distanceAU * distanceScale);
        const cmeY = centerY;
        const color = cmeColors[idx % cmeColors.length];
        const cmeRadius = 8;  // was 5, now 60% bigger!
        
        return (
          <g key={cme.id}>
            {/* Connection line - thicker */}
            <line
              x1={sunX + sunRadius}
              y1={centerY}
              x2={cmeX}
              y2={cmeY}
              stroke={color}
              strokeWidth="2.5"
              opacity="0.5"
            />
            
            {/* CME dot - BIGGER */}
            <circle
              cx={cmeX}
              cy={cmeY}
              r={cmeRadius}
              fill={color}
              stroke={color}
              strokeWidth="2"
              opacity="0.9"
              style={{ cursor: 'pointer' }}
              onClick={() => onCMEClick?.(cme)}
            />
            
            {/* CME label - BIGGER text */}
            <text
              x={cmeX}
              y={cmeY - cmeRadius - 6}
              fill={color}
              fontSize="12"
              fontFamily={FONT}
              fontWeight="700"
              textAnchor="middle"
            >
              {idx + 1}
            </text>
            
            {/* Distance label - BIGGER text */}
            <text
              x={cmeX}
              y={cmeY + cmeRadius + 14}
              fill={color}
              fontSize="9"
              fontFamily={FONT}
              textAnchor="middle"
              opacity="0.8"
            >
              {distanceAU.toFixed(2)} AU
            </text>
          </g>
        );
      })}
      
      {/* Gradients */}
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
