<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CircuitNode from './CircuitNode.vue'
import {
  addNode,
  addText,
  circuit,
  clipboardState,
  collapseFold,
  collapseMode,
  connect,
  copySelection,
  cutSelection,
  cycleClockFreq,
  deleteSelection,
  duplicateSelection,
  expandFold,
  flushNudge,
  groupSelection,
  nudgeSelection,
  pasteClipboard,
  recordHistory,
  removeNode,
  renameFold,
  selectAll,
  toggleNode,
  toggleSelectionCollapse,
  unfoldFold,
  ungroupSelection,
} from '../circuit/store'
import { NODE_SPECS, nodeFrame, portPointOf, textMetrics, wirePath } from '../circuit/specs'
import { advance, createRuntime, simulate, type Simulation } from '../circuit/simulate'
import { t, modLabel, shiftLabel } from '../i18n'
import type {
  BasicNodeType,
  Bit,
  CircuitFold,
  CircuitGroup,
  CircuitNode as CircuitNodeData,
  NodeType,
  Vec,
  WireEnd,
} from '../types'

const stage = ref<HTMLDivElement | null>(null)
const svg = ref<SVGSVGElement | null>(null)

interface DragState {
  id: string
  type: NodeType
  sx: number
  sy: number
  wx: number
  wy: number
  origins: { id: string; x: number; y: number }[]
  multi: boolean
  moved: boolean
  fromFrame?: boolean
}

interface MarqueeState {
  ax: number
  ay: number
  bx: number
  by: number
  sx: number
  sy: number
  additive: boolean
  moved: boolean
}

interface PanState {
  sx: number
  sy: number
  vx: number
  vy: number
}

const drag = ref<DragState | null>(null)
const pan = ref<PanState | null>(null)
const panning = ref(false)
const spaceHeld = ref(false)
const marquee = ref<MarqueeState | null>(null)
const wiring = ref<{ from: WireEnd; x: number; y: number } | null>(null)
const hoverIn = ref<WireEnd | null>(null)
const TICK = 50
let runtime = createRuntime()
let timer: number | undefined
let cascade = 0
let autoFit = true
let observer: ResizeObserver | null = null

type MenuTarget = { kind: 'node'; id: string } | { kind: 'wire'; id: string } | { kind: 'canvas' }
type MenuAction =
  | 'group'
  | 'ungroup'
  | 'collapse'
  | 'rename'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'delete'
type MenuIcon =
  | 'group'
  | 'ungroup'
  | 'collapse'
  | 'expand'
  | 'unfold'
  | 'rename'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'delete'

interface MenuItem {
  id: MenuAction
  label: string
  icon: MenuIcon
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  separatorBefore?: boolean
}

interface GroupBox {
  id: string
  x: number
  y: number
  w: number
  h: number
  selected: boolean
}

const menu = ref<{ x: number; y: number; target: MenuTarget } | null>(null)
const menuEl = ref<HTMLDivElement | null>(null)
const menuPos = ref({ left: 0, top: 0 })

const selectedNodeIds = computed(() => new Set(circuit.selection?.nodes ?? []))
const touchedGroups = computed(() =>
  circuit.groups.filter(group => group.nodes.some(id => selectedNodeIds.value.has(id))),
)
const canGroupSelection = computed(() => {
  const count = selectedNodeIds.value.size
  if (count < 2) return false
  const groups = touchedGroups.value
  if (groups.length !== 1) return true
  const group = groups[0]
  return !(group.nodes.length === count && group.nodes.every(id => selectedNodeIds.value.has(id)))
})
const canUngroupSelection = computed(() => touchedGroups.value.length > 0)
const selectionCollapse = computed(() => collapseMode())
const renameTarget = computed<CircuitFold | null>(() => {
  const selection = circuit.selection
  if (!selection || selection.nodes.length < 2) return null
  const selected = new Set(selection.nodes)
  return (
    circuit.folds.find(
      fold =>
        fold.nodes.length === selected.size && fold.nodes.every(id => selected.has(id)),
    ) ?? null
  )
})
const contextFoldTarget = computed<CircuitFold | null>(() => {
  const target = menu.value?.target
  if (target?.kind !== 'node') return null
  const fold = circuit.folds.find(item => !item.collapsed && item.nodes.includes(target.id))
  if (!fold) return null
  const selection = circuit.selection
  if (!selection) return null
  const selected = new Set(selection.nodes)
  if (fold.nodes.length === selected.size && fold.nodes.every(id => selected.has(id))) return null
  return fold
})

const menuItems = computed<MenuItem[]>(() => {
  const target = menu.value?.target
  if (!target) return []
  const isNode = target.kind === 'node'
  const isWire = target.kind === 'wire'
  const hasNodes = (circuit.selection?.nodes.length ?? 0) > 0
  const hasWires = (circuit.selection?.wires.length ?? 0) > 0
  const unfolding = selectionCollapse.value === 'expand' || Boolean(contextFoldTarget.value)
  const canCollapse = Boolean(selectionCollapse.value) || Boolean(contextFoldTarget.value)
  return [
    {
      id: 'group',
      label: t('menu.group'),
      icon: 'group',
      disabled: !isNode || !canGroupSelection.value,
    },
    {
      id: 'ungroup',
      label: t('menu.ungroup'),
      icon: 'ungroup',
      disabled: !isNode || !canUngroupSelection.value,
    },
    {
      id: 'collapse',
      label: unfolding ? t('menu.unfold') : t('menu.collapse'),
      icon: unfolding ? 'unfold' : 'collapse',
      shortcut: `${shiftLabel}F`,
      disabled: !canCollapse,
    },
    {
      id: 'rename',
      label: t('menu.rename'),
      icon: 'rename',
      disabled: !renameTarget.value,
    },
    {
      id: 'cut',
      label: t('menu.cut'),
      icon: 'cut',
      shortcut: `${modLabel}X`,
      separatorBefore: true,
      disabled: !isNode || !hasNodes,
    },
    {
      id: 'copy',
      label: t('menu.copy'),
      icon: 'copy',
      shortcut: `${modLabel}C`,
      disabled: !isNode || !hasNodes,
    },
    {
      id: 'paste',
      label: t('menu.paste'),
      icon: 'paste',
      shortcut: `${modLabel}V`,
      disabled: !clipboardState.hasData,
    },
    {
      id: 'duplicate',
      label: t('menu.duplicate'),
      icon: 'duplicate',
      shortcut: `${modLabel}D`,
      disabled: !isNode || !hasNodes,
    },
    {
      id: 'delete',
      label: isWire ? t('menu.deleteWire') : t('menu.delete'),
      icon: 'delete',
      shortcut: 'Del',
      danger: true,
      separatorBefore: true,
      disabled: isWire ? !hasWires : !isNode || !hasNodes,
    },
  ]
})

interface EditingState {
  id: string
  original: string
}

const editing = ref<EditingState | null>(null)
const editValue = ref('')
const editorRef = ref<HTMLTextAreaElement | null>(null)

interface RenameState {
  id: string
}

const renaming = ref<RenameState | null>(null)
const renameValue = ref('')
const renameRef = ref<HTMLInputElement | null>(null)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function placeMenu() {
  const current = menu.value
  const el = menuEl.value
  if (!current || !el) return
  const gap = 8
  menuPos.value = {
    left: clamp(current.x + 3, gap, window.innerWidth - el.offsetWidth - gap),
    top: clamp(current.y + 3, gap, window.innerHeight - el.offsetHeight - gap),
  }
}

function openMenu(x: number, y: number, target: MenuTarget) {
  menu.value = { x, y, target }
  nextTick(() => {
    placeMenu()
    menuEl.value?.querySelector<HTMLButtonElement>('.ctx-item:not(:disabled)')?.focus({ preventScroll: true })
  })
}

function closeMenu(restoreFocus = true) {
  if (!menu.value) return
  menu.value = null
  if (restoreFocus) {
    nextTick(() => stage.value?.focus({ preventScroll: true }))
  }
}

