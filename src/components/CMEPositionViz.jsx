import { useEffect, useRef } from 'react';

export default function CMEPositionViz({ cmes, positions, cmeColors, onCMEClick }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    
    // Fixed dimensions - proper aspect ratio
    const canvasWidth = 1000;
    const canvasHeight = 120;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    let animationFrame;
    let pulsePhase = 0;

    const drawVisualization = () => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Positions
      const sunX = 80;
      const sunY = canvasHeight / 2;
      const sunRadius = 18;
      const earthX = canvasWidth - 100;
      const earthY = canvasHeight / 2;
      const earthRadius = 12;
      const distancePixels = earthX - sunX;

      // Base trajectory line
      ctx.strokeStyle = '#1a3a40';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sunX + sunRadius, sunY);
      ctx.lineTo(earthX - earthRadius, sunY);
      ctx.stroke();

      // Distance markers
      ctx.fillStyle = '#4a6a70';
      ctx.font = '8px DejaVu Sans Mono, Consolas, monospace';
      ctx.textAlign = 'center';
      for (let i = 1; i < 4; i++) {
        const markerX = sunX + (distancePixels * i / 4);
        ctx.fillText(`${(i * 0.25).toFixed(2)}AU`, markerX, sunY + 16);
        ctx.strokeStyle = '#2a4a50';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(markerX, sunY - 5);
        ctx.lineTo(markerX, sunY + 5);
        ctx.stroke();
      }

      // Sun
      const sunGradient = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
      sunGradient.addColorStop(0, '#FFA500');
      sunGradient.addColorStop(0.7, '#FF6B00');
      sunGradient.addColorStop(1, '#CC5500');
      ctx.fillStyle = sunGradient;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = '#FF6B00';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('☉', sunX, sunY + 4);

      // L1 marker
      const l1X = earthX - (0.01 * distancePixels);
      ctx.strokeStyle = '#00FFF0';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(l1X, sunY - 12);
      ctx.lineTo(l1X, sunY + 12);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#00FFF0';
      ctx.font = 'bold 7px DejaVu Sans Mono, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('L1', l1X, sunY - 16);

      // STEREO-A (upstream, offset)
      const stereoX = sunX + (1.02 * distancePixels);
      const stereoY = sunY - 30;
      ctx.strokeStyle = '#FF00FF44';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(sunX + sunRadius, sunY);
      ctx.lineTo(stereoX, stereoY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#FF00FF44';
      ctx.beginPath();
      ctx.arc(stereoX, stereoY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FF00FF';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(stereoX, stereoY, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#FF00FF';
      ctx.font = '6px DejaVu Sans Mono, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('STA', stereoX, stereoY + 14);
      ctx.fillText('(upstream)', stereoX, stereoY + 21);

      // Earth
      const earthGradient = ctx.createRadialGradient(earthX, earthY, 0, earthX, earthY, earthRadius);
      earthGradient.addColorStop(0, '#2E8BC0');
      earthGradient.addColorStop(0.7, '#145DA0');
      earthGradient.addColorStop(1, '#0C2D48');
      ctx.fillStyle = earthGradient;
      ctx.beginPath();
      ctx.arc(earthX, earthY, earthRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = '#2E8BC0';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(earthX, earthY, earthRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('🌍', earthX, earthY + 3);

      // CMEs
      cmes.forEach((cme, idx) => {
        const progress = cme.position.progress_percent / 100;
        const cmeX = sunX + sunRadius + (distancePixels * progress);
        const cmeY = sunY;
        const cmeColor = cmeColors[idx % cmeColors.length];
        const pulseSize = 6 + Math.sin(pulsePhase + idx * 0.8) * 2;
        const pulseOpacity = 0.5 + Math.sin(pulsePhase + idx * 0.8) * 0.3;

        // Glow
        const glowGradient = ctx.createRadialGradient(cmeX, cmeY, 0, cmeX, cmeY, pulseSize * 2);
        glowGradient.addColorStop(0, `${cmeColor}${Math.floor(pulseOpacity * 255).toString(16).padStart(2, '0')}`);
        glowGradient.addColorStop(0.5, `${cmeColor}44`);
        glowGradient.addColorStop(1, `${cmeColor}00`);
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(cmeX, cmeY, pulseSize * 2, 0, Math.PI * 2);
        ctx.fill();

        // Dot
        ctx.fillStyle = `${cmeColor}DD`;
        ctx.shadowColor = cmeColor;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(cmeX, cmeY, pulseSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = cmeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cmeX, cmeY, pulseSize, 0, Math.PI * 2);
        ctx.stroke();

        // Number
        ctx.fillStyle = '#000';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${idx + 1}`, cmeX, cmeY + 3);
      });

      pulsePhase += 0.04;
      animationFrame = requestAnimationFrame(drawVisualization);
    };

    drawVisualization();

    const handleClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvasWidth / rect.width;
      const scaleY = canvasHeight / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      const sunX = 80;
      const sunY = canvasHeight / 2;
      const earthX = canvasWidth - 100;
      const distancePixels = earthX - sunX;

      cmes.forEach((cme, idx) => {
        const progress = cme.position.progress_percent / 100;
        const cmeX = sunX + 18 + (distancePixels * progress);
        const cmeY = sunY;
        const distance = Math.sqrt((x - cmeX) ** 2 + (y - cmeY) ** 2);
        if (distance < 12) {
          onCMEClick(cme);
        }
      });
    };

    canvas.addEventListener('click', handleClick);

    return () => {
      cancelAnimationFrame(animationFrame);
      canvas.removeEventListener('click', handleClick);
    };
  }, [cmes, cmeColors, onCMEClick]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <canvas
        ref={canvasRef}
        style={{ 
          maxWidth: '100%', 
          maxHeight: '100%',
          width: 'auto',
          height: 'auto',
          cursor: 'pointer'
        }}
      />
    </div>
  );
}
