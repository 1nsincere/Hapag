'use client'

/**
 * Draws one floor: room features underneath, tables on top.
 * Everything is positioned in floor units and rendered as percentages, so the
 * plan scales to any screen. Fonts use container-query units for the same reason.
 */

import type { CSSProperties, PointerEvent as ReactPointerEvent, Ref } from 'react'
import type { FloorElement, TableShape, TableStatus } from '@/lib/data'
import { ELEMENT_META, GRID } from './shared'

export type CanvasSelection = { kind: 'table' | 'element'; id: string } | null
export type DragHandle = 'move' | 'resize'

export interface CanvasTable {
  id: string
  tableNumber: number
  name: string
  capacity: number
  status: TableStatus
  x: number
  y: number
  w: number
  h: number
  rotation: number
  shape: TableShape
  note?: string // small line under the number, e.g. "12m"
}

interface Props {
  width: number
  height: number
  elements: FloorElement[]
  tables: CanvasTable[]
  mode: 'view' | 'edit'
  selection?: CanvasSelection
  showGrid?: boolean
  ref?: Ref<HTMLDivElement>
  onItemPointerDown?: (e: ReactPointerEvent, kind: 'table' | 'element', id: string, handle: DragHandle) => void
  onTableClick?: (id: string) => void
  onBackgroundPointerDown?: () => void
}

const STATUS_STYLE: Record<TableStatus, { fill: string; border: string; text: string; chair: string }> = {
  available: { fill: '#ecfdf5', border: '#10b981', text: '#065f46', chair: '#a7f3d0' },
  occupied:  { fill: '#fef2f2', border: '#ef4444', text: '#991b1b', chair: '#fecaca' },
  reserved:  { fill: '#eff6ff', border: '#3b82f6', text: '#1e40af', chair: '#bfdbfe' },
}
const EDIT_STYLE = { fill: '#ffffff', border: '#78716c', text: '#292524', chair: '#d6d3d1' }