function onMenuKeydown(ev: KeyboardEvent) {
  if (!menuEl.value) return
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key)) return
  const items = [...menuEl.value.querySelectorAll<HTMLButtonElement>('.ctx-item:not(:disabled)')]
  if (!items.length) return
  ev.preventDefault()
  ev.stopPropagation()
  const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement)
  let nextIndex = 0
  if (ev.key === 'End') nextIndex = items.length - 1
  else if (ev.key !== 'Home') {
    const delta = ev.key === 'ArrowDown' ? 1 : -1
    nextIndex = activeIndex < 0 ? 0 : (activeIndex + delta + items.length) % items.length
  }
  items[nextIndex]?.focus({ preventScroll: true })
}

function onNodeMenu(payload: { id: string; event: MouseEvent }) {
  const { id, event } = payload
  if (!isNodeFullySelected(id)) {
    circuit.selection = { nodes: [...selectionIdsForNode(id)], wires: [] }
  }
  openMenu(event.clientX, event.clientY, { kind: 'node', id })
}

function onWireMenu(ev: MouseEvent, id: string) {
  if (!isWireSelected(id)) circuit.selection = { nodes: [], wires: [id] }
  openMenu(ev.clientX, ev.clientY, { kind: 'wire', id })
}

function onCanvasMenu(ev: MouseEvent) {
  const fold = foldUnitAtPoint(toWorld(ev.clientX, ev.clientY))
  if (fold) circuit.selection = { nodes: [...fold.nodes], wires: [] }
  openMenu(ev.clientX, ev.clientY, { kind: 'canvas' })
}

function runMenu(action: MenuAction) {
  const target = menu.value?.target
  const contextFold = contextFoldTarget.value
  closeMenu()
  if (!target) return
  if (action === 'group') groupSelection()
  else if (action === 'ungroup') ungroupSelection()
  else if (action === 'collapse') {
    if (contextFold) unfoldFold(contextFold.id)
    else toggleSelectionCollapse()
  } else if (action === 'rename') beginRename()
  else if (action === 'cut') cutSelection()
  else if (action === 'copy') copySelection()
  else if (action === 'paste') pasteClipboard()
  else if (action === 'duplicate') duplicateSelection()
  else if (action === 'delete') deleteSelection()
}

function onWindowResize() {
  closeMenu(false)
}

const gridStyle = computed(() => {
  const step = 24 * circuit.view.zoom
  const x = ((circuit.view.x % step) + step) % step
  const y = ((circuit.view.y % step) + step) % step
  return {
    backgroundSize: `${step}px ${step}px`,
    backgroundPosition: `${x}px ${y}px`,
  }
})

function toWorld(clientX: number, clientY: number): Vec {
  const rect = stage.value!.getBoundingClientRect()
  return {
    x: (clientX - rect.left - circuit.view.x) / circuit.view.zoom,
    y: (clientY - rect.top - circuit.view.y) / circuit.view.zoom,
  }
}

function capturePointer(ev: PointerEvent) {
  try {
    svg.value?.setPointerCapture(ev.pointerId)
  } catch {
    // 合成事件的 pointerId 没有活动指针，无法捕获
  }
}

function startPan(ev: PointerEvent) {
  autoFit = false
  pan.value = { sx: ev.clientX, sy: ev.clientY, vx: circuit.view.x, vy: circuit.view.y }
  panning.value = true
  capturePointer(ev)
}

function isNodeSelected(id: string): boolean {
  return circuit.selection?.nodes.includes(id) ?? false
}

function isWireSelected(id: string): boolean {
  return circuit.selection?.wires.includes(id) ?? false
}

function groupForNode(id: string): CircuitGroup | undefined {
  return circuit.groups.find(group => group.nodes.includes(id))
}

function selectionIdsForNode(id: string): string[] {
  return groupForNode(id)?.nodes ?? [id]
}

interface GroupFrame {
  x: number
  y: number
  w: number
  h: number
}

function nodesFrame(ids: string[], pad = 10): GroupFrame | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let count = 0
  for (const id of ids) {
    const node = circuit.nodes.find(item => item.id === id)
    if (!node) continue
    const frame = nodeFrame(node)
    minX = Math.min(minX, frame.x)
    minY = Math.min(minY, frame.y)
    maxX = Math.max(maxX, frame.x + frame.w)
    maxY = Math.max(maxY, frame.y + frame.h)
    count += 1
  }
  if (!count) return null
  return {
    x: minX - pad,
    y: minY - pad,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2,
  }
}

function groupFrame(group: CircuitGroup): GroupFrame | null {
  return nodesFrame(group.nodes)
}

const FOLD_FRAME_PAD = 22

function foldFrame(ids: string[]): GroupFrame | null {
  return nodesFrame(ids, FOLD_FRAME_PAD)
}

function groupHasSelection(group: CircuitGroup): boolean {
  return group.nodes.some(id => isNodeSelected(id))
}

function frameContains(frame: GroupFrame, point: Vec): boolean {
  return (
    point.x >= frame.x &&
    point.x <= frame.x + frame.w &&
    point.y >= frame.y &&
    point.y <= frame.y + frame.h
  )
}

function collapsedFoldAtPoint(point: Vec): CircuitFold | null {
  for (let index = collapsedBlocks.value.length - 1; index >= 0; index--) {
    const block = collapsedBlocks.value[index]
    if (!frameContains(block, point)) continue
    return circuit.folds.find(fold => fold.id === block.id) ?? null
  }
  return null
}

function frameEdgeHit(frame: GroupFrame, point: Vec): boolean {
  const tolerance = 7 / circuit.view.zoom
  const inX = point.x >= frame.x - tolerance && point.x <= frame.x + frame.w + tolerance
  const inY = point.y >= frame.y - tolerance && point.y <= frame.y + frame.h + tolerance
  if (!inX || !inY) return false
  return (
    Math.abs(point.x - frame.x) <= tolerance ||
    Math.abs(point.x - (frame.x + frame.w)) <= tolerance ||
    Math.abs(point.y - frame.y) <= tolerance ||
    Math.abs(point.y - (frame.y + frame.h)) <= tolerance
  )
}

function openFoldAtPoint(point: Vec): CircuitFold | null {
  for (let index = circuit.folds.length - 1; index >= 0; index--) {
    const fold = circuit.folds[index]
    if (fold.collapsed) continue
    const ids = fold.nodes.filter(id => circuit.nodes.some(node => node.id === id))
    if (ids.length < 2) continue
    const frame = foldFrame(ids)
    if (frame && frameEdgeHit(frame, point)) return fold
  }
  return null
}

function foldUnitAtPoint(point: Vec): CircuitFold | null {
  return collapsedFoldAtPoint(point) ?? openFoldAtPoint(point)
}

function visibleGroupAtPoint(point: Vec): CircuitGroup | null {
  for (let index = circuit.groups.length - 1; index >= 0; index--) {
    const group = circuit.groups[index]
    if (!groupHasSelection(group)) continue
    const frame = groupFrame(group)
    if (frame && frameContains(frame, point)) return group
  }
  return null
}

function visibleUnitAtPoint(point: Vec): CircuitFold | CircuitGroup | null {
  return foldUnitAtPoint(point) ?? visibleGroupAtPoint(point)
}

function isNodeFullySelected(id: string): boolean {
  return selectionIdsForNode(id).every(item => isNodeSelected(item))
}

function activateNode(id: string) {
  circuit.selection = { nodes: [...selectionIdsForNode(id)], wires: [] }
  const node = circuit.nodes.find(item => item.id === id)
  if (node?.type === 'switch') toggleNode(id)
  else if (node?.type === 'clock') cycleClockFreq(id)
}

function toggleNodeSelection(id: string) {
  const current = circuit.selection ?? { nodes: [], wires: [] }
  const ids = selectionIdsForNode(id)
  const allSelected = ids.every(item => current.nodes.includes(item))
  const nodes = allSelected
    ? current.nodes.filter(item => !ids.includes(item))
    : [...new Set([...current.nodes, ...ids])]
  circuit.selection = nodes.length || current.wires.length ? { nodes, wires: [...current.wires] } : null
}

function toggleWireSelection(id: string) {
  const current = circuit.selection ?? { nodes: [], wires: [] }
  const wires = current.wires.includes(id)
    ? current.wires.filter(item => item !== id)
    : [...current.wires, id]
  circuit.selection = wires.length || current.nodes.length ? { nodes: [...current.nodes], wires } : null
}

