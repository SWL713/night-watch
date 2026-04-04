const FONT = 'DejaVu Sans Mono, Consolas, monospace'

const LAYER_DEFS = [
  { key: 'clouds',    label: 'Clouds',    helpKey: 'layer_clouds' },
  { key: 'bortle',    label: 'LP',        helpKey: 'layer_bortle' },
  { key: 'ovation',   label: 'Ovation',   helpKey: 'layer_ovation' },
  { key: 'pins',      label: 'Locations', helpKey: 'layer_pins' },
  { key: 'cameras',   label: 'Live Cams', helpKey: 'layer_cameras',  accent: '#44aaff' },
  { key: 'sightings', label: 'Active Hunt', helpKey: 'layer_sightings', accent: '#ff8800' },
]

export default function LayerControls({ layers, onToggle, helpMode, onHelpTap }) {
  return (
    <div style={{
      position: 'absolute', bottom: 10, left: 10, zIndex: 1000,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ color: '#223344', fontSize: 8, letterSpacing: 1, paddingLeft: 2, marginBottom: 1 }}>
        HEATMAP MODE
      </div>

      {LAYER_DEFS.map(({ key, label, helpKey, accent }, i) => {
        const active = layers[key]
        const prevGroup = i > 0 && (key === 'cameras') // separator before cameras
        return (
          <div key={key}>
            {prevGroup && <div style={{ height: 6 }} />}
            <button
              onClick={() => helpMode ? onHelpTap(helpKey) : onToggle(key)}
              style={{
                display: 'block',
                background: active ? (accent ? '#1a0d00' : '#0d1a2a') : '#060810',
                border: `1px solid ${helpMode ? '#44ddaa44' : active ? (accent || '#44ddaa') : '#1a2a3a'}`,
                color: active ? (accent || '#44ddaa') : '#334455',
                padding: '5px 7px', fontSize: 10,
                fontFamily: FONT, cursor: 'pointer', letterSpacing: 0.5,
                borderRadius: 2, textAlign: 'left', minWidth: 82,
                transition: 'all 0.15s', width: '100%',
              }}
            >
              {active ? '● ' : '○ '}{label}
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function initLayers() {
  return {
    clouds:    false,
    bortle:    false,
    ovation:   true,
    pins:      true,
    sightings: true,
    cameras:   false,
  }
}
