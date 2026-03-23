const FONT = 'DejaVu Sans Mono, Consolas, monospace'

// Heatmap modes are mutually exclusive — only one can be active
// Ovation, Pins are independent toggles
const HEATMAP_MODES = ['heatmap', 'clouds', 'bortle']

export default function LayerControls({ layers, onToggle, enlilActive }) {
  const LAYER_DEFS = [
    { key: 'heatmap', label: 'Combined',    group: 'heatmap' },
    { key: 'clouds',  label: 'Clouds only', group: 'heatmap' },
    { key: 'bortle',  label: 'Bortle only', group: 'heatmap' },
    { key: 'ovation', label: 'Aurora Oval', group: 'toggle' },
    { key: 'pins',    label: 'Locations',   group: 'toggle' },
    ...(enlilActive ? [{ key: 'enlil', label: 'ENLIL', group: 'toggle' }] : []),
  ]

  return (
    <div style={{
      position: 'absolute', bottom: 48, left: 10, zIndex: 1000,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      {/* Heatmap mode label */}
      <div style={{ color: '#223344', fontSize: 8, letterSpacing: 1, paddingLeft: 2, marginBottom: 1 }}>
        HEATMAP MODE
      </div>

      {LAYER_DEFS.map(({ key, label, group }, i) => {
        const active = layers[key]
        const isGroupSeparator = i > 0 && group !== LAYER_DEFS[i-1].group

        return (
          <div key={key}>
            {isGroupSeparator && (
              <div style={{ height: 6 }} />
            )}
            <button
              onClick={() => onToggle(key)}
              style={{
                display: 'block',
                background: active ? '#0d1a2a' : '#060810',
                border: `1px solid ${active ? '#44ddaa' : '#1a2a3a'}`,
                color: active ? '#44ddaa' : '#334455',
                padding: '5px 10px', fontSize: 10,
                fontFamily: FONT, cursor: 'pointer', letterSpacing: 1,
                borderRadius: 2, textAlign: 'left', minWidth: 110,
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
    heatmap: true,   // Combined heatmap on by default
    clouds: false,
    bortle: false,
    ovation: true,
    pins: true,
    enlil: false,
  }
}