function onSvgDown(ev: PointerEvent) {
  if (ev.button === 1 || circuit.tool === 'pan' || spaceHeld.value) {
    startPan(ev)
    return
  }
  if (ev.button !== 0) return
  closeMenu()
  const point = toWorld(ev.clientX, ev.clientY)
  const group = visibleUnitAtPoint(point)
  if (group) {
    const ids = new Set(group.nodes)
    if (ev.shiftKey) {
      const current = circuit.selection ?? { nodes: [], wires: [] }
      const allSelected = group.nodes.every(id => current.nodes.includes(id))
      const nodes = allSelected
        ? current.nodes.filter(id => !ids.has(id))
        : [...new Set([...current.nodes, ...group.nodes])]
      circuit.selection =
        nodes.length || current.wires.length ? { nodes, wires: [...current.wires] } : null
      return
    }
    const wasSelected = group.nodes.every(id => isNodeSelected(id))
    if (!wasSelected) circuit.selection = { nodes: [...group.nodes], wires: [] }
    const selected = new Set(circuit.selection?.nodes ?? group.nodes)
    const origins = circuit.nodes
      .filter(item => selected.has(item.id))
      .map(item => ({ id: item.id, x: item.x, y: item.y }))
    drag.value = {
      id: '',
      type: 'text',
      sx: ev.clientX,
      sy: ev.clientY,
      wx: point.x,
      wy: point.y,
      origins,
      multi: origins.length > 1,
      moved: false,
      fromFrame: true,
    }
    capturePointer(ev)
    return
  }
  marquee.value = {
    ax: point.x,
    ay: point.y,
    bx: point.x,
    by: point.y,
    sx: ev.clientX,
    sy: ev.clientY,
    additive: ev.shiftKey,
    moved: false,
  }
  if (!ev.shiftKey) circuit.selection = null
  capturePointer(ev)
}

function onNodeDown(payload: { id: string; event: PointerEvent }) {
  const { id, event: ev } = payload
  if (ev.button === 1 || spaceHeld.value) {
    ev.stopPropagation()
    startPan(ev)
    return
  }
  if (ev.button !== 0) return
  ev.stopPropagation()
  closeMenu()
  if (circuit.tool === 'pan') {
    startPan(ev)
    return
  }
  const node = circuit.nodes.find(item => item.id === id)
  if (!node) return
  if (ev.shiftKey) {
    toggleNodeSelection(id)
    return
  }
  const wasSelected = isNodeSelected(id)
  const previousCount = circuit.selection?.nodes.length ?? 0
  if (!wasSelected) {
    const group = groupForNode(id)
    const ids = group && !groupHasSelection(group) ? group.nodes : [id]
    circuit.selection = { nodes: [...ids], wires: [] }
  }
  const selected = new Set(circuit.selection?.nodes ?? [id])
  const origins = circuit.nodes
    .filter(item => selected.has(item.id))
    .map(item => ({ id: item.id, x: item.x, y: item.y }))
  const start = toWorld(ev.clientX, ev.clientY)
  drag.value = {
    id,
    type: node.type,
    sx: ev.clientX,
    sy: ev.clientY,
    wx: start.x,
    wy: start.y,
    origins,
    multi: wasSelected && previousCount > 1,
    moved: false,
  }
  capturePointer(ev)
}

function onPortDown(payload: { id: string; port: string; dir: 'in' | 'out'; event: PointerEvent }) {
  const { id, port, dir, event: ev } = payload
  if (ev.button === 1 || spaceHeld.value) {
    ev.stopPropagation()
    startPan(ev)
    return
  }
  if (ev.button !== 0) return
  ev.stopPropagation()
  closeMenu()
  if (circuit.tool === 'pan') {
    startPan(ev)
    return
  }
  if (dir === 'in') return
  const start = toWorld(ev.clientX, ev.clientY)
  wiring.value = { from: { nodeId: id, port }, x: start.x, y: start.y }
  hoverIn.value = null
  capturePointer(ev)
}

function onWireDown(ev: PointerEvent, id: string) {
  if (ev.button === 1 || spaceHeld.value) {
    ev.stopPropagation()
    startPan(ev)
    return
  }
  if (ev.button !== 0) return
  ev.stopPropagation()
  closeMenu()
  if (circuit.tool === 'pan') {
    startPan(ev)
    return
  }
  if (ev.shiftKey) {
    toggleWireSelection(id)
    return
  }
  circuit.selection = { nodes: [], wires: [id] }
}

function findInputNear(point: Vec): WireEnd | null {
  let best: WireEnd | null = null
  let bestDist = 18 / circuit.view.zoom
  for (const node of circuit.nodes) {
    if (hiddenNodeIds.value.has(node.id)) continue
    if (wiring.value && node.id === wiring.value.from.nodeId) continue
    for (const port of NODE_SPECS[node.type].ins) {
      const dist = Math.hypot(node.x + port.x - point.x, node.y + port.y - point.y)
      if (dist < bestDist) {
        bestDist = dist
        best = { nodeId: node.id, port: port.id }
      }
    }
  }
  return best
}

function onSvgMove(ev: PointerEvent) {
  if (pan.value) {
    circuit.view.x = pan.value.vx + ev.clientX - pan.value.sx
    circuit.view.y = pan.value.vy + ev.clientY - pan.value.sy
    return
  }
  if (drag.value) {
    const current = drag.value
    if (Math.hypot(ev.clientX - current.sx, ev.clientY - current.sy) > 3) current.moved = true
    const point = toWorld(ev.clientX, ev.clientY)
    const dx = point.x - current.wx
    const dy = point.y - current.wy
    const byId = new Map(circuit.nodes.map(item => [item.id, item]))
    for (const origin of current.origins) {
      const node = byId.get(origin.id)
      if (!node) continue
      node.x = Math.round(origin.x + dx)
      node.y = Math.round(origin.y + dy)
    }
    return
  }
  if (marquee.value) {
    const current = marquee.value
    if (Math.hypot(ev.clientX - current.sx, ev.clientY - current.sy) > 3) current.moved = true
    const point = toWorld(ev.clientX, ev.clientY)
    current.bx = point.x
    current.by = point.y
    return
  }
  if (wiring.value) {
    const point = toWorld(ev.clientX, ev.clientY)
    wiring.value.x = point.x
    wiring.value.y = point.y
    hoverIn.value = findInputNear(point)
  }
}

function onSvgUp(ev: PointerEvent) {
  if (pan.value) {
    pan.value = null
    panning.value = false
  }
  if (drag.value) {
    const current = drag.value
    if (!current.moved) {
      if (!current.fromFrame) {
        if (current.multi) circuit.selection = { nodes: [current.id], wires: [] }
        if (current.type === 'switch') toggleNode(current.id)
        else if (current.type === 'clock') cycleClockFreq(current.id)
      }
    } else {
      recordHistory()
    }
    drag.value = null
  }
  if (marquee.value) {
    const current = marquee.value
    if (current.moved) {
      const x1 = Math.min(current.ax, current.bx)
      const x2 = Math.max(current.ax, current.bx)
      const y1 = Math.min(current.ay, current.by)
      const y2 = Math.max(current.ay, current.by)
      const hits = circuit.nodes
        .filter(node => {
          if (hiddenNodeIds.value.has(node.id)) return false
          const frame = nodeFrame(node)
          return frame.x < x2 && frame.x + frame.w > x1 && frame.y < y2 && frame.y + frame.h > y1
        })
        .map(node => node.id)
      for (const block of collapsedBlocks.value) {
        if (block.x < x2 && block.x + block.w > x1 && block.y < y2 && block.y + block.h > y1) {
          hits.push(...block.nodes)
        }
      }
      const baseNodes = current.additive ? (circuit.selection?.nodes ?? []) : []
      const baseWires = current.additive ? (circuit.selection?.wires ?? []) : []
      const selected = new Set([...baseNodes, ...hits])
      for (const group of circuit.groups) {
        if (group.nodes.some(id => selected.has(id))) {
          for (const id of group.nodes) selected.add(id)
        }
      }
      const nodes = [...selected]
      circuit.selection = nodes.length || baseWires.length ? { nodes, wires: [...baseWires] } : null
    }
    marquee.value = null
  }
  if (wiring.value) {
    if (hoverIn.value) connect(wiring.value.from, hoverIn.value)
    wiring.value = null
    hoverIn.value = null
  }
  if (svg.value?.hasPointerCapture(ev.pointerId)) svg.value.releasePointerCapture(ev.pointerId)
}

