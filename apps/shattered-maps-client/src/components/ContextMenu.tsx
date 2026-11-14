import React from 'react'
import { createPortal } from 'react-dom'

export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

export default function ContextMenu({
  x, y, items, onClose,
}: {
  x: number; y: number
  items: MenuItem[]
  onClose: () => void
}) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = React.useState<{x:number; y:number}>({ x, y })

  // Clamp to viewport after mount so the menu doesn't overflow the screen edges
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const nx = Math.min(x, vw - rect.width - 8)
    const ny = Math.min(y, vh - rect.height - 8)
    setPos({ x: Math.max(0, nx), y: Math.max(0, ny) })
  }, [x, y])

  React.useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      // only close on left-click outside
      if (e.button !== 0) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const node = (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        background: '#1c1c1c',
        border: '1px solid #2a2a2a',
        borderRadius: 8,
        padding: 6,
        minWidth: 180,
        boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
      }}
      // keep right-clicks on the menu from bubbling or opening the browser menu
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((it, i) => (
        <button
          key={i}
          onClick={() => { it.onClick(); onClose() }}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '8px 10px',
            background: 'transparent',
            border: 'none',
            color: it.danger ? '#ff6b6b' : '#eee',
            borderRadius: 6,
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#2a2a2a')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {it.label}
        </button>
      ))}
    </div>
  )

  return createPortal(node, document.body)
}
