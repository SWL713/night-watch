import { useState } from 'react';
import CMEQueueTab from './CMEQueueTab';
import CMEClassificationTab from './CMEClassificationTab';
import XRayFluxTab from './XRayFluxTab';
import EarlyDetectionTab from './EarlyDetectionTab';
import useCMEData from '../hooks/useCMEData';

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
  const { cmes, classifications, classificationMetadata, positions, magData, stereoData, epamData, loading, error } = useCMEData();

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
        justifyContent: 'center', // CENTERED
        gap: 4, 
        padding: '8px 12px', 
        borderBottom: `2px solid ${C.border}`,
        background: C.bg,
        flexShrink: 0
      }}>
        <button
          onClick={() => setActiveTab('xray')}
          style={{
            background: activeTab === 'xray' ? 'rgba(68,221,170,0.1)' : 'transparent',
            border: `1px solid ${activeTab === 'xray' ? C.tabActive : C.tabInactive}`,
            color: activeTab === 'xray' ? C.tabActive : C.tabInactive,
            padding: '6px 16px',
            fontSize: 10,
            fontFamily: FONT,
            fontWeight: activeTab === 'xray' ? 700 : 400,
            cursor: 'pointer',
            borderRadius: 3,
            letterSpacing: 0.5,
            transition: 'all 0.2s ease',
          }}
        >
          X-RAY FLUX
        </button>
        <button
          onClick={() => setActiveTab('early')}
          style={{
            background: activeTab === 'early' ? 'rgba(68,221,170,0.1)' : 'transparent',
            border: `1px solid ${activeTab === 'early' ? C.tabActive : C.tabInactive}`,
            color: activeTab === 'early' ? C.tabActive : C.tabInactive,
            padding: '6px 16px',
            fontSize: 10,
            fontFamily: FONT,
            fontWeight: activeTab === 'early' ? 700 : 400,
            cursor: 'pointer',
            borderRadius: 3,
            letterSpacing: 0.5,
            transition: 'all 0.2s ease',
          }}
        >
          EARLY DETECTION
        </button>
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

      {activeTab === 'xray' && (
        <XRayFluxTab />
      )}

      {activeTab === 'early' && (
        <EarlyDetectionTab epamData={epamData} stereoData={stereoData} cmes={cmes} />
      )}

      {activeTab === 'queue' && (
        <CMEQueueTab cmes={cmes} positions={positions} />
      )}

      {activeTab === 'classification' && (
        <CMEClassificationTab
          cmes={cmes}
          classifications={classifications}
          classificationMetadata={classificationMetadata}
          magData={magData}
          stereoData={stereoData}
        />
      )}
    </div>
  );
}