function onWheel(ev: WheelEvent) {
  ev.preventDefault()
  closeMenu()
  const rect = stage.value?.getBoundingClientRect()
  if (!rect) return
  autoFit = false
  const sx = ev.clientX - rect.left
  const sy = ev.clientY - rect.top
  const view = circuit.view
  // Firefox 的行/页模式 deltaY 单位不同，换算成像素
  const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 100 : 1
  const next = clamp(view.zoom * Math.exp(-ev.deltaY * unit * 0.0016), 0.3, 2.5)
  const scale = next / view.zoom
  view.x = sx - (sx - view.x) * scale
  view.y = sy - (sy - view.y) * scale
  view.zoom = next
}

function zoomBy(factor: number) {
  const rect = stage.value?.getBoundingClientRect()
  if (!rect) return
  autoFit = false
  const view = circuit.view
  const next = clamp(view.zoom * factor, 0.3, 2.5)
  const scale = next / view.zoom
  const cx = rect.width / 2
  const cy = rect.height / 2
  view.x = cx - (cx - view.x) * scale
  view.y = cy - (cy - view.y) * scale
  view.zoom = next
}

function zoomIn() {
  zoomBy(1.2)
}

function zoomOut() {
  zoomBy(1 / 1.2)
}

const TOOLBAR_INSET = 108
const TOP_INSET = 96
const BOTTOM_INSET = 64

function fitView() {
  const rect = stage.value?.getBoundingClientRect()
  if (!rect) return
  const availW = Math.max(80, rect.width - TOOLBAR_INSET - 40)
  const availH = Math.max(80, rect.height - TOP_INSET - BOTTOM_INSET)
  if (!circuit.nodes.length) {
    circuit.view.zoom = 1
    circuit.view.x = TOOLBAR_INSET + availW / 2
    circuit.view.y = TOP_INSET + availH / 2
    return
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of circuit.nodes) {
    if (hiddenNodeIds.value.has(node.id)) continue
    const frame = nodeFrame(node)
    minX = Math.min(minX, frame.x - 4)
    minY = Math.min(minY, frame.y - 8)
    maxX = Math.max(maxX, frame.x + frame.w + 4)
    maxY = Math.max(maxY, frame.y + frame.h + 8)
  }
  for (const block of collapsedBlocks.value) {
    minX = Math.min(minX, block.x - 4)
    minY = Math.min(minY, block.y - 8)
    maxX = Math.max(maxX, block.x + block.w + 4)
    maxY = Math.max(maxY, block.y + block.h + 8)
  }
  const width = maxX - minX
  const height = maxY - minY
  // 适应视图刻意限制在 0.35–1.25：小电路不放大到满屏，滚轮仍可继续放大到 2.5
  const zoom = clamp(Math.min(availW / width, availH / height), 0.35, 1.25)
  circuit.view.zoom = zoom
  circuit.view.x = TOOLBAR_INSET + (availW - width * zoom) / 2 - minX * zoom
  circuit.view.y = TOP_INSET + (availH - height * zoom) / 2 - minY * zoom
}

function fitToContent() {
  autoFit = true
  fitView()
}

function addNodeAtClient(type: BasicNodeType, clientX: number, clientY: number): boolean {
  const rect = stage.value?.getBoundingClientRect()
  if (!rect) return false
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return false
  const spec = NODE_SPECS[type]
  const point = toWorld(clientX, clientY)
  addNode(type, point.x - spec.width / 2, point.y - spec.height / 2)
  return true
}

function addNodeCenter(type: BasicNodeType) {
  const rect = stage.value?.getBoundingClientRect()
  if (!rect) return
  const spec = NODE_SPECS[type]
  const point = toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
  addNode(type, point.x - spec.width / 2 + cascade, point.y - spec.height / 2 + cascade)
  cascade = (cascade + 24) % 96
}

function onKey(ev: KeyboardEvent) {
  if (editing.value || renaming.value) return
  if (menu.value) {
    if (ev.key === 'Escape') {
      ev.preventDefault()
      closeMenu()
      return
    }
    if (ev.metaKey || ev.ctrlKey) closeMenu()
    return
  }
  if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === 'a') {
    ev.preventDefault()
    selectAll()
    return
  }
  if (ev.shiftKey && !ev.metaKey && !ev.ctrlKey && !ev.altKey && ev.key.toLowerCase() === 'f') {
    ev.preventDefault()
    const fold = renameTarget.value
    if (fold) unfoldFold(fold.id)
    else toggleSelectionCollapse()
    return
  }
  if (ev.key === 'Enter' || ev.code === 'Space') {
    const id = (ev.target as Element | null)?.closest?.('.node')?.getAttribute('data-id')
    if (id) {
      ev.preventDefault()
      activateNode(id)
      return
    }
  }
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return
  if (ev.code === 'Space') {
    const target = ev.target as HTMLElement | null
    if (target?.closest('button, input, textarea, select, [contenteditable]')) return
    ev.preventDefault()
    spaceHeld.value = true
    return
  }
  if (ev.key === 'Escape') {
    wiring.value = null
    hoverIn.value = null
    marquee.value = null
    circuit.selection = null
    return
  }
  if (ev.key === '0') {
    ev.preventDefault()
    fitToContent()
    return
  }
  if (ev.key === '=' || ev.key === '+') {
    ev.preventDefault()
    zoomIn()
    return
  }
  if (ev.key === '-') {
    ev.preventDefault()
    zoomOut()
    return
  }
  if (ev.key.startsWith('Arrow')) {
    const selection = circuit.selection
    if (selection && selection.nodes.length) {
      ev.preventDefault()
      const step = ev.shiftKey ? 8 : 1
      const dx = ev.key === 'ArrowLeft' ? -step : ev.key === 'ArrowRight' ? step : 0
      const dy = ev.key === 'ArrowUp' ? -step : ev.key === 'ArrowDown' ? step : 0
      nudgeSelection(dx, dy)
    }
    return
  }
  if (ev.key === 'Delete' || ev.key === 'Backspace') {
    const selection = circuit.selection
    if (selection && (selection.nodes.length || selection.wires.length)) {
      ev.preventDefault()
      deleteSelection()
    }
    return
  }
  if (ev.key === 'v' || ev.key === 'V') circuit.tool = 'select'
  if (ev.key === 'h' || ev.key === 'H') circuit.tool = 'pan'
}

function onKeyUp(ev: KeyboardEvent) {
  if (ev.code === 'Space') spaceHeld.value = false
}

function onWindowBlur() {
  spaceHeld.value = false
  closeMenu(false)
}

function beginEdit(id: string) {
  const node = circuit.nodes.find(item => item.id === id)
  if (!node || node.type !== 'text') return
  editing.value = { id, original: node.text ?? '' }
  editValue.value = node.text ?? ''
  nextTick(() => {
    const editor = editorRef.value
    if (!editor) return
    editor.focus()
    editor.select()
  })
}

function commitEdit() {
  const current = editing.value
  if (!current) return
  editing.value = null
  const node = circuit.nodes.find(item => item.id === current.id)
  if (!node) return
  const text = editValue.value.replace(/[ \t]+$/gm, '')
  if (!text.trim()) {
    removeNode(current.id)
    return
  }
  node.text = text
  recordHistory()
}

function cancelEdit() {
  const current = editing.value
  if (!current) return
  editing.value = null
  const node = circuit.nodes.find(item => item.id === current.id)
  if (!node) return
  if (!current.original.trim()) removeNode(current.id)
  else node.text = current.original
}

function onEditorInput(ev: Event) {
  const value = (ev.target as HTMLTextAreaElement).value
  if (editValue.value !== value) editValue.value = value
}

function onEditorKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    ev.preventDefault()
    cancelEdit()
    return
  }
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault()
    commitEdit()
  }
}

function beginRename() {
  const fold = renameTarget.value
  if (!fold) return
  renaming.value = { id: fold.id }
  renameValue.value = fold.label ?? ''
  nextTick(() => {
    const input = renameRef.value
    if (!input) return
    input.focus()
    input.select()
  })
}

function commitRename() {
  const current = renaming.value
  if (!current) return
  renaming.value = null
  renameFold(current.id, renameValue.value)
}

function cancelRename() {
  renaming.value = null
}

function onRenameKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    ev.preventDefault()
    cancelRename()
    return
  }
  if (ev.key === 'Enter') {
    ev.preventDefault()
    commitRename()
  }
}

function onWindowPointerDown(ev: PointerEvent) {
  flushNudge()
  if (menu.value && menuEl.value && !menuEl.value.contains(ev.target as Node)) closeMenu(false)
  if (renaming.value) {
    const target = ev.target as Element | null
    if (!target?.closest('.card-rename')) commitRename()
  }
  if (!editing.value) return
  const target = ev.target as Element | null
  if (target?.closest('.text-editor')) return
  commitEdit()
}

function nodeAtPoint(point: Vec): CircuitNodeData | null {
  for (let index = circuit.nodes.length - 1; index >= 0; index--) {
    const node = circuit.nodes[index]
    if (hiddenNodeIds.value.has(node.id)) continue
    const frame = nodeFrame(node)
    if (
      point.x >= frame.x &&
      point.x <= frame.x + frame.w &&
      point.y >= frame.y &&
      point.y <= frame.y + frame.h
    ) {
      return node
    }
  }
  return null
}

function expandCollapsedBlock(foldId: string) {
  const fold = circuit.folds.find(item => item.id === foldId)
  if (!fold?.collapsed) return
  circuit.selection = { nodes: [...fold.nodes], wires: [] }
  expandFold(foldId)
}

function onSvgDblClick(ev: MouseEvent) {
  // Pointer capture retargets dblclick to the <svg>, so hit-test the world point instead of ev.target.
  const point = toWorld(ev.clientX, ev.clientY)
  const hit = nodeAtPoint(point)
  if (hit) {
    if (groupForNode(hit.id)) circuit.selection = { nodes: [hit.id], wires: [] }
    if (hit.type === 'text') beginEdit(hit.id)
    return
  }
  const overWire = document
    .elementsFromPoint(ev.clientX, ev.clientY)
    .some(element => element.closest('.wire-hit, .wire'))
  if (overWire) return
  const fold = collapsedFoldAtPoint(point)
  if (fold) {
    expandCollapsedBlock(fold.id)
    return
  }
  const openFold = openFoldAtPoint(point)
  if (openFold) {
    circuit.selection = { nodes: [...openFold.nodes], wires: [] }
    return
  }
  const group = visibleGroupAtPoint(point)
  if (group) {
    circuit.selection = { nodes: [...group.nodes], wires: [] }
    return
  }
  const node = addText(point.x, point.y)
  beginEdit(node.id)
}

const editBox = computed(() => {
  const current = editing.value
  if (!current) return null
  const node = circuit.nodes.find(item => item.id === current.id)
  if (!node) return null
  const metrics = textMetrics(editValue.value)
  const view = circuit.view
  const zoom = view.zoom
  const padX = 8
  const padY = 5
  return {
    left: view.x + node.x * zoom - padX * zoom,
    top: view.y + node.y * zoom - padY * zoom,
    width: (metrics.width + 14) * zoom,
    height: (metrics.height + 10) * zoom,
    fontSize: 13 * zoom,
    lineHeight: 18 * zoom,
    paddingTop: (padY - 1) * zoom,
    paddingLeft: padX * zoom,
  }
})

const groupBoxes = computed<GroupBox[]>(() => {
  const boxes: GroupBox[] = []
  for (const group of circuit.groups) {
    if (group.nodes.some(id => hiddenNodeIds.value.has(id))) continue
    const frame = groupFrame(group)
    if (!frame) continue
    const ids = group.nodes.filter(id => circuit.nodes.some(node => node.id === id))
    if (!ids.some(id => isNodeSelected(id))) continue
    boxes.push({ id: group.id, ...frame, selected: ids.every(id => isNodeSelected(id)) })
  }
  return boxes
})

const collapsedFoldByNode = computed(() => {
  const map = new Map<string, string>()
  for (const fold of circuit.folds) {
    if (!fold.collapsed) continue
    for (const id of fold.nodes) map.set(id, fold.id)
  }
  return map
})

const hiddenNodeIds = computed(() => new Set(collapsedFoldByNode.value.keys()))

const visibleNodes = computed(() =>
  circuit.nodes.filter(node => !hiddenNodeIds.value.has(node.id)),
)

interface FoldBox extends GroupFrame {
  id: string
  nodes: string[]
  selected: boolean
  label?: string
}

const foldBoxes = computed<FoldBox[]>(() => {
  const boxes: FoldBox[] = []
  for (const fold of circuit.folds) {
    if (fold.collapsed) continue
    const ids = fold.nodes.filter(id => circuit.nodes.some(node => node.id === id))
    if (ids.length < 2 || ids.some(id => hiddenNodeIds.value.has(id))) continue
    const frame = foldFrame(ids)
    if (!frame) continue
    boxes.push({
      id: fold.id,
      ...frame,
      nodes: ids,
      selected: ids.every(id => isNodeSelected(id)),
      ...(fold.label ? { label: fold.label } : {}),
    })
  }
  return boxes
})

const visibleWires = computed(() =>
  circuit.wires.filter(wire => {
    const fromFold = collapsedFoldByNode.value.get(wire.from.nodeId)
    return !(fromFold && fromFold === collapsedFoldByNode.value.get(wire.to.nodeId))
  }),
)

const COLLAPSED_BLOCK_W = 132
const COLLAPSED_BLOCK_H = 64

type BlockEdge = 'left' | 'right'

interface CollapsedBlock {
  id: string
  x: number
  y: number
  w: number
  h: number
  nodes: string[]
  selected: boolean
  count: number
  label?: string
}

const collapsedBlocks = computed<CollapsedBlock[]>(() => {
  const blocks: CollapsedBlock[] = []
  for (const fold of circuit.folds) {
    if (!fold.collapsed) continue
    const ids = fold.nodes.filter(id => circuit.nodes.some(node => node.id === id))
    if (!ids.length) continue
    const source = nodesFrame(ids)
    if (!source) continue
    blocks.push({
      id: fold.id,
      x: source.x + source.w / 2 - COLLAPSED_BLOCK_W / 2,
      y: source.y + source.h / 2 - COLLAPSED_BLOCK_H / 2,
      w: COLLAPSED_BLOCK_W,
      h: COLLAPSED_BLOCK_H,
      nodes: ids,
      selected: ids.every(id => isNodeSelected(id)),
      count: ids.length,
      ...(fold.label ? { label: fold.label } : {}),
    })
  }
  return blocks
})

const collapsedBlockById = computed(
  () => new Map(collapsedBlocks.value.map(block => [block.id, block])),
)

const renameBox = computed(() => {
  const current = renaming.value
  if (!current) return null
  const zoom = circuit.view.zoom
  const block = collapsedBlockById.value.get(current.id)
  if (block) {
    return {
      left: circuit.view.x + (block.x + 10) * zoom,
      top: circuit.view.y + (block.y + (block.h - 28) / 2) * zoom,
      width: (block.w - 20) * zoom,
      height: 28 * zoom,
      fontSize: 12 * zoom,
      borderRadius: 7 * zoom,
      textAlign: 'center',
    }
  }
  const frame = foldBoxes.value.find(item => item.id === current.id)
  if (!frame) return null
  return {
    left: circuit.view.x + (frame.x + 20) * zoom,
    top: circuit.view.y + (frame.y + 2) * zoom,
    width: (frame.w - 44) * zoom,
    height: 20 * zoom,
    fontSize: 11 * zoom,
    borderRadius: 6 * zoom,
    textAlign: 'center',
  }
})

