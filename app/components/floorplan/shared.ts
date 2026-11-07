import type { FloorElementType, Table, TableLayout, TableShape } from '@/lib/data'

/** Snap step in floor units. A floor is typically 1200 × 800 units. */
export const GRID = 20

export const FLOOR_PRESETS = [
  { label: 'Small', width: 1000, height: 700 },
  { label: 'Medium', width: 1200, height: 800 },
  { label: 'Large', width: 1600, height: 1000 },
  { label: 'Wide', width: 2000, height: 900 },
  { label: 'Tall', width: 1000, height: 1400 },
] as const

export const DEFAULT_FLOOR = { width: 1200, height: 800 }

export const SHAPES: { key: TableShape; label: string; icon: string }[] = [
  { key: 'round', label: 'Round', icon: 'circle' },
  { key: 'square', label: 'Square', icon: 'square' },
  { key: 'rectangle', label: 'Long', icon: 'rectangle' },
]

export function defaultTableSize(shape: TableShape, capacity: number) {
  if (shape === 'round') {
    const d = capacity <= 2 ? 80 : capacity <= 4 ? 100 : capacity <= 6 ? 130 : 150
    return { width: d, height: d }
  }
  if (shape === 'square') {
    const s = capacity <= 2 ? 80 : capacity <= 4 ? 100 : 120
    return { width: s, height: s }
  }
  return { width: Math.max(160, Math.ceil(capacity / 2) * 56 + 30), height: 90 }
}

/** A table's layout with sensible defaults filled in. */
export function resolveLayout(t: Table): Required<Omit<TableLayout, 'floorId'>> & { floorId: string | null } {
  const shape: TableShape = t.shape ?? (t.capacity >= 6 ? 'rectangle' : 'square')
  const size = defaultTableSize(shape, t.capacity)
  return {
    floorId: t.floorId ?? null,
    positionX: t.positionX ?? 0,
    positionY: t.positionY ?? 0,
    width: t.width ?? size.width,
    height: t.height ?? size.height,
    rotation: t.rotation ?? 0,
    shape,
    capacity: t.capacity,
  }
}

export const ELEMENT_META: Record<FloorElementType, {
  label: string
  icon: string
  w: number
  h: number
  defaultLabel?: string
  layer: number          // lower = drawn underneath
  showLabel: boolean
}> = {
  zone:     { label: 'Zone / area', icon: 'select_all',      w: 360, h: 240, defaultLabel: 'Garden', layer: 0, showLabel: true },
  kitchen:  { label: 'Kitchen',     icon: 'skillet',         w: 300, h: 200, defaultLabel: 'Kitchen', layer: 1, showLabel: true },
  restroom: { label: 'Restroom',    icon: 'wc',              w: 140, h: 120, defaultLabel: 'CR', layer: 1, showLabel: true },
  stairs:   { label: 'Stairs',      icon: 'stairs',          w: 120, h: 160, defaultLabel: 'Stairs', layer: 1, showLabel: true },
  bar:      { label: 'Bar',         icon: 'local_bar',       w: 280, h: 70,  defaultLabel: 'Bar', layer: 2, showLabel: true },
  counter:  { label: 'Cashier',     icon: 'point_of_sale',   w: 180, h: 70,  defaultLabel: 'Cashier', layer: 2, showLabel: true },
  wall:     { label: 'Wall',        icon: 'horizontal_rule', w: 300, h: 16,  layer: 3, showLabel: false },
  window:   { label: 'Window',      icon: 'window',          w: 200, h: 12,  layer: 3, showLabel: false },
  entrance: { label: 'Entrance',    icon: 'door_front',      w: 120, h: 40,  defaultLabel: 'Entrance', layer: 3, showLabel: true },
  plant:    { label: 'Plant',       icon: 'potted_plant',    w: 50,  h: 50,  layer: 4, showLabel: false },
  label:    { label: 'Text label',  icon: 'title',           w: 220, h: 50,  defaultLabel: 'Label', layer: 4, showLabel: true },
}

export const PALETTE_ORDER: FloorElementType[] = [
  'wall', 'window', 'entrance', 'bar', 'counter', 'kitchen', 'restroom', 'stairs', 'plant', 'zone', 'label',
]

export const snap = (v: number, on: boolean) => (on ? Math.round(v / GRID) * GRID : Math.round(v))
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
export const uid = () => Math.random().toString(36).slice(2, 10)
export const normRotation = (deg: number) => ((Math.round(deg) % 360) + 360) % 360
