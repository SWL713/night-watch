import { useState } from 'react';
import CMEQueueTab from './CMEQueueTab';
import CMEClassificationTab from './CMEClassificationTab';
import { useCMEData } from '../hooks/useCMEData';

const FONT = 'DejaVu Sans Mono, Consolas, monospace';
const C = {
  bg: '#06080f',
  border: '#0d1525',
  tabActive: '#44ddaa',
  tabInactive: '#1a2a3a',
  text: '#e0e6ed',
};

export default function CMEDashboard() {
  const [activeTab, setActiveTab] = useState('queue');
  const { cmes, classifications, positions, loading, error } = useCMEData();

  // Share registry between tabs
  const [registry, setRegistry] = useState({});

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text, fontSize: 11 }}>
        Loading CME data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff6666', fontSize: 11 }}>
        Error loading CME data: {error}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ 
        display: 'flex', 
        gap: 4, 
        padding: '8px 12px', 
        borderBottom: `2px solid ${C.border}`,
        background: C.bg,
        flexShrink: 0
      }}>
        <button
          onClick={() => setActiveTab('queue')}
          style={{
            background: activeTab === 'queue' ? 'rgba(68,221,170,0.1)' : 'transparent',
            border: `1px solid ${activeTab === 'queue' ? C.tabActive : C.tabInactive}`,
            color: activeTab === 'queue' ? C.tabActive : C.tabInactive,
            padding: '6px 16px',
            fontSize: 10,
            fontFamily: FONT,
            fontWeight: activeTab === 'queue' ? 700 : 400,
            cursor: 'pointer',
            borderRadius: 3,
            letterSpacing: 0.5,
            transition: 'all 0.2s ease',
          }}
        >
          CME QUEUE
        </button>
        <button
          onClick={() => setActiveTab('classification')}
          style={{
            background: activeTab === 'classification' ? 'rgba(68,221,170,0.1)' : 'transparent',
            border: `1px solid ${activeTab === 'classification' ? C.tabActive : C.tabInactive}`,
            color: activeTab === 'classification' ? C.tabActive : C.tabInactive,
            padding: '6px 16px',
            fontSize: 10,
            fontFamily: FONT,
            fontWeight: activeTab === 'classification' ? 700 : 400,
            cursor: 'pointer',
            borderRadius: 3,
            letterSpacing: 0.5,
            transition: 'all 0.2s ease',
          }}
        >
          CLASSIFICATION
        </button>
      </div>

      {activeTab === 'queue' && (
        <CMEQueueTab cmes={cmes} positions={positions} />
      )}

      {activeTab === 'classification' && (
        <CMEClassificationTab cmes={cmes} classifications={classifications} registry={registry} />
      )}
    </div>
  );
}
