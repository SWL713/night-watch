import { useState, useEffect } from 'react';

/**
 * Custom hook to fetch and merge CME data from multiple sources
 * Merges cme_queue.json with cme_positions.json for complete data
 */
const MAG_BASE = 'https://raw.githubusercontent.com/SWL713/night-watch/main/data';

function parseMagData(raw) {
  if (!raw || !raw.columns || !raw.data) return [];

  const cols = raw.columns;
  const indices = {
    time: cols.indexOf('time'),
    bx: cols.indexOf('bx'),
    by: cols.indexOf('by'),
    bz: cols.indexOf('bz'),
    bt: cols.indexOf('bt'),
    phi: cols.indexOf('phi'),
  };

  if (indices.time === -1) return [];

  return raw.data.map(row => {
    try {
      const t = new Date(row[indices.time]);
      if (isNaN(t.getTime())) return null;

      return {
        time: t.getTime(),
        bx: indices.bx >= 0 ? row[indices.bx] : null,
        by: indices.by >= 0 ? row[indices.by] : null,
        bz: indices.bz >= 0 ? row[indices.bz] : null,
        bt: indices.bt >= 0 ? row[indices.bt] : null,
        phi: indices.phi >= 0 ? row[indices.phi] : null,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

export function useCMEData() {
  const [cmeQueue, setCmeQueue] = useState([]);
  const [cmePositions, setCmePositions] = useState({});
  const [cmeClassifications, setCmeClassifications] = useState({});
  const [classificationMetadata, setClassificationMetadata] = useState(null);
  const [magData, setMagData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch all four files in parallel
        const [queueRes, positionsRes, classificationsRes, magRes] = await Promise.all([
          fetch(`/night-watch/data/cme_queue.json?t=${Date.now()}`),
          fetch(`/night-watch/data/cme_positions.json?t=${Date.now()}`),
          fetch(`/night-watch/data/cme_classification.json?t=${Date.now()}`),
          fetch(`${MAG_BASE}/sw_mag_7day.json?t=${Date.now()}`)
        ]);

        if (!queueRes.ok) throw new Error('Failed to load CME queue');
        if (!positionsRes.ok) throw new Error('Failed to load CME positions');
        if (!classificationsRes.ok) throw new Error('Failed to load CME classifications');

        const queueData = await queueRes.json();
        const positionsData = await positionsRes.json();
        const classificationsData = await classificationsRes.json();

        // Parse mag data (soft-fail: don't break if mag is unavailable)
        if (magRes.ok) {
          const magJson = await magRes.json();
          setMagData(parseMagData(magJson));
        }

        // Merge queue with positions data
        const mergedCMEs = queueData.cmes.map(cme => {
          // Find matching position data
          const positionData = positionsData.cmes?.find(p => p.id === cme.id);
          
          return {
            ...cme,
            // Merge position data (use real-time positions, not queue's stale data)
            position: positionData ? {
              distance_au: positionData.position.distance_au,
              distance_rsun: positionData.position.distance_rsun,
              velocity_current: positionData.position.velocity_current,
              progress_percent: positionData.progress.percent_to_l1,
              eta_hours: positionData.progress.eta_hours,
              eta_timestamp: positionData.progress.eta_timestamp
            } : cme.position
          };
        });

        setCmeQueue(mergedCMEs);
        
        // Store positions map for visualization
        const positionsMap = {};
        positionsData.cmes?.forEach(cme => {
          positionsMap[cme.id] = cme;
        });
        setCmePositions(positionsMap);
        
        setCmeClassifications(classificationsData.classifications || {});
        setClassificationMetadata(classificationsData.metadata || null);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching CME data:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchData();
    
    // Poll every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  return {
    cmes: cmeQueue,
    positions: cmePositions,
    classifications: cmeClassifications,
    classificationMetadata,
    magData,
    loading,
    error
  };
}

export default useCMEData;
