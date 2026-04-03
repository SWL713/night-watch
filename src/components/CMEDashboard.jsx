/**
 * CME Dashboard - Main Component
 * Minimal MVP version - displays CME data in clean format
 * Can be enhanced to full two-tab UI later
 */

import { useState } from 'react'
import { useCMEData } from '../hooks/useCMEData.js'

const FONT = 'DejaVu Sans Mono, Consolas, monospace'

export default function CMEDashboard() {
  const { queue, classification, positions, loading, error } = useCMEData(true)

  if (loading) {
    return (
      <div style={{
        flex: 1, background: '#06080f', display: 'flex',
        alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ color: '#44ddaa', fontFamily: FONT, fontSize: 11 }}>
          LOADING CME DATA...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        flex: 1, background: '#06080f', display: 'flex',
        alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ color: '#ff5566', fontFamily: FONT, fontSize: 11, textAlign: 'center' }}>
          ERROR LOADING CME DATA<br/><br/>
          <span style={{ fontSize: 9, color: '#667788' }}>{error}</span>
        </div>
      </div>
    )
  }

  if (!queue || !queue.cmes || queue.cmes.length === 0) {
    return (
      <div style={{
        flex: 1, background: '#06080f', display: 'flex',
        alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{
          border: '1px solid #334455',
          padding: '24px 32px',
          fontFamily: FONT,
          color: '#667788',
          fontSize: 11,
          letterSpacing: 1,
          textAlign: 'center',
          borderRadius: 2
        }}>
          NO ACTIVE CMEs DETECTED<br/><br/>
          <span style={{ fontSize: 9 }}>
            Pipeline is monitoring CCMC scoreboard
          </span>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      flex: 1,
      background: '#06080f',
      overflowY: 'auto',
      padding: '20px',
      fontFamily: FONT
    }}>
      {/* Header */}
      <div style={{
        borderBottom: '1px solid #1a2a3a',
        paddingBottom: 12,
        marginBottom: 20
      }}>
        <div style={{ color: '#44ddaa', fontSize: 13, fontWeight: 'bold', letterSpacing: 1 }}>
          CME DASHBOARD
        </div>
        <div style={{ color: '#667788', fontSize: 9, marginTop: 4 }}>
          {queue.cmes.length} active CME{queue.cmes.length !== 1 ? 's' : ''} tracked
          {queue.metadata?.last_updated && (
            <> • Updated {new Date(queue.metadata.last_updated).toUTCString().slice(17, 22)} UTC</>
          )}
        </div>
      </div>

      {/* Active CMEs List */}
      <div style={{ marginBottom: 30 }}>
        {queue.cmes.map((cme, idx) => (
          <CMECard
            key={cme.id}
            cme={cme}
            number={idx + 1}
            isActive={cme.id === queue.active_cme_id}
          />
        ))}
      </div>

      {/* Classification Section (if active CME classified) */}
      {classification && queue.active_cme_id && classification.classifications[queue.active_cme_id] && (
        <div style={{ marginTop: 30 }}>
          <div style={{
            color: '#88bbdd',
            fontSize: 11,
            fontWeight: 'bold',
            marginBottom: 12,
            letterSpacing: 1
          }}>
            ACTIVE CME CLASSIFICATION
          </div>
          <ClassificationCard
            classification={classification.classifications[queue.active_cme_id]}
          />
        </div>
      )}
    </div>
  )
}

