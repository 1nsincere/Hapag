'use client'

/**
 * Admin floor plan editor.
 *  - Multiple floors (add / rename / resize / reorder / delete)
 *  - Drag tables & room features, resize from the corner handle, rotate
 *  - Shapes: round / square / long; seat count; move between floors
 *  - Snap to grid, undo / redo, keyboard nudging, auto-arrange
 * Edits stay in a local draft until "Save layout" writes everything atomically.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  listenToFloors, createFloor, deleteFloor, saveFloorPlan,
  type Floor, type FloorElement, type FloorElementType, type Table, type TableLayout,
} from '@/lib/data'
import FloorCanvas, { type CanvasSelection, type CanvasTable, type DragHandle } from '@/app/components/floorplan/FloorCanvas'
import {
  DEFAULT_FLOOR, ELEMENT_META, FLOOR_PRESETS, GRID, PALETTE_ORDER, SHAPES,
  clamp, defaultTableSize, normRotation, resolveLayout, snap, uid,
} from '@/app/components/floorplan/shared'

type Layout = ReturnType<typeof resolveLayout>
type FloorDraft = Pick<Floor, 'id' | 'name' | 'order' | 'width' | 'height' | 'elements'>
interface Draft { floors: FloorDraft[]; layouts: Record<string, Layout> }

const toFloorDraft = (f: Floor): FloorDraft => ({ id: f.id, name: f.name, order: f.order, width: f.width, height: f.height, elements: f.elements ?? [] })
const sameJSON = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function starterElements(width: number, height: number): FloorElement[] {
  const t = 16
  return [
    { id: uid(), type: 'wall', x: 0, y: 0, w: width, h: t },
    { id: uid(), type: 'wall', x: 0, y: height - t, w: width * 0.4, h: t },
    { id: uid(), type: 'wall', x: width * 0.4 + 160, y: height - t, w: width * 0.6 - 160, h: t },
    { id: uid(), type: 'wall', x: 0, y: 0, w: t, h: height },
    { id: uid(), type: 'wall', x: width - t, y: 0, w: t, h: height },
    { id: uid(), type: 'entrance', x: width * 0.4 + 20, y: height - 50, w: 120, h: 40, label: 'Entrance' },
  ]
}

export default function FloorPlanEditor({ tables }: { tables: Table[] }) {
  const [remoteFloors, setRemoteFloors] = useState<Floor[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null)
  const [selection, setSelection] = useState<CanvasSelection>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [snapOn, setSnapOn] = useState(true)
  const [zoom, setZoom] = useState(100)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [busy, setBusy] = useState(false)
  const [newFloorName, setNewFloorName] = useState('')
  const [addingFloor, setAddingFloor] = useState(false)
  const [confirmDeleteFloor, setConfirmDeleteFloor] = useState(false)

  const canvasRef = useRef<HTMLDivElement>(null)
  const past = useRef<Draft[]>([])
  const future = useRef<Draft[]>([])
  const [hist, setHist] = useState({ past: 0, future: 0 })
  const syncHistory = () => setHist({ past: past.current.length, future: future.current.length })

  const [loadError, setLoadError] = useState(false)
  useEffect(() => listenToFloors(f => { setRemoteFloors(f); setLoadError(false) }, () => setLoadError(true)), [])

  // ── Current state = local draft (if editing) merged over live data ────────
  const base: Draft = useMemo(() => ({
    floors: (remoteFloors ?? []).map(toFloorDraft),
    layouts: Object.fromEntries(tables.map(t => [t.id, resolveLayout(t)])),
  }), [remoteFloors, tables])

  const current: Draft = useMemo(() => {
    if (!draft) return base
    const ids = new Set(draft.floors.map(f => f.id))
    return {
      // floors/tables created elsewhere while editing still show up
      floors: [...draft.floors, ...base.floors.filter(f => !ids.has(f.id))],
      layouts: { ...base.layouts, ...draft.layouts },
    }
  }, [draft, base])

  // Only "unsaved" if the draft actually differs from what's in the database
  const dirty = useMemo(() => draft !== null && !sameJSON(current, base), [draft, current, base])

  const floors = useMemo(() => [...current.floors].sort((a, b) => a.order - b.order), [current.floors])
  const floor = floors.find(f => f.id === activeFloorId) ?? floors[0] ?? null
  const floorIds = useMemo(() => new Set(floors.map(f => f.id)), [floors])

  const tableById = useMemo(() => Object.fromEntries(tables.map(t => [t.id, t])), [tables])
  const layoutOf = useCallback((id: string) => current.layouts[id] ?? resolveLayout(tableById[id]), [current.layouts, tableById])

  const tablesOnFloor = floor ? tables.filter(t => layoutOf(t.id).floorId === floor.id) : []
  const unplaced = tables
    .filter(t => { const f = layoutOf(t.id).floorId; return !f || !floorIds.has(f) })
    .sort((a, b) => a.tableNumber - b.tableNumber)

  // ── History-aware mutations ───────────────────────────────────────────────
  const commit = useCallback((next: Draft, record = true) => {
    if (record) {
      past.current = [...past.current.slice(-49), current]
      future.current = []
      syncHistory()
    }
    setDraft(next)
    setSaveState('idle')
  }, [current])

  /** Save an undo point without changing anything (e.g. before typing in a field) */
  const snapshot = () => {
    past.current = [...past.current.slice(-49), current]
    future.current = []
    syncHistory()
  }

  const updateFloor = (id: string, patch: Partial<FloorDraft>, record = true) =>
    commit({ ...current, floors: current.floors.map(f => f.id === id ? { ...f, ...patch } : f) }, record)

  const updateLayout = (id: string, patch: Partial<Layout>, record = true) =>
    commit({ ...current, layouts: { ...current.layouts, [id]: { ...layoutOf(id), ...patch } } }, record)

  const updateElement = (elId: string, patch: Partial<FloorElement>, record = true) => {
    if (!floor) return
    updateFloor(floor.id, { elements: floor.elements.map(e => e.id === elId ? { ...e, ...patch } : e) }, record)
  }

  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(current)
    setDraft(prev)
    syncHistory()
  }, [current])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(current)
    setDraft(next)
    syncHistory()
  }, [current])

  const discard = () => {
    setDraft(null)
    past.current = []
    future.current = []
    syncHistory()
    setSelection(null)
    setSaveState('idle')
  }

  // ── Placement helpers ─────────────────────────────────────────────────────
  /** Finds a free grid spot on the floor for a w×h item. */
  const findSpot = useCallback((f: FloorDraft, w: number, h: number, taken: { x: number; y: number; w: number; h: number }[]) => {
    const margin = 60
    for (let y = margin; y + h <= f.height - margin / 2; y += GRID * 2) {
      for (let x = margin; x + w <= f.width - margin / 2; x += GRID * 2) {
        const hit = taken.some(r => x < r.x + r.w + 50 && x + w + 50 > r.x && y < r.y + r.h + 50 && y + h + 50 > r.y)
        if (!hit) return { x, y }
      }
    }
    return { x: snap(f.width / 2 - w / 2, true), y: snap(f.height / 2 - h / 2, true) }
  }, [])

  const occupiedRects = (f: FloorDraft, layouts: Record<string, Layout>) =>
    tables.filter(t => (layouts[t.id] ?? resolveLayout(t)).floorId === f.id).map(t => {
      const l = layouts[t.id] ?? resolveLayout(t)
      return { x: l.positionX, y: l.positionY, w: l.width, h: l.height }
    })

  const placeTable = (tableId: string) => {
    if (!floor) return
    const l = layoutOf(tableId)
    const spot = findSpot(floor, l.width, l.height, occupiedRects(floor, current.layouts))
    updateLayout(tableId, { floorId: floor.id, positionX: spot.x, positionY: spot.y })
    setSelection({ kind: 'table', id: tableId })
  }

  const autoArrange = () => {
    if (!floor || unplaced.length === 0) return
    const layouts = { ...current.layouts }
    for (const t of unplaced) {
      const l = layouts[t.id] ?? resolveLayout(t)
      const spot = findSpot(floor, l.width, l.height, occupiedRects(floor, layouts))
      layouts[t.id] = { ...l, floorId: floor.id, positionX: spot.x, positionY: spot.y }
    }
    commit({ ...current, layouts })
  }

  const addElement = (type: FloorElementType) => {
    if (!floor) return
    const meta = ELEMENT_META[type]
    const el: FloorElement = {
      id: uid(), type,
      x: snap(floor.width / 2 - meta.w / 2, true), y: snap(floor.height / 2 - meta.h / 2, true),
      w: meta.w, h: meta.h, rotation: 0,
      ...(meta.defaultLabel ? { label: meta.defaultLabel } : {}),
    }
    updateFloor(floor.id, { elements: [...floor.elements, el] })
    setSelection({ kind: 'element', id: el.id })
  }

  const removeSelected = useCallback(() => {
    if (!selection || !floor) return
    if (selection.kind === 'element') {
      updateFloor(floor.id, { elements: floor.elements.filter(e => e.id !== selection.id) })
    } else {
      updateLayout(selection.id, { floorId: null })
    }
    setSelection(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, floor, current])

  const duplicateSelected = useCallback(() => {
    if (!floor || selection?.kind !== 'element') return
    const src = floor.elements.find(e => e.id === selection.id)
    if (!src) return
    const copy = { ...src, id: uid(), x: clamp(src.x + GRID * 2, 0, floor.width - src.w), y: clamp(src.y + GRID * 2, 0, floor.height - src.h) }
    updateFloor(floor.id, { elements: [...floor.elements, copy] })
    setSelection({ kind: 'element', id: copy.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, floor, current])

  const nudge = useCallback((dx: number, dy: number) => {
    if (!selection || !floor) return
    if (selection.kind === 'element') {
      const el = floor.elements.find(e => e.id === selection.id)
      if (el) updateElement(el.id, { x: clamp(el.x + dx, 0, floor.width - el.w), y: clamp(el.y + dy, 0, floor.height - el.h) })
    } else {
      const l = layoutOf(selection.id)
      updateLayout(selection.id, { positionX: clamp(l.positionX + dx, 0, floor.width - l.width), positionY: clamp(l.positionY + dy, 0, floor.height - l.height) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, floor, current])

  const rotateSelected = useCallback((by: number) => {
    if (!selection || !floor) return
    if (selection.kind === 'element') {
      const el = floor.elements.find(e => e.id === selection.id)
      if (el) updateElement(el.id, { rotation: normRotation((el.rotation ?? 0) + by) })
    } else {
      updateLayout(selection.id, { rotation: normRotation(layoutOf(selection.id).rotation + by) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, floor, current])

  // ── Dragging (move / resize) ──────────────────────────────────────────────
  const onItemPointerDown = (e: ReactPointerEvent, kind: 'table' | 'element', id: string, handle: DragHandle) => {
    if (!floor || e.button !== 0) return
    e.preventDefault()
    setSelection({ kind, id })
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const scale = floor.width / rect.width // floor units per screen pixel
    const startX = e.clientX
    const startY = e.clientY
    const el = kind === 'element' ? floor.elements.find(x => x.id === id) : null
    const l = kind === 'table' ? layoutOf(id) : null
    const orig = el
      ? { x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rotation ?? 0 }
      : { x: l!.positionX, y: l!.positionY, w: l!.width, h: l!.height, rot: l!.rotation }
    const round = l?.shape === 'round'
    const startDraft = current
    let recorded = false

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) * scale
      const dy = (ev.clientY - startY) * scale
      if (!recorded && Math.hypot(dx, dy) < 3) return
      if (!recorded) {
        past.current = [...past.current.slice(-49), startDraft]
        future.current = []
        recorded = true
      }
      let patch: { x: number; y: number; w: number; h: number }
      if (handle === 'move') {
        patch = {
          x: clamp(snap(orig.x + dx, snapOn), 0, floor.width - orig.w),
          y: clamp(snap(orig.y + dy, snapOn), 0, floor.height - orig.h),
          w: orig.w, h: orig.h,
        }
      } else {
        // Resize along the item's own (rotated) axes
        const r = (orig.rot * Math.PI) / 180
        const ldx = dx * Math.cos(r) + dy * Math.sin(r)
        const ldy = -dx * Math.sin(r) + dy * Math.cos(r)
        const min = kind === 'table' ? 60 : 10
        let w = Math.max(min, snap(orig.w + ldx, snapOn))
        let h = Math.max(min, snap(orig.h + ldy, snapOn))
        if (round) { const d = Math.max(w, h); w = d; h = d }
        w = Math.min(w, floor.width - orig.x)
        h = Math.min(h, floor.height - orig.y)
        patch = { x: orig.x, y: orig.y, w, h }
      }
      setDraft(prev => {
        const cur = prev ?? startDraft
        if (kind === 'element') {
          return {
            ...cur,
            floors: cur.floors.map(f => f.id !== floor.id ? f : {
              ...f, elements: f.elements.map(x => x.id === id ? { ...x, ...patch } : x),
            }),
          }
        }
        const prevLayout = cur.layouts[id] ?? l!
        return {
          ...cur,
          layouts: { ...cur.layouts, [id]: { ...prevLayout, positionX: patch.x, positionY: patch.y, width: patch.w, height: patch.h } },
        }
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (recorded) { syncHistory(); setSaveState('idle') }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return }
      if (!selection) return
      const step = e.altKey ? 1 : GRID
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-step, 0) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(step, 0) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, -step) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, step) }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected() }
      else if (e.key.toLowerCase() === 'r') { e.preventDefault(); rotateSelected(e.shiftKey ? -15 : 15) }
      else if (e.key === 'Escape') setSelection(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, undo, redo, nudge, removeSelected, rotateSelected, duplicateSelected])

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return
    const onBefore = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onBefore)
    return () => window.removeEventListener('beforeunload', onBefore)
  }, [dirty])

  // ── Persistence ───────────────────────────────────────────────────────────
  const save = async () => {
    if (!draft || !dirty) return
    setSaveState('saving')
    try {
      const changedFloors = current.floors.filter(f => {
        const remote = remoteFloors?.find(r => r.id === f.id)
        return remote && !sameJSON(toFloorDraft(remote), f)
      })
      const changedTables = tables
        .filter(t => !sameJSON(current.layouts[t.id] ?? resolveLayout(t), resolveLayout(t)))
        .map(t => {
          const l = current.layouts[t.id]
          const layout: TableLayout = {
            floorId: l.floorId, positionX: Math.round(l.positionX), positionY: Math.round(l.positionY),
            width: Math.round(l.width), height: Math.round(l.height), rotation: l.rotation, shape: l.shape, capacity: l.capacity,
          }
          return { id: t.id, layout }
        })
      await saveFloorPlan(changedFloors, changedTables)
      setDraft(null)
      past.current = []
      future.current = []
      syncHistory()
      setSaveState('saved')
      setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 2500)
    } catch (err) {
      console.error('[FloorPlan] save failed', err)
      setSaveState('error')
    }
  }

  const addFloor = async () => {
    const name = newFloorName.trim() || (floors.length === 0 ? 'Ground Floor' : `Floor ${floors.length + 1}`)
    setBusy(true)
    try {
      const size = floor ? { width: floor.width, height: floor.height } : DEFAULT_FLOOR
      const id = await createFloor({
        name, order: (floors.at(-1)?.order ?? -1) + 1, ...size,
        elements: starterElements(size.width, size.height),
      })
      setActiveFloorId(id)
      setNewFloorName('')
      setAddingFloor(false)
    } finally {
      setBusy(false)
    }
  }

  const removeFloor = async () => {
    if (!floor) return
    setBusy(true)
    try {
      await deleteFloor(floor.id, tablesOnFloor.map(t => t.id))
      setActiveFloorId(null)
      setSelection(null)
      setConfirmDeleteFloor(false)
    } finally {
      setBusy(false)
    }
  }

  const moveFloorOrder = (dir: -1 | 1) => {
    if (!floor) return
    const idx = floors.findIndex(f => f.id === floor.id)
    const other = floors[idx + dir]
    if (!other) return
    commit({
      ...current,
      floors: current.floors.map(f =>
        f.id === floor.id ? { ...f, order: other.order } : f.id === other.id ? { ...f, order: floor.order } : f),
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (remoteFloors === null) {
    return loadError ? (
      <div className="p-8">
        <div className="max-w-lg rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-bold mb-1">Couldn&apos;t load the floor plan</p>
          <p>Your Firebase session may have expired. Log out and sign in again as admin.</p>
        </div>
      </div>
    ) : (
      <div className="p-8 text-zinc-500 flex items-center gap-2"><span className="material-symbols-outlined animate-spin">progress_activity</span>Loading floor plan…</div>
    )
  }

  const canvasTables: CanvasTable[] = tablesOnFloor.map(t => {
    const l = layoutOf(t.id)
    return {
      id: t.id, tableNumber: t.tableNumber, name: t.name, capacity: l.capacity, status: t.status,
      x: l.positionX, y: l.positionY, w: l.width, h: l.height, rotation: l.rotation, shape: l.shape,
    }
  })

  const selectedTable = selection?.kind === 'table' ? tableById[selection.id] : null
  const selectedLayout = selectedTable ? layoutOf(selectedTable.id) : null
  const selectedElement = selection?.kind === 'element' && floor ? floor.elements.find(e => e.id === selection.id) ?? null : null
  const presetValue = floor ? (FLOOR_PRESETS.find(p => p.width === floor.width && p.height === floor.height)?.label ?? 'custom') : ''

  return (
    <div className="p-6 lg:p-8 max-w-[1500px]">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 mb-6">
        <div>
          <h2 className="text-3xl font-bold text-zinc-900 mb-1">Floor Plan</h2>
          <p className="text-sm text-zinc-500">Arrange tables to match your dining room. The cashier sees this map live.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarButton icon="undo" label="Undo" onClick={undo} disabled={hist.past === 0} />
          <ToolbarButton icon="redo" label="Redo" onClick={redo} disabled={hist.future === 0} />
          <span className="w-px h-8 bg-zinc-200 mx-1" />
          <ToolbarToggle icon="grid_on" label="Grid" on={showGrid} onClick={() => setShowGrid(v => !v)} />
          <ToolbarToggle icon="grid_goldenratio" label="Snap" on={snapOn} onClick={() => setSnapOn(v => !v)} />
          <select value={zoom} onChange={e => setZoom(Number(e.target.value))} className="h-10 px-3 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-700" aria-label="Zoom">
            {[75, 100, 125, 150, 200].map(z => <option key={z} value={z}>{z}%</option>)}
          </select>
          <span className="w-px h-8 bg-zinc-200 mx-1" />
          <button onClick={discard} disabled={!dirty} className="h-10 px-4 rounded-lg border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40">
            Discard
          </button>
          <button
            onClick={save}
            disabled={!dirty || saveState === 'saving'}
            className="h-10 px-5 rounded-lg bg-primary text-white text-sm font-bold shadow-sm hover:bg-orange-800 disabled:opacity-40 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">
              {saveState === 'saving' ? 'progress_activity' : saveState === 'saved' ? 'check_circle' : 'save'}
            </span>
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : dirty ? 'Save layout' : 'All saved'}
          </button>
        </div>
      </div>
      {saveState === 'error' && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t save the layout. Check your connection and try again — your changes are still here.
        </div>
      )}

      {/* Empty state */}
      {floors.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center shadow-sm">
          <span className="material-symbols-outlined text-6xl text-zinc-300">floor</span>
          <h3 className="text-xl font-bold text-zinc-900 mt-3 mb-2">Set up your floor plan</h3>
          <p className="text-zinc-500 mb-6 max-w-md mx-auto">
            Start with your ground floor. You can add more floors (2nd floor, roof deck…) any time.
          </p>
          <div className="flex justify-center gap-2">
            <input
              value={newFloorName}
              onChange={e => setNewFloorName(e.target.value)}
              placeholder="Ground Floor"
              className="h-11 px-4 rounded-xl border border-zinc-200 w-56"
            />
            <button onClick={addFloor} disabled={busy} className="h-11 px-6 rounded-xl bg-primary text-white font-bold hover:bg-orange-800 disabled:opacity-50">
              Create floor
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Floor tabs */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {floors.map(f => {
              const count = tables.filter(t => layoutOf(t.id).floorId === f.id).length
              const active = floor?.id === f.id
              return (
                <button
                  key={f.id}
                  onClick={() => { setActiveFloorId(f.id); setSelection(null); setConfirmDeleteFloor(false) }}
                  className={`h-10 px-4 rounded-full text-sm font-semibold border transition-colors flex items-center gap-2 ${active ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'}`}
                >
                  <span className="material-symbols-outlined text-[18px]">layers</span>
                  {f.name}
                  <span className={`text-xs px-1.5 rounded-full ${active ? 'bg-white/20' : 'bg-zinc-100'}`}>{count}</span>
                </button>
              )
            })}
            {addingFloor ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={newFloorName}
                  onChange={e => setNewFloorName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addFloor(); if (e.key === 'Escape') setAddingFloor(false) }}
                  placeholder={`e.g. ${floors.length === 1 ? '2nd Floor' : 'Roof Deck'}`}
                  className="h-10 px-3 rounded-full border border-zinc-300 text-sm w-44"
                />
                <button onClick={addFloor} disabled={busy} className="h-10 px-4 rounded-full bg-primary text-white text-sm font-bold disabled:opacity-50">Add</button>
                <button onClick={() => setAddingFloor(false)} className="h-10 px-3 rounded-full text-sm text-zinc-500 hover:text-zinc-800">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setAddingFloor(true)} className="h-10 px-4 rounded-full text-sm font-semibold border border-dashed border-zinc-300 text-zinc-600 hover:border-primary hover:text-primary flex items-center gap-1">
                <span className="material-symbols-outlined text-[18px]">add</span>Add floor
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
            {/* Canvas */}
            <div className="min-w-0">
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-3 overflow-auto max-h-[75vh]">
                {floor && (
                  <div style={{ width: `${zoom}%`, minWidth: zoom > 100 ? `${zoom}%` : undefined }}>
                    <FloorCanvas
                      ref={canvasRef}
                      width={floor.width}
                      height={floor.height}
                      elements={floor.elements}
                      tables={canvasTables}
                      mode="edit"
                      selection={selection}
                      showGrid={showGrid}
                      onItemPointerDown={onItemPointerDown}
                      onBackgroundPointerDown={() => setSelection(null)}
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <span><b className="text-zinc-500">Drag</b> to move</span>
                <span><b className="text-zinc-500">Corner handle</b> to resize</span>
                <span><b className="text-zinc-500">R</b> rotate 15° (Shift+R back)</span>
                <span><b className="text-zinc-500">Arrows</b> nudge (Alt = fine)</span>
                <span><b className="text-zinc-500">Del</b> remove</span>
                <span><b className="text-zinc-500">Ctrl+D</b> duplicate</span>
                <span><b className="text-zinc-500">Ctrl+Z</b> undo</span>
              </p>
            </div>

            {/* Side panel */}
            <div className="space-y-4">
              {/* Inspector: table */}
              {selectedTable && selectedLayout && (
                <Panel title={`Table ${selectedTable.tableNumber}`} subtitle={selectedTable.name} onClose={() => setSelection(null)}>
                  <Field label="Shape">
                    <div className="grid grid-cols-3 gap-2">
                      {SHAPES.map(s => (
                        <button
                          key={s.key}
                          onClick={() => {
                            const size = defaultTableSize(s.key, selectedLayout.capacity)
                            updateLayout(selectedTable.id, { shape: s.key, width: size.width, height: size.height })
                          }}
                          className={`h-16 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center gap-1 ${selectedLayout.shape === s.key ? 'border-primary bg-orange-50 text-primary' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'}`}
                        >
                          <span className="material-symbols-outlined">{s.icon}</span>{s.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Seats">
                    <Stepper
                      value={selectedLayout.capacity}
                      min={1}
                      max={20}
                      onChange={v => updateLayout(selectedTable.id, { capacity: v })}
                    />
                  </Field>
                  <SizeFields
                    w={selectedLayout.width}
                    h={selectedLayout.height}
                    lock={selectedLayout.shape === 'round'}
                    onChange={(w, h) => updateLayout(selectedTable.id, { width: w, height: h })}
                  />
                  <RotationField value={selectedLayout.rotation} onChange={r => updateLayout(selectedTable.id, { rotation: r })} />
                  <Field label="Floor">
                    <select
                      value={selectedLayout.floorId ?? ''}
                      onChange={e => {
                        const target = floors.find(f => f.id === e.target.value)
                        if (!target) return
                        const spot = findSpot(target, selectedLayout.width, selectedLayout.height, occupiedRects(target, current.layouts))
                        updateLayout(selectedTable.id, { floorId: target.id, positionX: spot.x, positionY: spot.y })
                        setActiveFloorId(target.id)
                      }}
                      className="w-full h-10 px-3 rounded-lg border border-zinc-200 bg-white text-sm"
                    >
                      {floors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </Field>
                  <button onClick={removeSelected} className="w-full h-10 rounded-lg border border-zinc-200 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">move_down</span>Take off this floor
                  </button>
                  <p className="text-[11px] text-zinc-400">Seat changes update the table&apos;s capacity everywhere.</p>
                </Panel>
              )}

              {/* Inspector: element */}
              {selectedElement && (
                <Panel title={ELEMENT_META[selectedElement.type].label} onClose={() => setSelection(null)}>
                  {ELEMENT_META[selectedElement.type].showLabel && (
                    <Field label="Label">
                      <input
                        value={selectedElement.label ?? ''}
                        onChange={e => updateElement(selectedElement.id, { label: e.target.value }, false)}
                        onFocus={snapshot}
                        className="w-full h-10 px-3 rounded-lg border border-zinc-200 text-sm"
                      />
                    </Field>
                  )}
                  <SizeFields
                    w={selectedElement.w}
                    h={selectedElement.h}
                    onChange={(w, h) => updateElement(selectedElement.id, { w, h })}
                  />
                  <RotationField value={selectedElement.rotation ?? 0} onChange={r => updateElement(selectedElement.id, { rotation: r })} />
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={duplicateSelected} className="h-10 rounded-lg border border-zinc-200 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 flex items-center justify-center gap-1">
                      <span className="material-symbols-outlined text-[18px]">content_copy</span>Duplicate
                    </button>
                    <button onClick={removeSelected} className="h-10 rounded-lg border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 flex items-center justify-center gap-1">
                      <span className="material-symbols-outlined text-[18px]">delete</span>Delete
                    </button>
                  </div>
                </Panel>
              )}

              {/* Tables not placed */}
              <Panel title="Tables to place" subtitle={unplaced.length ? `${unplaced.length} not on any floor` : 'Every table is placed'}>
                {unplaced.length === 0 ? (
                  <p className="text-sm text-zinc-400">New tables you create in Table Management will show up here.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {unplaced.map(t => (
                        <button
                          key={t.id}
                          onClick={() => placeTable(t.id)}
                          title={`Place ${t.name} on ${floor?.name}`}
                          className="h-9 px-3 rounded-lg border border-zinc-200 bg-zinc-50 text-sm font-semibold text-zinc-700 hover:border-primary hover:text-primary flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[16px]">add</span>T{t.tableNumber}
                        </button>
                      ))}
                    </div>
                    <button onClick={autoArrange} className="mt-3 w-full h-10 rounded-lg bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-700 flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">auto_awesome_mosaic</span>Place all on {floor?.name}
                    </button>
                  </>
                )}
              </Panel>

              {/* Palette */}
              <Panel title="Add to floor" subtitle="Walls, doors, bar, kitchen…">
                <div className="grid grid-cols-3 gap-2">
                  {PALETTE_ORDER.map(type => (
                    <button
                      key={type}
                      onClick={() => addElement(type)}
                      className="h-16 rounded-xl border border-zinc-200 text-[11px] font-semibold text-zinc-600 hover:border-primary hover:text-primary hover:bg-orange-50/50 flex flex-col items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined">{ELEMENT_META[type].icon}</span>
                      {ELEMENT_META[type].label}
                    </button>
                  ))}
                </div>
              </Panel>

              {/* Floor settings */}
              {floor && (
                <Panel title="Floor settings">
                  <Field label="Name">
                    <input
                      value={floor.name}
                      onChange={e => updateFloor(floor.id, { name: e.target.value }, false)}
                      onFocus={snapshot}
                      className="w-full h-10 px-3 rounded-lg border border-zinc-200 text-sm"
                    />
                  </Field>
                  <Field label="Canvas size">
                    <select
                      value={presetValue}
                      onChange={e => {
                        const p = FLOOR_PRESETS.find(x => x.label === e.target.value)
                        if (p) updateFloor(floor.id, { width: p.width, height: p.height })
                      }}
                      className="w-full h-10 px-3 rounded-lg border border-zinc-200 bg-white text-sm"
                    >
                      {FLOOR_PRESETS.map(p => <option key={p.label} value={p.label}>{p.label} ({p.width} × {p.height})</option>)}
                      {presetValue === 'custom' && <option value="custom">Custom ({floor.width} × {floor.height})</option>}
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => moveFloorOrder(-1)} disabled={floors[0]?.id === floor.id} className="h-10 rounded-lg border border-zinc-200 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 flex items-center justify-center gap-1">
                      <span className="material-symbols-outlined text-[18px]">arrow_back</span>Move left
                    </button>
                    <button onClick={() => moveFloorOrder(1)} disabled={floors.at(-1)?.id === floor.id} className="h-10 rounded-lg border border-zinc-200 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 flex items-center justify-center gap-1">
                      Move right<span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </button>
                  </div>
                  {confirmDeleteFloor ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 space-y-2">
                      <p>Delete <b>{floor.name}</b>? {tablesOnFloor.length > 0 && `Its ${tablesOnFloor.length} table(s) go back to "Tables to place" — they aren't deleted.`}</p>
                      <div className="flex gap-2">
                        <button onClick={removeFloor} disabled={busy || dirty} className="flex-1 h-9 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-50">Delete floor</button>
                        <button onClick={() => setConfirmDeleteFloor(false)} className="flex-1 h-9 rounded-lg border border-red-200 bg-white font-semibold">Keep</button>
                      </div>
                      {dirty && <p className="text-xs">Save or discard your layout changes first.</p>}
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteFloor(true)} className="w-full h-10 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 flex items-center justify-center gap-1">
                      <span className="material-symbols-outlined text-[18px]">delete</span>Delete this floor
                    </button>
                  )}
                </Panel>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Small UI pieces ──────────────────────────────────────────────────────────
function Panel({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose?: () => void; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-zinc-900">{title}</h3>
          {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
        </div>
        {onClose && (
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center text-zinc-500" aria-label="Close">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{label}</p>
      {children}
    </div>
  )
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="w-10 h-10 rounded-lg border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 flex items-center justify-center">
        <span className="material-symbols-outlined text-[18px]">remove</span>
      </button>
      <span className="w-10 text-center font-bold text-zinc-900">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="w-10 h-10 rounded-lg border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 flex items-center justify-center">
        <span className="material-symbols-outlined text-[18px]">add</span>
      </button>
    </div>
  )
}

function SizeFields({ w, h, lock = false, onChange }: { w: number; h: number; lock?: boolean; onChange: (w: number, h: number) => void }) {
  const num = (v: string, fallback: number) => Math.max(10, Math.min(3000, Math.round(Number(v) || fallback)))
  return (
    <Field label={lock ? 'Diameter' : 'Size (W × H)'}>
      <div className="flex items-center gap-2">
        <input type="number" value={Math.round(w)} onChange={e => { const v = num(e.target.value, w); onChange(v, lock ? v : h) }} className="w-full h-10 px-3 rounded-lg border border-zinc-200 text-sm" aria-label="Width" />
        {!lock && <>
          <span className="text-zinc-400">×</span>
          <input type="number" value={Math.round(h)} onChange={e => onChange(w, num(e.target.value, h))} className="w-full h-10 px-3 rounded-lg border border-zinc-200 text-sm" aria-label="Height" />
        </>}
      </div>
    </Field>
  )
}

function RotationField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Field label={`Rotation · ${value}°`}>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(normRotation(value - 15))} className="w-10 h-10 rounded-lg border border-zinc-200 hover:bg-zinc-50 flex items-center justify-center" aria-label="Rotate left">
          <span className="material-symbols-outlined text-[18px]">rotate_left</span>
        </button>
        <input type="range" min={0} max={345} step={15} value={value} onChange={e => onChange(Number(e.target.value))} className="flex-1 accent-orange-700" aria-label="Rotation" />
        <button onClick={() => onChange(normRotation(value + 15))} className="w-10 h-10 rounded-lg border border-zinc-200 hover:bg-zinc-50 flex items-center justify-center" aria-label="Rotate right">
          <span className="material-symbols-outlined text-[18px]">rotate_right</span>
        </button>
      </div>
    </Field>
  )
}

function ToolbarButton({ icon, label, onClick, disabled }: { icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={label} aria-label={label} className="w-10 h-10 rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 flex items-center justify-center">
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
    </button>
  )
}

function ToolbarToggle({ icon, label, on, onClick }: { icon: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={`h-10 px-3 rounded-lg border text-sm font-semibold flex items-center gap-1.5 ${on ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'}`}>
      <span className="material-symbols-outlined text-[18px]">{icon}</span>{label}
    </button>
  )
}