function blockCaption(block: CollapsedBlock): string {
  const caption = block.label ?? t('group.collapsed', { count: block.count })
  return caption.length > 12 ? `${caption.slice(0, 11)}…` : caption
}

function frameCaption(fold: FoldBox): string {
  const label = fold.label ?? ''
  const max = Math.max(3, Math.floor((fold.w - 64) / 6.2))
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}

const sim = ref<Simulation | null>(null)

watch(
  () => circuit.running,
  running => {
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
    if (!running) {
      sim.value = null
      return
    }
    runtime = createRuntime()
    circuit.time = 0
    sim.value = simulate(circuit.nodes, circuit.wires, runtime, circuit.time)
    timer = window.setInterval(() => {
      circuit.time += TICK
      sim.value = advance(circuit.nodes, circuit.wires, runtime, circuit.time)
    }, TICK)
  },
)

interface WireDraft {
  id: string
  aRaw: Vec
  bRaw: Vec
  aBlock: CollapsedBlock | null
  bBlock: CollapsedBlock | null
  aPoint: Vec
  bPoint: Vec
}

const wireViews = computed(() => {
  const byId = new Map(circuit.nodes.map(node => [node.id, node]))
  const foldByNode = collapsedFoldByNode.value
  const blockById = collapsedBlockById.value

  const drafts: WireDraft[] = []
  for (const wire of visibleWires.value) {
    const aRaw = portPointOf(byId.get(wire.from.nodeId), wire.from.port)
    const bRaw = portPointOf(byId.get(wire.to.nodeId), wire.to.port)
    if (!aRaw || !bRaw) continue
    drafts.push({
      id: wire.id,
      aRaw,
      bRaw,
      aBlock: blockById.get(foldByNode.get(wire.from.nodeId) ?? '') ?? null,
      bBlock: blockById.get(foldByNode.get(wire.to.nodeId) ?? '') ?? null,
      aPoint: aRaw,
      bPoint: bRaw,
    })
  }

  interface AnchorBucket {
    block: CollapsedBlock
    edge: BlockEdge
    items: { draft: WireDraft; side: 'a' | 'b'; key: number }[]
  }
  const buckets = new Map<string, AnchorBucket>()
  const enqueue = (draft: WireDraft, side: 'a' | 'b') => {
    const block = side === 'a' ? draft.aBlock : draft.bBlock
    if (!block) return
    const other = side === 'a' ? draft.bRaw : draft.aRaw
    // 折叠单元的输入统一走左边、输出统一走右边，避免四边开口交织
    const edge: BlockEdge = side === 'a' ? 'right' : 'left'
    const bucketKey = `${block.id}:${edge}`
    let bucket = buckets.get(bucketKey)
    if (!bucket) {
      bucket = { block, edge, items: [] }
      buckets.set(bucketKey, bucket)
    }
    bucket.items.push({ draft, side, key: other.y })
  }
  for (const draft of drafts) {
    if (draft.aBlock) enqueue(draft, 'a')
    if (draft.bBlock) enqueue(draft, 'b')
  }

  // 同一条边上的外部导线按另一端的位置排序后均匀分布，避免收束到同一点
  for (const { block, edge, items } of buckets.values()) {
    items.sort((p, q) => p.key - q.key)
    const margin = Math.min(16, block.h * 0.12)
    const usable = block.h - margin * 2
    items.forEach((item, index) => {
      const along = block.y + margin + (usable * (index + 0.5)) / items.length
      const point =
        edge === 'left'
          ? { x: block.x, y: along }
          : { x: block.x + block.w, y: along }
      if (item.side === 'a') item.draft.aPoint = point
      else item.draft.bPoint = point
    })
  }

  return drafts.map(draft => ({
    id: draft.id,
    d: wirePath(draft.aPoint, draft.bPoint),
    selected: isWireSelected(draft.id),
    on: sim.value?.wires.get(draft.id) === 1,
  }))
})

const ghost = computed(() => {
  const current = wiring.value
  if (!current) return ''
  const fromNode = circuit.nodes.find(item => item.id === current.from.nodeId)
  const from = portPointOf(fromNode, current.from.port)
  if (!from) return ''
  const hover = hoverIn.value
  const hoverNode = hover ? circuit.nodes.find(item => item.id === hover.nodeId) : undefined
  const snapped = hover ? portPointOf(hoverNode, hover.port) : null
  return wirePath(from, snapped ?? { x: current.x, y: current.y })
})

const marqueeBox = computed(() => {
  const current = marquee.value
  if (!current || !current.moved) return null
  return {
    x: Math.min(current.ax, current.bx),
    y: Math.min(current.ay, current.by),
    w: Math.abs(current.bx - current.ax),
    h: Math.abs(current.by - current.ay),
  }
})

const occupied = computed(() => {
  const map = new Map<string, Set<string>>()
  for (const wire of circuit.wires) {
    let set = map.get(wire.to.nodeId)
    if (!set) {
      set = new Set()
      map.set(wire.to.nodeId, set)
    }
    set.add(wire.to.port)
  }
  return map
})

const outUsed = computed(() => {
  const map = new Map<string, string[]>()
  for (const wire of circuit.wires) {
    const list = map.get(wire.from.nodeId)
    if (list) list.push(wire.from.port)
    else map.set(wire.from.nodeId, [wire.from.port])
  }
  return map
})

function connectedIns(nodeId: string): string[] {
  const set = occupied.value.get(nodeId)
  return set ? [...set] : []
}

function connectedOuts(nodeId: string): string[] {
  return outUsed.value.get(nodeId) ?? []
}

function hoverPortOf(nodeId: string): string | null {
  const current = hoverIn.value
  return current && current.nodeId === nodeId ? current.port : null
}

function inValuesFor(node: CircuitNodeData): Record<string, Bit> {
  const values: Record<string, Bit> = {}
  const current = sim.value
  if (!current) return values
  for (const port of NODE_SPECS[node.type].ins) {
    const value = current.ins.get(`${node.id}:${port.id}`)
    if (value !== undefined) values[port.id] = value
  }
  return values
}

function outValuesFor(node: CircuitNodeData): Record<string, Bit> {
  const values: Record<string, Bit> = {}
  const current = sim.value
  if (!current) return values
  for (const port of NODE_SPECS[node.type].outs) {
    const value = current.outs.get(`${node.id}:${port.id}`)
    if (value !== undefined) values[port.id] = value
  }
  return values
}

onMounted(() => {
  fitView()
  observer = new ResizeObserver(() => {
    if (autoFit) fitView()
  })
  if (stage.value) observer.observe(stage.value)
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('resize', onWindowResize)
  window.addEventListener('pointerdown', onWindowPointerDown, true)
})

onBeforeUnmount(() => {
  if (timer !== undefined) clearInterval(timer)
  observer?.disconnect()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('pointerdown', onWindowPointerDown, true)
})

defineExpose({
  addNodeAtClient,
  addNodeCenter,
  zoomIn,
  zoomOut,
  fitView: fitToContent,
})
</script>