function CMECard({ cme, number, isActive }) {
  const stateColors = {
    'QUIET': '#445566',
    'WATCH': '#06B6D4',
    'INBOUND': '#FBBF24',
    'IMMINENT': '#F59E0B',
    'ARRIVED': '#DC2626',
    'STORM_ACTIVE': '#DC2626',
    'SUBSIDING': '#6B7280'
  }

  const color = stateColors[cme.state.current] || '#667788'

  return (
    <div style={{
      background: isActive ? '#0d1a2a' : '#060810',
      border: `1px solid ${isActive ? '#44ddaa' : '#1a2a3a'}`,
      borderRadius: 4,
      padding: 15,
      marginBottom: 12
    }}>
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            background: color,
            color: '#fff',
            width: 24,
            height: 24,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 'bold'
          }}>
            {number}
          </div>
          <div style={{ color: '#44ddaa', fontSize: 11, fontWeight: 'bold' }}>
            {cme.id}
          </div>
        </div>
        <div style={{
          background: color,
          color: '#fff',
          padding: '4px 10px',
          fontSize: 9,
          borderRadius: 2,
          letterSpacing: 0.5
        }}>
          {cme.state.current}
        </div>
      </div>

      {/* Details Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 8,
        fontSize: 9,
        color: '#88aacc'
      }}>
        <div>
          <span style={{ color: '#556677' }}>Speed:</span> {cme.properties.speed_current} km/s
        </div>
        <div>
          <span style={{ color: '#556677' }}>Type:</span> {cme.properties.type || 'Unknown'}
        </div>
        {cme.position.eta_hours != null && (
          <div>
            <span style={{ color: '#556677' }}>ETA:</span> {cme.position.eta_hours.toFixed(1)}h
          </div>
        )}
        {cme.position.progress_percent != null && (
          <div>
            <span style={{ color: '#556677' }}>Progress:</span> {cme.position.progress_percent.toFixed(0)}%
          </div>
        )}
        {cme.arrival?.average_prediction && (
          <div style={{ gridColumn: '1 / -1' }}>
            <span style={{ color: '#556677' }}>Avg Arrival:</span> {new Date(cme.arrival.average_prediction * 1000).toUTCString()}
          </div>
        )}
      </div>

      {/* Launch Info */}
      {cme.source.launch_time && (
        <div style={{ fontSize: 8, color: '#556677', marginTop: 8, paddingTop: 8, borderTop: '1px solid #1a2a3a' }}>
          Launched: {new Date(cme.source.launch_time).toUTCString()}
        </div>
      )}
    </div>
  )
}

function ClassificationCard({ classification }) {
  if (!classification.active || !classification.current) {
    return (
      <div style={{ color: '#667788', fontSize: 9, fontStyle: 'italic' }}>
        Classification pending...
      </div>
    )
  }

  const auroraColors = {
    'EXCELLENT': '#44ff88',
    'GOOD': '#88dd44',
    'MODERATE': '#ffaa33',
    'POOR': '#ff6644',
    'NONE': '#667788'
  }

  const bz = classification.bz_predictions
  const auroraColor = auroraColors[bz?.aurora_potential] || '#88aacc'

  return (
    <div style={{
      background: '#0d1a2a',
      border: '1px solid #1a3a4a',
      borderRadius: 4,
      padding: 15
    }}>
      {/* Type */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#667788', fontSize: 8, marginBottom: 4 }}>BS TYPE</div>
        <div style={{ color: '#44ddaa', fontSize: 12, fontWeight: 'bold' }}>
          {classification.current.bs_type_full || classification.current.bs_type}
        </div>
        <div style={{ color: '#88aacc', fontSize: 9, marginTop: 4 }}>
          Confidence: {classification.current.confidence}%
        </div>
      </div>

      {/* Aurora Prediction */}
      {bz && (
        <div style={{
          background: '#060810',
          border: `1px solid ${auroraColor}40`,
          borderRadius: 4,
          padding: 12,
          marginTop: 12
        }}>
          <div style={{
            color: auroraColor,
            fontSize: 11,
            fontWeight: 'bold',
            marginBottom: 8
          }}>
            AURORA POTENTIAL: {bz.aurora_potential}
          </div>
          <div style={{ fontSize: 9, color: '#88aacc', marginBottom: 6 }}>
            {bz.description}
          </div>
          {bz.kp_estimate && bz.kp_estimate !== 'N/A' && (
            <div style={{ fontSize: 9, color: '#667788' }}>
              Estimated Kp: {bz.kp_estimate}
            </div>
          )}
        </div>
      )}

      {/* Signatures */}
      {classification.signatures && (
        <div style={{ marginTop: 12, fontSize: 8, color: '#667788' }}>
          {classification.signatures.temperature_ratio != null && (
            <div>Temp Ratio: {classification.signatures.temperature_ratio.toFixed(2)}</div>
          )}
          {classification.signatures.field_enhancement != null && (
            <div>Field Enhancement: {classification.signatures.field_enhancement.toFixed(2)}x</div>
          )}
        </div>
      )}
    </div>
  )
}
