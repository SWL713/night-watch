import { useState, useEffect } from 'react';

/**
 * Custom hook to fetch and merge CME data from multiple sources
 * Merges cme_queue.json with cme_positions.json for complete data
 */
export function useCMEData() {
  const [cmeQueue, setCmeQueue] = useState([]);
  const [cmePositions, setCmePositions] = useState({});
  const [cmeClassifications, setCmeClassifications] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch all three files in parallel
        const [queueRes, positionsRes, classificationsRes] = await Promise.all([
          fetch(`/night-watch/data/cme_queue.json?t=${Date.now()}`),
          fetch(`/night-watch/data/cme_positions.json?t=${Date.now()}`),
          fetch(`/night-watch/data/cme_classification.json?t=${Date.now()}`)
        ]);

        if (!queueRes.ok) throw new Error('Failed to load CME queue');
        if (!positionsRes.ok) throw new Error('Failed to load CME positions');
        if (!classificationsRes.ok) throw new Error('Failed to load CME classifications');

        const queueData = await queueRes.json();
        const positionsData = await positionsRes.json();
        const classificationsData = await classificationsRes.json();

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
    loading,
    error
  };
}
