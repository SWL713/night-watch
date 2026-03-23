const FONT = 'DejaVu Sans Mono, Consolas, monospace'

const LAYERS = [
  { key: 'heatmap',  label: 'Combined',   default: true },
  { key: 'clouds',   label: 'Clouds',     default: false },
  { key: 'bortle',   label: 'Bortle',     default: false },
  { key: 'ovation',  label: 'Aurora Oval',default: true },
  { key: 'pins',     label: 'Spots',      default: true },
  { key: 'enlil',    label: 'ENLIL',      default: false, conditional: true },
]

export default function LayerControls({ layers, onToggle, enlilActive }) {
  return (
    <div style={{
      position: 'absolute', bottom: 48, left: 10, zIndex: 1000,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      {LAYERS.map(({ key, label, conditional }) => {
        if (conditional && !enlilActive) return null
        const active = layers[key]
        return (
          <button
            key={key}
            onClick={() => onToggle(key)}
            style={{
              background: active ? '#0d1a2a' : '#060810',
              border: `1px solid ${active ? '#44ddaa' : '#1a2a3a'}`,
              color: active ? '#44ddaa' : '#334455',
              padding: '5px 10px', fontSize: 10,
              fontFamily: FONT, cursor: 'pointer', letterSpacing: 1,
              borderRadius: 2, textAlign: 'left', minWidth: 100,
              transition: 'all 0.15s',
            }}
          >
            {active ? '● ' : '○ '}{label}
          </button>
        )
      })}
    </div>
  )
}

export function initLayers() {
  return Object.fromEntries(LAYERS.map(l => [l.key, l.default]))
}