<template>
  <div
    ref="stage"
    class="stage"
    tabindex="-1"
    :class="{
      'tool-pan': circuit.tool === 'pan' || spaceHeld,
      'is-panning': panning,
    }"
    :style="gridStyle"
  >
    <svg
      ref="svg"
      class="scene"
      @pointerdown="onSvgDown"
      @pointermove="onSvgMove"
      @pointerup="onSvgUp"
      @pointercancel="onSvgUp"
      @dblclick="onSvgDblClick"
      @contextmenu.prevent="onCanvasMenu"
      @wheel.prevent="onWheel"
    >
      <g :transform="`translate(${circuit.view.x} ${circuit.view.y}) scale(${circuit.view.zoom})`">
        <rect
          v-for="group in groupBoxes"
          :key="group.id"
          class="group-box"
          :class="{ selected: group.selected }"
          :x="group.x"
          :y="group.y"
          :width="group.w"
          :height="group.h"
          rx="14"
          vector-effect="non-scaling-stroke"
        />
        <g
          v-for="wire in wireViews"
          :key="wire.id"
          @pointerdown="onWireDown($event, wire.id)"
          @contextmenu.stop.prevent="onWireMenu($event, wire.id)"
        >
          <path :d="wire.d" class="wire-hit" />
          <path
            :d="wire.d"
            class="wire"
            :class="{
              selected: wire.selected,
              on: wire.on,
            }"
          />
        </g>
        <path v-if="ghost" :d="ghost" class="wire ghost" />
        <g
          v-for="block in collapsedBlocks"
          :key="block.id"
          class="collapsed-block"
          :class="{ selected: block.selected }"
          role="button"
          tabindex="0"
          :aria-label="`${block.label ?? t('group.collapsed', { count: block.count })} · ${t('menu.expand')}`"
          @keydown.enter.prevent.stop="expandCollapsedBlock(block.id)"
          @keydown.space.prevent.stop="expandCollapsedBlock(block.id)"
        >
          <title>{{ block.label ? `${block.label} · ${t('group.expandHint')}` : t('group.expandHint') }}</title>
          <rect
            :x="block.x"
            :y="block.y"
            :width="block.w"
            :height="block.h"
            rx="14"
            vector-effect="non-scaling-stroke"
          />
          <text
            class="collapsed-label"
            :x="block.x + block.w / 2"
            :y="block.y + block.h / 2 + 4"
            text-anchor="middle"
          >{{ blockCaption(block) }}</text>
          <g
            class="card-toggle"
            role="button"
            tabindex="0"
            :aria-label="t('menu.expand')"
            @pointerdown.stop
            @click.stop="expandCollapsedBlock(block.id)"
            @dblclick.stop.prevent
            @keydown.enter.prevent.stop="expandCollapsedBlock(block.id)"
            @keydown.space.prevent.stop="expandCollapsedBlock(block.id)"
          >
            <title>{{ t('menu.expand') }}</title>
            <circle
              :cx="block.x + block.w - 12"
              :cy="block.y + 12"
              r="8"
              vector-effect="non-scaling-stroke"
            />
            <path
              :d="`M ${block.x + block.w - 15.5} ${block.y + 12} H ${block.x + block.w - 8.5} M ${block.x + block.w - 12} ${block.y + 8.5} V ${block.y + 15.5}`"
            />
          </g>
        </g>
        <CircuitNode
          v-for="node in visibleNodes"
          :key="node.id"
          :node="node"
          :selected="isNodeSelected(node.id)"
          :connected-ins="connectedIns(node.id)"
          :connected-outs="connectedOuts(node.id)"
          :hover-port="hoverPortOf(node.id)"
          :running="circuit.running"
          :editing="editing?.id === node.id"
          :editing-text="editing?.id === node.id ? editValue : undefined"
          :in-values="inValuesFor(node)"
          :out-values="outValuesFor(node)"
          @bodydown="onNodeDown"
          @portdown="onPortDown"
          @edit="beginEdit"
          @menu="onNodeMenu"
        />
        <g
          v-for="fold in foldBoxes"
          :key="`fold-${fold.id}`"
          class="fold-box"
          :class="{ selected: fold.selected }"
        >
          <rect
            class="fold-frame"
            :x="fold.x"
            :y="fold.y"
            :width="fold.w"
            :height="fold.h"
            rx="14"
            vector-effect="non-scaling-stroke"
          />
          <text
            v-if="fold.label && renaming?.id !== fold.id"
            class="fold-label"
            :x="fold.x + fold.w / 2"
            :y="fold.y + 14"
            text-anchor="middle"
          >{{ frameCaption(fold) }}</text>
          <g
            class="fold-toggle"
            role="button"
            tabindex="0"
            :aria-label="t('menu.collapse')"
            @pointerdown.stop
            @click.stop="collapseFold(fold.id)"
            @dblclick.stop.prevent
            @keydown.enter.prevent.stop="collapseFold(fold.id)"
            @keydown.space.prevent.stop="collapseFold(fold.id)"
          >
            <title>{{ t('menu.collapse') }}</title>
            <circle
              :cx="fold.x + fold.w - 15"
              :cy="fold.y + 15"
              r="8"
              vector-effect="non-scaling-stroke"
            />
            <path :d="`M ${fold.x + fold.w - 18.5} ${fold.y + 15} H ${fold.x + fold.w - 11.5}`" />
          </g>
        </g>
        <rect
          v-if="marqueeBox"
          class="marquee"
          :x="marqueeBox.x"
          :y="marqueeBox.y"
          :width="marqueeBox.w"
          :height="marqueeBox.h"
          vector-effect="non-scaling-stroke"
        />
      </g>
    </svg>

    <textarea
      v-if="editBox"
      ref="editorRef"
      v-model="editValue"
      class="text-editor"
      spellcheck="false"
      wrap="off"
      :style="{
        left: `${editBox.left}px`,
        top: `${editBox.top}px`,
        width: `${editBox.width}px`,
        height: `${editBox.height}px`,
        fontSize: `${editBox.fontSize}px`,
        lineHeight: `${editBox.lineHeight}px`,
        paddingTop: `${editBox.paddingTop}px`,
        paddingLeft: `${editBox.paddingLeft}px`,
      }"
      @pointerdown.stop
      @input="onEditorInput"
      @keydown.stop="onEditorKey"
      @blur="commitEdit"
    />

    <input
      v-if="renameBox"
      ref="renameRef"
      v-model="renameValue"
      class="card-rename"
      type="text"
      maxlength="24"
      spellcheck="false"
      :style="{
        left: `${renameBox.left}px`,
        top: `${renameBox.top}px`,
        width: `${renameBox.width}px`,
        height: `${renameBox.height}px`,
        fontSize: `${renameBox.fontSize}px`,
        borderRadius: `${renameBox.borderRadius}px`,
        textAlign: renameBox.textAlign as 'left' | 'center',
      }"
      @pointerdown.stop
      @keydown.stop="onRenameKey"
      @blur="commitRename"
    />

    <Teleport to="body">
      <Transition name="ctx">
        <div
          v-if="menu"
          ref="menuEl"
          class="ctx-menu"
          role="menu"
          :aria-label="t('menu.actions')"
          :style="{ left: `${menuPos.left}px`, top: `${menuPos.top}px` }"
          @pointerdown.stop
          @contextmenu.prevent
          @keydown="onMenuKeydown"
        >
          <template v-for="(item, index) in menuItems" :key="item.id">
            <div v-if="item.separatorBefore && index > 0" class="ctx-sep" />
            <button
              class="ctx-item"
              :class="{ danger: item.danger }"
              role="menuitem"
              :disabled="item.disabled"
              @click="runMenu(item.id)"
            >
              <svg viewBox="0 0 24 24" class="ctx-icon" aria-hidden="true">
                <template v-if="item.icon === 'group'">
                  <rect x="3.5" y="3.5" width="17" height="17" rx="3" stroke-dasharray="3 2.4" />
                  <rect x="7" y="7" width="4" height="4" rx="1" />
                  <rect x="13" y="13" width="4" height="4" rx="1" />
                </template>
                <template v-else-if="item.icon === 'ungroup'">
                  <rect x="4" y="4" width="7" height="7" rx="1.5" />
                  <rect x="13" y="13" width="7" height="7" rx="1.5" />
                  <path d="M13.5 5.5h4v4M10.5 18.5h-4v-4" />
                </template>
                <template v-else-if="item.icon === 'collapse'">
                  <rect x="3.5" y="3.5" width="17" height="17" rx="3" stroke-dasharray="3 2.4" />
                  <path d="M7.5 12h9" />
                </template>
                <template v-else-if="item.icon === 'expand'">
                  <rect x="3.5" y="3.5" width="17" height="17" rx="3" stroke-dasharray="3 2.4" />
                  <path d="M12 7.5v9M7.5 12h9" />
                </template>
                <template v-else-if="item.icon === 'unfold'">
                  <rect x="3.5" y="3.5" width="17" height="17" rx="3" stroke-dasharray="3 2.4" />
                  <path d="M9.5 14.5 6 18M6 18h3.4M6 18v-3.4M14.5 9.5 18 6M18 6h-3.4M18 6v3.4" />
                </template>
                <template v-else-if="item.icon === 'rename'">
                  <path d="M4.5 19.5h3.8l10-10a2.1 2.1 0 0 0-3-3l-10 10v3Z" />
                  <path d="M14.4 5.6l3 3" />
                </template>
                <template v-else-if="item.icon === 'cut'">
                  <circle cx="6.5" cy="6.5" r="2.5" />
                  <circle cx="6.5" cy="17.5" r="2.5" />
                  <path d="M8.7 7.7 19 17M8.7 16.3 19 7" />
                </template>
                <template v-else-if="item.icon === 'copy'">
                  <rect x="8.5" y="8.5" width="10" height="11" rx="2" />
                  <path d="M5.5 15.5V6.5A2 2 0 0 1 7.5 4.5h7" />
                </template>
                <template v-else-if="item.icon === 'paste'">
                  <rect x="6" y="5" width="12" height="16" rx="2" />
                  <path d="M9 5V3.8A1.3 1.3 0 0 1 10.3 2.5h3.4A1.3 1.3 0 0 1 15 3.8V5M9 11h6M9 15h4" />
                </template>
                <template v-else-if="item.icon === 'duplicate'">
                  <rect x="4.5" y="4.5" width="10" height="12" rx="2" />
                  <rect x="9.5" y="8.5" width="10" height="11" rx="2" />
                </template>
                <template v-else>
                  <path
                    d="M4.5 7h15M9.5 7V4.8h5V7M7 7l.8 12h8.4L17 7M10.5 10.5V16M13.5 10.5V16"
                  />
                </template>
              </svg>
              <span>{{ item.label }}</span>
              <span v-if="item.shortcut" class="ctx-shortcut">{{ item.shortcut }}</span>
            </button>
          </template>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  background-color: var(--bg);
  background-image: radial-gradient(circle, var(--dot) 1.1px, rgba(0, 0, 0, 0) 1.2px);
  cursor: default;
  outline: none;
}

