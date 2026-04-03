import { useState } from 'react';
import { useCMEData } from '../hooks/useCMEData';
import CMEQueueTab from './CMEQueueTab';
import CMEClassificationTab from './CMEClassificationTab';

const FONT = 'DejaVu Sans Mono, Consolas, monospace';
const C = {
  bg: '#06080f',
  border: '#0d1525',
  textDim: '#1a2a3a',
};

export default function CMEDashboard() {
  const { cmes, positions, classifications, loading, error } = useCMEData();
  const [subTab, setSubTab] = useState('queue');

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%', 
        background: C.bg, 
        fontFamily: FONT,
        alignItems: 'center',
        justifyContent: 'center',
        color: '#2a4a5a',
        fontSize: 11
      }}>
        Loading CME data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%', 
        background: C.bg, 
        fontFamily: FONT,
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ff4444',
        fontSize: 11
      }}>
        Error: {error}
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%', 
      background: C.bg, 
      fontFamily: FONT, 
      overflow: 'hidden' 
    }}>
      {/* Sub-tab selector - EXACT same style as SpaceWeatherPanel */}
      <div style={{ 
        display: 'flex', 
        gap: 3, 
        padding: '4px 8px', 
        borderBottom: `1px solid ${C.border}`, 
        flexShrink: 0 
      }}>
        {[
          ['queue', 'QUEUE'],
          ['classification', 'CLASSIFICATION']
        ].map(([key, label]) => (
          <button 
            key={key} 
            onClick={() => setSubTab(key)} 
            style={{
              flex: 1, 
              height: 28, 
              background: subTab === key ? '#0d1a2a' : '#060810',
              border: `1px solid ${subTab === key ? '#44ddaa' : '#1a2a3a'}`,
              color: subTab === key ? '#44ddaa' : '#2a4a5a',
              fontSize: 9, 
              fontFamily: FONT, 
              letterSpacing: 0.5,
              cursor: 'pointer', 
              borderRadius: 2, 
              position: 'relative',
            }}
          >
            {subTab === key && (
              <div style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                right: 0, 
                height: 1, 
                background: 'rgba(68,221,170,0.5)' 
              }} />
            )}
            {label}
          </button>
        ))}
      </div>

      {/* Content area - fills remaining space */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {subTab === 'queue' && (
          <CMEQueueTab cmes={cmes} positions={positions} />
        )}
        {subTab === 'classification' && (
          <CMEClassificationTab cmes={cmes} classifications={classifications} />
        )}
      </div>
    </div>
  );
}
