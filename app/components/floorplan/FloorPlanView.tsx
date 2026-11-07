'use client'

/**
 * Read-only live floor map for staff screens (cashier, kitchen).
 * Tables are coloured by status; clicking one selects it.
 */

import { useEffect, useMemo, useState } from 'react'
import { listenToFloors, type Floor, type Table } from '@/lib/data'
import FloorCanvas, { type CanvasTable } from './FloorCanvas'
import { resolveLayout } from './shared'

export default function FloorPlanView({ tables, selectedTableId, onSelectTable, now, onShowList }: {
  tables: Table[]
  selectedTableId?: string | null
  onSelectTable?: (id: string) => void
  now?: number
  onShowList?: () => void
}) {
  const [floors, setFloors] = useState<Floor[] | null>(null)
  const [floorId, setFloorId] = useState<string | null>(null)

  // On error, fall back to "no floor plan" (the list view still works)
  useEffect(() => listenToFloors(setFloors, () => setFloors([])), [])

  const sorted = useMemo(() => [...(floors ?? [])].sort((a, b) => a.order - b.order), [floors])
  const floorIds = new Set(sorted.map(f => f.id))
  const selectedFloor = selectedTableId ? tables.find(t => t.id === selectedTableId)?.floorId : null
  const floor = sorted.find(f => f.id === floorId) ?? sorted.find(f => f.id === selectedFloor) ?? sorted[0]

  if (floors === null) {
    return <div className="py-10 text-center text-sm text-on-surface-variant">Loading floor plan…</div>
  }

  if (!floor) {
    return (
      <div className="rounded-xl border border-dashed border-outline-variant p-6 text-center">
        <span className="material-symbols-outlined text-4xl text-on-surface-variant">floor</span>
        <p className="font-semibold mt-2">No floor plan yet</p>
        <p className="text-sm text-on-surface-variant mt-1">An admin can draw the dining room in Admin → Floor Plan.</p>
        {onShowList && (
          <button onClick={onShowList} className="mt-3 text-sm font-semibold text-primary underline">Show table list</button>
        )}
      </div>
    )
  }

  const unplaced = tables.filter(t => !t.floorId || !floorIds.has(t.floorId)).length

  const canvasTables: CanvasTable[] = tables
    .filter(t => t.floorId === floor.id)
    .map(t => {
      const l = resolveLayout(t)
      const mins = t.status === 'occupied' && t.occupiedAt && now ? Math.floor((now - t.occupiedAt) / 60000) : null
      return {
        id: t.id, tableNumber: t.tableNumber, name: t.name, capacity: t.capacity, status: t.status,
        x: l.positionX, y: l.positionY, w: l.width, h: l.height, rotation: l.rotation, shape: l.shape,
        note: mins !== null ? (mins > 0 ? `${mins}m` : 'now') : undefined,
      }
    })

  return (
    <div className="space-y-3">
      {sorted.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sorted.map(f => {
            const busy = tables.filter(t => t.floorId === f.id && t.status === 'occupied').length
            const active = f.id === floor.id
            return (
              <button
                key={f.id}
                onClick={() => setFloorId(f.id)}
                className={`shrink-0 h-9 px-3 rounded-full text-sm font-semibold border flex items-center gap-1.5 ${active ? 'bg-on-surface text-white border-on-surface' : 'bg-white border-outline-variant text-on-surface-variant'}`}
              >
                {f.name}
                {busy > 0 && <span className={`text-xs px-1.5 rounded-full ${active ? 'bg-white/20' : 'bg-red-100 text-red-700'}`}>{busy}</span>}
              </button>
            )
          })}
        </div>
      )}

      <FloorCanvas
        width={floor.width}
        height={floor.height}
        elements={floor.elements ?? []}
        tables={canvasTables}
        mode="view"
        selection={selectedTableId ? { kind: 'table', id: selectedTableId } : null}
        onTableClick={onSelectTable}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant">
        <Legend color="#10b981" label="Available" />
        <Legend color="#ef4444" label="Occupied" />
        <Legend color="#3b82f6" label="Reserved" />
        {unplaced > 0 && onShowList && (
          <button onClick={onShowList} className="ml-auto font-semibold text-primary">
            {unplaced} table{unplaced !== 1 ? 's' : ''} not on the map →
          </button>
        )}
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}