export default function FloorCanvas({
  width, height, elements, tables, mode, selection, showGrid = false, ref,
  onItemPointerDown, onTableClick, onBackgroundPointerDown,
}: Props) {
  // 1 floor unit expressed in container-query width units
  const u = (n: number) => `${(n / width) * 100}cqw`
  const pct = (x: number, y: number, w: number, h: number): CSSProperties => ({
    position: 'absolute',
    left: `${(x / width) * 100}%`,
    top: `${(y / height) * 100}%`,
    width: `${(w / width) * 100}%`,
    height: `${(h / height) * 100}%`,
  })
  const editing = mode === 'edit'
  const isSel = (kind: 'table' | 'element', id: string) => selection?.kind === kind && selection.id === id

  const sortedElements = [...elements].sort((a, b) => ELEMENT_META[a.type].layer - ELEMENT_META[b.type].layer)

  return (
    <div
      ref={ref}
      className="relative w-full select-none overflow-hidden rounded-2xl border border-stone-200"
      style={{
        aspectRatio: `${width} / ${height}`,
        containerType: 'inline-size',
        background: '#fafaf9',
        backgroundImage: showGrid
          ? 'linear-gradient(to right, rgba(120,113,108,.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(120,113,108,.10) 1px, transparent 1px)'
          : undefined,
        backgroundSize: showGrid ? `${(GRID / width) * 100}% ${(GRID / height) * 100}%` : undefined,
        touchAction: editing ? 'none' : 'manipulation',
      }}
      onPointerDown={e => { if (e.target === e.currentTarget) onBackgroundPointerDown?.() }}
    >
      {/* ── Room features ── */}
      {sortedElements.map(el => {
        const meta = ELEMENT_META[el.type]
        const selected = editing && isSel('element', el.id)
        return (
          <div
            key={el.id}
            style={{
              ...pct(el.x, el.y, el.w, el.h),
              transform: `rotate(${el.rotation ?? 0}deg)`,
              cursor: editing ? 'move' : 'default',
              pointerEvents: editing ? 'auto' : 'none',
              zIndex: 1 + meta.layer,
            }}
            onPointerDown={editing ? e => { e.stopPropagation(); onItemPointerDown?.(e, 'element', el.id, 'move') } : undefined}
          >
            <ElementShape el={el} u={u} />
            {selected && <SelectionFrame onResize={e => { e.stopPropagation(); onItemPointerDown?.(e, 'element', el.id, 'resize') }} />}
          </div>
        )
      })}

      {/* ── Tables ── */}
      {tables.map(t => {
        const style = editing ? EDIT_STYLE : STATUS_STYLE[t.status]
        const selected = isSel('table', t.id)
        const round = t.shape === 'round'
        return (
          <div
            key={t.id}
            style={{
              ...pct(t.x, t.y, t.w, t.h),
              transform: `rotate(${t.rotation}deg)`,
              zIndex: 20,
              cursor: editing ? 'move' : 'pointer',
            }}
            onPointerDown={editing ? e => { e.stopPropagation(); onItemPointerDown?.(e, 'table', t.id, 'move') } : undefined}
            onClick={!editing ? () => onTableClick?.(t.id) : undefined}
            role={!editing ? 'button' : undefined}
            aria-label={`Table ${t.tableNumber}, ${t.capacity} seats, ${t.status}`}
          >
            <Chairs table={t} color={style.chair} u={u} />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: round ? '9999px' : u(14),
                background: style.fill,
                border: `${u(3)} solid ${style.border}`,
                boxShadow: selected
                  ? `0 0 0 ${u(5)} rgba(198,79,0,.35), 0 ${u(6)} ${u(18)} rgba(0,0,0,.12)`
                  : `0 ${u(3)} ${u(10)} rgba(0,0,0,.08)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Counter-rotate so the number always reads upright */}
              <div style={{ transform: `rotate(${-t.rotation}deg)`, textAlign: 'center', lineHeight: 1.05, color: style.text }}>
                <div style={{ fontWeight: 800, fontSize: u(Math.min(34, Math.max(20, t.h * 0.3))) }}>{t.tableNumber}</div>
                <div style={{ fontWeight: 600, fontSize: u(13), opacity: 0.75 }}>
                  {t.note ?? `${t.capacity} seats`}
                </div>
              </div>
            </div>
            {selected && editing && t.shape !== 'round' && (
              <SelectionFrame onResize={e => { e.stopPropagation(); onItemPointerDown?.(e, 'table', t.id, 'resize') }} tight />
            )}
            {selected && editing && t.shape === 'round' && (
              <SelectionFrame onResize={e => { e.stopPropagation(); onItemPointerDown?.(e, 'table', t.id, 'resize') }} tight round />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Chairs around a table (rotate with it) ───────────────────────────────────
function Chairs({ table, color, u }: { table: CanvasTable; color: string; u: (n: number) => string }) {
  const n = Math.max(0, Math.min(table.capacity, 16))
  const chair = 22
  const gap = 6
  const pts: { left: string; top: string }[] = []

  if (table.shape === 'round') {
    const rx = table.w / 2 + gap + chair / 2
    const ry = table.h / 2 + gap + chair / 2
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2
      const cx = table.w / 2 + Math.cos(a) * rx
      const cy = table.h / 2 + Math.sin(a) * ry
      pts.push({ left: `${((cx - chair / 2) / table.w) * 100}%`, top: `${((cy - chair / 2) / table.h) * 100}%` })
    }
  } else {
    const top = Math.ceil(n / 2)
    const bottom = n - top
    const row = (count: number, y: number) => {
      for (let i = 0; i < count; i++) {
        const cx = (table.w / (count + 1)) * (i + 1)
        pts.push({ left: `${((cx - chair / 2) / table.w) * 100}%`, top: `${(y / table.h) * 100}%` })
      }
    }
    row(top, -gap - chair)
    row(bottom, table.h + gap)
  }

  return (
    <>
      {pts.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: p.left,
            top: p.top,
            width: `${(chair / table.w) * 100}%`,
            height: `${(chair / table.h) * 100}%`,
            borderRadius: u(7),
            background: color,
          }}
        />
      ))}
    </>
  )
}

// ── Room feature visuals ─────────────────────────────────────────────────────
function ElementShape({ el, u }: { el: FloorElement; u: (n: number) => string }) {
  const meta = ELEMENT_META[el.type]
  const label = el.label ?? meta.defaultLabel ?? ''
  const base: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: u(6),
    overflow: 'hidden',
  }
  const text = (color: string, size = 16): CSSProperties => ({
    transform: `rotate(${-(el.rotation ?? 0)}deg)`,
    color,
    fontSize: u(size),
    fontWeight: 700,
    letterSpacing: '0.02em',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: u(6),
  })
  const icon = (size = 20) => (
    <span className="material-symbols-outlined" style={{ fontSize: u(size) }}>{meta.icon}</span>
  )

  switch (el.type) {
    case 'wall':
      return <div style={{ ...base, background: '#44403c', borderRadius: u(3) }} />
    case 'window':
      return (
        <div style={{
          ...base,
          background: 'repeating-linear-gradient(90deg, #bae6fd 0 12px, #e0f2fe 12px 16px)',
          border: `${u(2)} solid #7dd3fc`,
          borderRadius: u(2),
        }} />
      )
    case 'entrance':
      return (
        <div style={{ ...base, background: '#ecfdf5', border: `${u(3)} dashed #10b981`, borderRadius: u(8) }}>
          <span style={text('#047857', 14)}>{icon(18)}{label}</span>
        </div>
      )
    case 'bar':
      return (
        <div style={{ ...base, background: 'linear-gradient(180deg,#a16207,#854d0e)', borderRadius: u(12) }}>
          <span style={text('#fef3c7', 16)}>{icon(18)}{label}</span>
        </div>
      )
    case 'counter':
      return (
        <div style={{ ...base, background: '#fed7aa', border: `${u(3)} solid #fb923c`, borderRadius: u(10) }}>
          <span style={text('#9a3412', 15)}>{icon(18)}{label}</span>
        </div>
      )
    case 'kitchen':
      return (
        <div style={{
          ...base,
          background: 'repeating-linear-gradient(45deg,#e7e5e4 0 10px,#f5f5f4 10px 20px)',
          border: `${u(3)} solid #a8a29e`,
          borderRadius: u(10),
          flexDirection: 'column',
        }}>
          <span style={text('#57534e', 18)}>{icon(24)}{label}</span>
        </div>
      )
    case 'restroom':
      return (
        <div style={{ ...base, background: '#e0e7ff', border: `${u(3)} solid #818cf8`, borderRadius: u(10) }}>
          <span style={text('#3730a3', 15)}>{icon(20)}{label}</span>
        </div>
      )
    case 'stairs':
      return (
        <div style={{
          ...base,
          background: 'repeating-linear-gradient(0deg,#d6d3d1 0 3px,#f5f5f4 3px 18px)',
          border: `${u(3)} solid #a8a29e`,
          borderRadius: u(6),
        }}>
          <span style={{ ...text('#44403c', 14), background: 'rgba(250,250,249,.9)', padding: `${u(3)} ${u(8)}`, borderRadius: u(6) }}>
            {icon(18)}{label}
          </span>
        </div>
      )
    case 'plant':
      return (
        <div style={{ ...base, background: '#bbf7d0', border: `${u(2)} solid #4ade80`, borderRadius: '9999px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: u(Math.min(el.w, el.h) * 0.6), color: '#15803d' }}>potted_plant</span>
        </div>
      )
    case 'zone':
      return (
        <div style={{
          ...base,
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          padding: u(10),
          background: 'rgba(250,204,21,.07)',
          border: `${u(3)} dashed #d6a400`,
          borderRadius: u(16),
        }}>
          <span style={text('#a16207', 15)}>{label}</span>
        </div>
      )
    case 'label':
      return (
        <div style={base}>
          <span style={{ ...text('#57534e', Math.max(14, Math.min(40, el.h * 0.55))), fontWeight: 800 }}>{label}</span>
        </div>
      )
  }
}

// ── Selection outline + resize handle (fixed pixel size, easy to grab) ───────
function SelectionFrame({ onResize, tight = false, round = false }: {
  onResize: (e: ReactPointerEvent) => void
  tight?: boolean
  round?: boolean
}) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: tight ? -4 : -3,
          border: '2px solid #c64f00',
          borderRadius: round ? '9999px' : 6,
          pointerEvents: 'none',
        }}
      />
      <div
        onPointerDown={onResize}
        title="Drag to resize"
        style={{
          position: 'absolute',
          right: -9,
          bottom: -9,
          width: 16,
          height: 16,
          borderRadius: 4,
          background: '#c64f00',
          border: '2px solid #fff',
          boxShadow: '0 1px 4px rgba(0,0,0,.3)',
          cursor: 'nwse-resize',
          zIndex: 5,
        }}
      />
    </>
  )
}
