import React, { useEffect, useRef } from 'react';
import './CMEPositionViz.css';

export default function CMEPositionViz({ cmes, positions, cmeColors, onCMEClick }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    let animationFrame;
    let pulsePhase = 0;

    const drawVisualization = () => {
      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Positions (side view: Sun on left, Earth on right)
      const sunX = 60;
      const sunY = height / 2;
      const sunRadius = 25;

      const earthX = width - 80;
      const earthY = height / 2;
      const earthRadius = 15;

      const distancePixels = earthX - sunX;

      // Draw base trajectory line (parallel, horizontal)
      ctx.strokeStyle = '#1a3a40';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sunX + sunRadius, sunY);
      ctx.lineTo(earthX - earthRadius, sunY);
      ctx.stroke();

      // Draw distance markers
      ctx.fillStyle = '#4a6a70';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      for (let i = 1; i < 4; i++) {
        const markerX = sunX + (distancePixels * i / 4);
        ctx.fillText(`${(i * 0.25).toFixed(2)}AU`, markerX, sunY + 25);
        
        ctx.strokeStyle = '#2a4a50';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(markerX, sunY - 8);
        ctx.lineTo(markerX, sunY + 8);
        ctx.stroke();
      }

      // Draw Sun
      const sunGradient = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
      sunGradient.addColorStop(0, '#FFA500');
      sunGradient.addColorStop(0.7, '#FF6B00');
      sunGradient.addColorStop(1, '#CC5500');
      ctx.fillStyle = sunGradient;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
      ctx.fill();

      // Sun glow
      ctx.shadowColor = '#FF6B00';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('☉', sunX, sunY + 5);

      // Draw L1 Lagrange point
      const l1Distance = 0.01; // L1 is ~0.01 AU from Earth
      const l1X = earthX - (l1Distance * distancePixels);
      
      ctx.strokeStyle = '#00FFF0';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(l1X, sunY - 20);
      ctx.lineTo(l1X, sunY + 20);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = '#00FFF0';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('L1', l1X, sunY - 28);

      // Draw Earth
      const earthGradient = ctx.createRadialGradient(earthX, earthY, 0, earthX, earthY, earthRadius);
      earthGradient.addColorStop(0, '#2E8BC0');
      earthGradient.addColorStop(0.7, '#145DA0');
      earthGradient.addColorStop(1, '#0C2D48');
      ctx.fillStyle = earthGradient;
      ctx.beginPath();
      ctx.arc(earthX, earthY, earthRadius, 0, Math.PI * 2);
      ctx.fill();

      // Earth glow
      ctx.shadowColor = '#2E8BC0';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(earthX, earthY, earthRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('🌍', earthX, earthY + 4);

      // Draw STEREO-A (ahead of Earth by ~48 degrees in orbit)
      const stereoDistance = 1.02; // AU from Sun
      const stereoAngle = 48; // degrees ahead of Earth
      const stereoX = earthX + 40;
      const stereoY = sunY - 40;
      
      ctx.fillStyle = '#FF00FF66';
      ctx.beginPath();
      ctx.arc(stereoX, stereoY, 8, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = '#FF00FF';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(stereoX, stereoY, 8, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.fillStyle = '#FF00FF';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('STA', stereoX, stereoY + 20);

      // Draw CMEs as pulsing dots (parallel paths)
      cmes.forEach((cme, idx) => {
        const progress = cme.position.progress_percent / 100;
        const cmeX = sunX + sunRadius + (distancePixels * progress);
        const cmeY = sunY; // All on same parallel path

        const cmeColor = cmeColors[idx % cmeColors.length];

        // Pulsing effect
        const pulseSize = 8 + Math.sin(pulsePhase + idx * 0.8) * 3;
        const pulseOpacity = 0.5 + Math.sin(pulsePhase + idx * 0.8) * 0.3;

        // Draw pulsing glow
        const glowGradient = ctx.createRadialGradient(cmeX, cmeY, 0, cmeX, cmeY, pulseSize * 2.5);
        glowGradient.addColorStop(0, `${cmeColor}${Math.floor(pulseOpacity * 255).toString(16).padStart(2, '0')}`);
        glowGradient.addColorStop(0.5, `${cmeColor}44`);
        glowGradient.addColorStop(1, `${cmeColor}00`);
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(cmeX, cmeY, pulseSize * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Draw CME dot
        ctx.fillStyle = `${cmeColor}DD`;
        ctx.shadowColor = cmeColor;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(cmeX, cmeY, pulseSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Neon outline
        ctx.strokeStyle = cmeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cmeX, cmeY, pulseSize, 0, Math.PI * 2);
        ctx.stroke();

        // Draw CME number
        ctx.fillStyle = '#000';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${idx + 1}`, cmeX, cmeY + 4);
      });

      // Update pulse phase
      pulsePhase += 0.04;

      animationFrame = requestAnimationFrame(drawVisualization);
    };

    drawVisualization();

    // Handle clicks
    const handleClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);

      const sunX = 60;
      const sunY = height / 2;
      const earthX = width - 80;
      const distancePixels = earthX - sunX;

      cmes.forEach((cme, idx) => {
        const progress = cme.position.progress_percent / 100;
        const cmeX = sunX + 25 + (distancePixels * progress);
        const cmeY = sunY;

        const distance = Math.sqrt((x - cmeX) ** 2 + (y - cmeY) ** 2);
        if (distance < 15) {
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
    <div className="cme-position-viz">
      <canvas
        ref={canvasRef}
        width={900}
        height={250}
        style={{ width: '100%', height: 'auto', maxWidth: '100%' }}
      />
      <div className="viz-legend">
        {cmes.map((cme, idx) => (
          <span key={cme.id} className="legend-item">
            <span 
              className="legend-dot" 
              style={{ background: cmeColors[idx % cmeColors.length] }}
            >
              {idx + 1}
            </span>
            {cme.id.split('_')[1]}
          </span>
        ))}
      </div>
    </div>
  );
}