.stage.tool-pan {
  cursor: grab;
}

.stage.tool-pan:active {
  cursor: grabbing;
}

.stage.tool-pan .scene {
  cursor: grab;
}

.stage.tool-pan :deep(.node),
.stage.tool-pan :deep(.pin-hit) {
  cursor: grab;
}

.stage.is-panning,
.stage.is-panning .scene,
.stage.is-panning :deep(.node),
.stage.is-panning :deep(.pin-hit) {
  cursor: grabbing;
}

.scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.text-editor {
  position: absolute;
  z-index: 5;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ink);
  caret-color: var(--accent);
  font-family: inherit;
  font-weight: 400;
  white-space: pre;
  resize: none;
  overflow: hidden;
  outline: none;
}

.card-rename {
  position: absolute;
  z-index: 6;
  margin: 0;
  padding: 0 8px;
  box-sizing: border-box;
  border: 1px solid var(--accent);
  background: var(--panel-solid);
  color: var(--ink);
  caret-color: var(--accent);
  font-family: inherit;
  font-weight: 500;
  text-align: center;
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.group-box {
  fill: rgba(108, 121, 220, 0.025);
  stroke: rgba(108, 121, 220, 0.3);
  stroke-width: 1.1;
  stroke-dasharray: 6 5;
  pointer-events: none;
  transition:
    fill 0.12s,
    stroke 0.12s;
}

.group-box.selected {
  fill: rgba(108, 121, 220, 0.06);
  stroke: var(--accent);
  stroke-width: 1.4;
}

.fold-box {
  pointer-events: none;
}

.fold-frame {
  fill: rgba(74, 156, 138, 0.035);
  stroke: rgba(74, 156, 138, 0.48);
  stroke-width: 1.1;
  stroke-dasharray: 6 5;
  transition:
    fill 0.12s,
    stroke 0.12s;
}

.fold-box.selected .fold-frame {
  fill: rgba(74, 156, 138, 0.075);
  stroke: #4a9c8a;
  stroke-width: 1.4;
}

.fold-label {
  fill: #3f8d7c;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.2px;
  pointer-events: none;
  user-select: none;
}

.fold-toggle,
.card-toggle {
  pointer-events: all;
  cursor: pointer;
  outline: none;
}

.fold-toggle circle {
  fill: var(--panel-solid);
  stroke: rgba(74, 156, 138, 0.62);
  stroke-width: 1.2;
}

.fold-toggle path {
  fill: none;
  stroke: #3f8d7c;
  stroke-width: 1.7;
  stroke-linecap: round;
}

.fold-toggle:hover circle {
  fill: #e8f4f1;
}

.fold-toggle:focus-visible circle {
  stroke: #347f70;
  stroke-width: 2;
}

.card-toggle circle {
  fill: var(--panel-solid);
  stroke: rgba(74, 156, 138, 0.62);
  stroke-width: 1.2;
}

.card-toggle path {
  fill: none;
  stroke: #3f8d7c;
  stroke-width: 1.7;
  stroke-linecap: round;
}

.card-toggle:hover circle {
  fill: #e8f4f1;
}

.card-toggle:focus-visible circle {
  stroke: #347f70;
  stroke-width: 2;
}

.collapsed-block rect {
  fill: rgba(74, 156, 138, 0.055);
  stroke: rgba(74, 156, 138, 0.55);
  stroke-width: 1.2;
  stroke-dasharray: 6 4;
  transition:
    fill 0.12s,
    stroke 0.12s;
}

.collapsed-block:focus {
  outline: none;
}

.collapsed-block:focus-visible rect {
  stroke: #3f8d7c;
  stroke-width: 1.6;
}

.collapsed-block.selected rect {
  fill: rgba(74, 156, 138, 0.14);
  stroke: #4a9c8a;
  stroke-width: 1.4;
}

.collapsed-label {
  fill: var(--ink-faint);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.2px;
  pointer-events: none;
  user-select: none;
}

.collapsed-block.selected .collapsed-label {
  fill: #347f70;
}

.wire {
  fill: none;
  stroke: #99a1b3;
  stroke-width: 1.8;
  stroke-linecap: round;
  transition: stroke 0.12s;
}

.wire.on {
  stroke: var(--signal);
  stroke-width: 2;
}

.wire.selected {
  stroke: var(--accent);
  stroke-width: 2.2;
}

.wire-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 14;
}

.wire.ghost {
  stroke: var(--accent);
  stroke-width: 1.8;
  stroke-dasharray: 7 6;
  opacity: 0.85;
  pointer-events: none;
}

.marquee {
  fill: rgba(108, 121, 220, 0.08);
  stroke: var(--accent);
  stroke-width: 1px;
  stroke-dasharray: 5 4;
  pointer-events: none;
}

.ctx-menu {
  position: fixed;
  z-index: 50;
  min-width: 176px;
  padding: 5px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow:
    0 16px 40px rgba(35, 40, 60, 0.14),
    var(--shadow-soft);
  backdrop-filter: blur(18px);
  user-select: none;
}

.ctx-item {
  display: flex;
  width: 100%;
  height: 32px;
  align-items: center;
  gap: 9px;
  padding: 0 9px;
  border-radius: 8px;
  color: var(--ink-soft);
  font-size: 12.5px;
  text-align: left;
  transition:
    background 0.12s,
    color 0.12s;
}

.ctx-item:hover,
.ctx-item:focus-visible {
  background: #f2f3f7;
  color: var(--ink);
  outline: none;
}

.ctx-item:disabled,
.ctx-item:disabled:hover {
  background: transparent;
  color: var(--ink-faint);
  opacity: 0.55;
  cursor: default;
}

.ctx-item.danger {
  color: #b2605b;
}

.ctx-item.danger:hover,
.ctx-item.danger:focus-visible {
  background: #fbf1f1;
  color: #a4534e;
}

.ctx-icon {
  width: 15px;
  height: 15px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ctx-shortcut {
  margin-left: 20px;
  color: var(--ink-faint);
  font-size: 10.5px;
  letter-spacing: 0.2px;
}

.ctx-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--line);
}

.ctx-enter-active,
.ctx-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}

.ctx-enter-from,
.ctx-leave-to {
  opacity: 0;
  transform: translateY(-3px) scale(0.98);
}
</style>
