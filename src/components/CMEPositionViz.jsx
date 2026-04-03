import React, { useEffect, useRef } from 'react';
import './CMEPositionViz.css';

export default function CMEPositionViz({ cmes, positions, onCMEClick }) {
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

      // Sun position (left side)
      const sunX = 50;
      const sunY = height / 2;
      const sunRadius = 20;

      // Earth position (right side)
      const earthX = width - 50;
      const earthY = height / 2;
      const earthRadius = 12;

      // Distance between Sun and Earth
      const distancePixels = earthX - sunX;

      // Draw connection line
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(sunX + sunRadius, sunY);
      ctx.lineTo(earthX - earthRadius, sunY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw distance markers (0.25 AU, 0.5 AU, 0.75 AU)
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      for (let i = 1; i < 4; i++) {
        const markerX = sunX + (distancePixels * i / 4);
        ctx.fillText(`${(i * 0.25).toFixed(2)} AU`, markerX - 20, sunY + 20);
        
        ctx.strokeStyle = '#444';
        ctx.beginPath();
        ctx.moveTo(markerX, sunY - 5);
        ctx.lineTo(markerX, sunY + 5);
        ctx.stroke();
      }

      // Draw Sun
      const gradient = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
      gradient.addColorStop(0, '#FDB813');
      gradient.addColorStop(1, '#FF6B35');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('☉', sunX, sunY + 4);

      // Draw Earth
      const earthGradient = ctx.createRadialGradient(earthX, earthY, 0, earthX, earthY, earthRadius);
      earthGradient.addColorStop(0, '#4A90E2');
      earthGradient.addColorStop(1, '#2E5C8A');
      ctx.fillStyle = earthGradient;
      ctx.beginPath();
      ctx.arc(earthX, earthY, earthRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('🌍', earthX, earthY + 3);

      // Draw L1 marker
      const l1X = earthX - (0.01 * distancePixels / 1.0); // L1 is ~0.01 AU from Earth
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(l1X, sunY - 15);
      ctx.lineTo(l1X, sunY + 15);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = '#888';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('L1', l1X, sunY + 25);

      // Draw CMEs as pulsing dots
      cmes.forEach((cme, idx) => {
        const progress = cme.position.progress_percent / 100;
        const cmeX = sunX + (distancePixels * progress);
        const cmeY = sunY - 30 + (idx * 15); // Stagger vertically

        // Pulsing effect
        const pulseSize = 5 + Math.sin(pulsePhase + idx * 0.5) * 2;
        const pulseOpacity = 0.6 + Math.sin(pulsePhase + idx * 0.5) * 0.4;

        // Draw pulsing glow
        const glowGradient = ctx.createRadialGradient(cmeX, cmeY, 0, cmeX, cmeY, pulseSize * 2);
        glowGradient.addColorStop(0, `rgba(255, 100, 100, ${pulseOpacity})`);
        glowGradient.addColorStop(1, 'rgba(255, 100, 100, 0)');
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(cmeX, cmeY, pulseSize * 2, 0, Math.PI * 2);
        ctx.fill();

        // Draw CME dot
        ctx.fillStyle = getStateColor(cme.state.current);
        ctx.beginPath();
        ctx.arc(cmeX, cmeY, pulseSize, 0, Math.PI * 2);
        ctx.fill();

        // Draw CME number
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${idx + 1}`, cmeX, cmeY + 3);

        // Draw progress line to show movement
        ctx.strokeStyle = `${getStateColor(cme.state.current)}66`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sunX + sunRadius, sunY);
        ctx.lineTo(cmeX, cmeY);
        ctx.stroke();
      });

      // Update pulse phase
      pulsePhase += 0.05;

      animationFrame = requestAnimationFrame(drawVisualization);
    };

    drawVisualization();

    // Handle clicks
    const handleClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const sunX = 50;
      const sunY = height / 2;
      const earthX = width - 50;
      const distancePixels = earthX - sunX;

      cmes.forEach((cme, idx) => {
        const progress = cme.position.progress_percent / 100;
        const cmeX = sunX + (distancePixels * progress);
        const cmeY = sunY - 30 + (idx * 15);

        const distance = Math.sqrt((x - cmeX) ** 2 + (y - cmeY) ** 2);
        if (distance < 10) {
          onCMEClick(cme);
        }
      });
    };

    canvas.addEventListener('click', handleClick);

    return () => {
      cancelAnimationFrame(animationFrame);
      canvas.removeEventListener('click', handleClick);
    };
  }, [cmes, onCMEClick]);

  const getStateColor = (state) => {
    const colors = {
      QUIET: '#888',
      WATCH: '#FFA500',
      INBOUND: '#FF6B35',
      IMMINENT: '#FF3333',
      ARRIVED: '#00FF00',
      STORM_ACTIVE: '#FF0000',
      SUBSIDING: '#4A90E2'
    };
    return colors[state] || '#888';
  };

  return (
    <div className="cme-position-viz">
      <canvas
        ref={canvasRef}
        width={800}
        height={200}
        style={{ width: '100%', height: 'auto' }}
      />
      <div className="viz-legend">
        <span className="legend-item">
          <span className="legend-dot" style={{ background: '#FFA500' }}></span>
          WATCH
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: '#FF6B35' }}></span>
          INBOUND
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: '#FF3333' }}></span>
          IMMINENT
        </span>
        <span className="legend-item">Click dots for details</span>
      </div>
    </div>
  );
}
