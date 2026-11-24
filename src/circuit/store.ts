import { reactive } from 'vue'
import type {
  BasicNodeType,
  CircuitFold,
  CircuitGroup,
  CircuitNode,
  Selection,
  Tool,
  ViewState,
  Wire,
  WireEnd,
} from '../types'
import type { CircuitData } from './persist'
import { loadStoredCircuit, saveStoredCircuit } from './persist'

let nodeSeq = 0
let wireSeq = 0
let groupSeq = 0
let foldSeq = 0

interface Snapshot {
  nodes: CircuitNode[]
  wires: Wire[]
  groups: CircuitGroup[]
  folds: CircuitFold[]
  selection: Selection | null
}

const HISTORY_LIMIT = 60

export const historyState = reactive({ canUndo: false, canRedo: false })

let past: Snapshot[] = []
let future: Snapshot[] = []
let committed: Snapshot = { nodes: [], wires: [], groups: [], folds: [], selection: null }
let committedKey = ''
let nudgeBase: Snapshot | null = null
let nudgeTimer: number | undefined

function cloneNodes(nodes: CircuitNode[]): CircuitNode[] {
  return nodes.map(node => ({ ...node }))
}

function cloneWires(wires: Wire[]): Wire[] {
  return wires.map(wire => ({ ...wire, from: { ...wire.from }, to: { ...wire.to } }))
}

function cloneGroups(groups: CircuitGroup[]): CircuitGroup[] {
  return groups.map(group => ({ id: group.id, nodes: [...group.nodes] }))
}

function cloneFolds(folds: CircuitFold[]): CircuitFold[] {
  return folds.map(fold => ({
    id: fold.id,
    nodes: [...fold.nodes],
    ...(fold.collapsed ? { collapsed: true } : {}),
    ...(fold.label ? { label: fold.label } : {}),
  }))
}

function cloneSelection(selection: Selection): Selection {
  return { nodes: [...selection.nodes], wires: [...selection.wires] }
}

function takeSnapshot(): Snapshot {
  return {
    nodes: cloneNodes(circuit.nodes),
    wires: cloneWires(circuit.wires),
    groups: cloneGroups(circuit.groups),
    folds: cloneFolds(circuit.folds),
    selection: circuit.selection ? cloneSelection(circuit.selection) : null,
  }
}

function snapshotKey(snapshot: Snapshot): string {
  return JSON.stringify({
    nodes: snapshot.nodes,
    wires: snapshot.wires,
    groups: snapshot.groups,
    folds: snapshot.folds,
  })
}

function syncHistoryFlags() {
  historyState.canUndo = past.length > 0
  historyState.canRedo = future.length > 0
}

let persistTimer: number | undefined

function schedulePersist() {
  if (typeof window === 'undefined') return
  if (persistTimer !== undefined) window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    persistTimer = undefined
    saveStoredCircuit(circuit.nodes, circuit.wires, circuit.groups, circuit.folds)
  }, 250)
}

function applySnapshot(snapshot: Snapshot) {
  circuit.nodes = cloneNodes(snapshot.nodes)
  circuit.wires = cloneWires(snapshot.wires)
  circuit.groups = cloneGroups(snapshot.groups)
  circuit.folds = cloneFolds(snapshot.folds)
  circuit.selection = snapshot.selection ? cloneSelection(snapshot.selection) : null
}

export function recordHistory() {
  const snapshot = takeSnapshot()
  const key = snapshotKey(snapshot)
  if (key === committedKey) return
  past.push(committed)
  if (past.length > HISTORY_LIMIT) past.shift()
  committed = snapshot
  committedKey = key
  future = []
  syncHistoryFlags()
  schedulePersist()
}

function commitNudge() {
  if (nudgeTimer !== undefined) {
    window.clearTimeout(nudgeTimer)
    nudgeTimer = undefined
  }
  const base = nudgeBase
  nudgeBase = null
  if (!base) return
  const snapshot = takeSnapshot()
  const key = snapshotKey(snapshot)
  if (key === committedKey) return
  past.push(base)
  if (past.length > HISTORY_LIMIT) past.shift()
  committed = snapshot
  committedKey = key
  future = []
  syncHistoryFlags()
  schedulePersist()
}

export function flushNudge() {
  if (nudgeBase) commitNudge()
}

export function nudgeSelection(dx: number, dy: number) {
  const selection = circuit.selection
  if (!selection || !selection.nodes.length) return
  const ids = new Set(selection.nodes)
  let moved = false
  for (const node of circuit.nodes) {
    if (!ids.has(node.id)) continue
    node.x += dx
    node.y += dy
    moved = true
  }
  if (!moved) return
  if (!nudgeBase) {
    nudgeBase = {
      nodes: cloneNodes(committed.nodes),
      wires: cloneWires(committed.wires),
      groups: cloneGroups(committed.groups),
      folds: cloneFolds(committed.folds),
      selection: circuit.selection ? cloneSelection(circuit.selection) : null,
    }
  }
  if (nudgeTimer !== undefined) window.clearTimeout(nudgeTimer)
  nudgeTimer = window.setTimeout(() => {
    nudgeTimer = undefined
    commitNudge()
  }, 250)
}

export function undo() {
  flushNudge()
  const previous = past.pop()
  if (!previous) return
  future.push(committed)
  committed = previous
  committedKey = snapshotKey(previous)
  applySnapshot(previous)
  syncHistoryFlags()
  schedulePersist()
}

export function redo() {
  flushNudge()
  const next = future.pop()
  if (!next) return
  past.push(committed)
  committed = next
  committedKey = snapshotKey(next)
  applySnapshot(next)
  syncHistoryFlags()
  schedulePersist()
}

export const circuit = reactive({
  nodes: [] as CircuitNode[],
  wires: [] as Wire[],
  groups: [] as CircuitGroup[],
  folds: [] as CircuitFold[],
  selection: null as Selection | null,
  tool: 'select' as Tool,
  running: false,
  time: 0,
  view: { x: 0, y: 0, zoom: 1 } as ViewState,
})

export const CLOCK_RATES = [0.5, 1, 2, 4]

export function addNode(type: BasicNodeType, x: number, y: number): CircuitNode {
  flushNudge()
  const node: CircuitNode = { id: `n${++nodeSeq}`, type, x: Math.round(x), y: Math.round(y), value: 0 }
  if (type === 'clock') node.freq = 1
  circuit.nodes.push(node)
  circuit.selection = { nodes: [node.id], wires: [] }
  recordHistory()
  return node
}

export function addText(x: number, y: number): CircuitNode {
  flushNudge()
  const node: CircuitNode = {
    id: `n${++nodeSeq}`,
    type: 'text',
    x: Math.round(x),
    y: Math.round(y),
    value: 0,
    text: '',
  }
  circuit.nodes.push(node)
  circuit.selection = { nodes: [node.id], wires: [] }
  return node
}

function pruneSelection() {
  const selection = circuit.selection
  if (!selection) return
  const nodes = selection.nodes.filter(id => circuit.nodes.some(node => node.id === id))
  const wires = selection.wires.filter(id => circuit.wires.some(wire => wire.id === id))
  circuit.selection = nodes.length || wires.length ? { nodes, wires } : null
}

function pruneGroups() {
  const existing = new Set(circuit.nodes.map(node => node.id))
  circuit.groups = circuit.groups
    .map(group => ({ ...group, nodes: group.nodes.filter(id => existing.has(id)) }))
    .filter(group => group.nodes.length >= 2)
}

function pruneFolds() {
  const existing = new Set(circuit.nodes.map(node => node.id))
  circuit.folds = circuit.folds
    .map(fold => ({ ...fold, nodes: fold.nodes.filter(id => existing.has(id)) }))
    .filter(fold => fold.nodes.length >= 2)
}

export function removeNode(id: string) {
  flushNudge()
  circuit.nodes = circuit.nodes.filter(node => node.id !== id)
  circuit.wires = circuit.wires.filter(wire => wire.from.nodeId !== id && wire.to.nodeId !== id)
  pruneGroups()
  pruneFolds()
  pruneSelection()
  recordHistory()
}

export function removeWire(id: string) {
  flushNudge()
  circuit.wires = circuit.wires.filter(wire => wire.id !== id)
  pruneSelection()
  recordHistory()
}

export function connect(from: WireEnd, to: WireEnd) {
  if (from.nodeId === to.nodeId) return
  flushNudge()
  circuit.wires = circuit.wires.filter(wire => !(wire.to.nodeId === to.nodeId && wire.to.port === to.port))
  circuit.wires.push({ id: `w${++wireSeq}`, from: { ...from }, to: { ...to } })
  recordHistory()
}

export function selectAll() {
  if (!circuit.nodes.length && !circuit.wires.length) {
    circuit.selection = null
    return
  }
  circuit.selection = {
    nodes: circuit.nodes.map(node => node.id),
    wires: circuit.wires.map(wire => wire.id),
  }
}

export function deleteSelection() {
  const selection = circuit.selection
  if (!selection || (!selection.nodes.length && !selection.wires.length)) return
  flushNudge()
  const nodeIds = new Set(selection.nodes)
  const wireIds = new Set(selection.wires)
  circuit.nodes = circuit.nodes.filter(node => !nodeIds.has(node.id))
  circuit.wires = circuit.wires.filter(
    wire =>
      !wireIds.has(wire.id) && !nodeIds.has(wire.from.nodeId) && !nodeIds.has(wire.to.nodeId),
  )
  pruneGroups()
  pruneFolds()
  circuit.selection = null
  recordHistory()
}

export function groupSelection() {
  const selection = circuit.selection
  if (!selection || selection.nodes.length < 2) return
  flushNudge()
  const nodes = new Set(selection.nodes)
  let expanded = true
  while (expanded) {
    expanded = false
    for (const group of circuit.groups) {
      if (!group.nodes.some(id => nodes.has(id))) continue
      for (const id of group.nodes) {
        if (nodes.has(id)) continue
        nodes.add(id)
        expanded = true
      }
    }
  }
  if (nodes.size < 2) return
  circuit.groups = circuit.groups.filter(group => !group.nodes.some(id => nodes.has(id)))
  circuit.groups.push({ id: `g${++groupSeq}`, nodes: [...nodes] })
  circuit.selection = { nodes: [...nodes], wires: [] }
  recordHistory()
}

export function ungroupSelection() {
  const selection = circuit.selection
  if (!selection || !selection.nodes.length) return
  const selected = new Set(selection.nodes)
  const groups = circuit.groups.filter(group => group.nodes.some(id => selected.has(id)))
  if (!groups.length) return
  flushNudge()
  const removed = new Set(groups.map(group => group.id))
  circuit.groups = circuit.groups.filter(group => !removed.has(group.id))
  const nodes = new Set(selection.nodes)
  for (const group of groups) {
    for (const id of group.nodes) nodes.add(id)
  }
  circuit.selection = { nodes: [...nodes], wires: [...selection.wires] }
  recordHistory()
}

function selectedFold(): CircuitFold | null {
  const selection = circuit.selection
  if (!selection || selection.nodes.length < 2) return null
  const selected = new Set(selection.nodes)
  return (
    circuit.folds.find(
      fold => fold.nodes.length === selected.size && fold.nodes.every(id => selected.has(id)),
    ) ?? null
  )
}

export function collapseMode(): 'collapse' | 'expand' | null {
  if (selectedFold()) return 'expand'
  return (circuit.selection?.nodes.length ?? 0) >= 2 ? 'collapse' : null
}

export function toggleSelectionCollapse() {
  const fold = selectedFold()
  if (fold) {
    unfoldFold(fold.id)
    return
  }
  const selection = circuit.selection
  if (!selection || selection.nodes.length < 2) return
  flushNudge()
  const nodes = new Set(selection.nodes)
  let grew = true
  while (grew) {
    grew = false
    for (const item of circuit.folds) {
      if (!item.nodes.some(id => nodes.has(id))) continue
      for (const id of item.nodes) {
        if (nodes.has(id)) continue
        nodes.add(id)
        grew = true
      }
    }
  }
  const absorbed = circuit.folds.filter(item => item.nodes.some(id => nodes.has(id)))
  const label = absorbed.length === 1 ? absorbed[0].label : undefined
  circuit.folds = circuit.folds.filter(item => !item.nodes.some(id => nodes.has(id)))
  circuit.folds.push({
    id: `f${++foldSeq}`,
    nodes: [...nodes],
    ...(label ? { label } : {}),
  })
  circuit.selection = { nodes: [...nodes], wires: [] }
  recordHistory()
}

export function collapseFold(foldId: string) {
  const fold = circuit.folds.find(item => item.id === foldId)
  if (!fold || fold.collapsed) return
  flushNudge()
  fold.collapsed = true
  circuit.selection = { nodes: [...fold.nodes], wires: [] }
  recordHistory()
}

export function expandFold(foldId: string) {
  const fold = circuit.folds.find(item => item.id === foldId)
  if (!fold?.collapsed) return
  flushNudge()
  delete fold.collapsed
  circuit.selection = { nodes: [...fold.nodes], wires: [] }
  recordHistory()
}

export function unfoldFold(foldId: string) {
  const fold = circuit.folds.find(item => item.id === foldId)
  if (!fold) return
  flushNudge()
  circuit.folds = circuit.folds.filter(item => item.id !== foldId)
  circuit.selection = { nodes: [...fold.nodes], wires: [] }
  recordHistory()
}

export function renameFold(foldId: string, label: string) {
  const fold = circuit.folds.find(item => item.id === foldId)
  if (!fold) return
  const next = label.trim()
  if ((fold.label ?? '') === next) return
  flushNudge()
  if (next) fold.label = next
  else delete fold.label
  recordHistory()
}

interface ClipboardData {
  nodes: CircuitNode[]
  wires: Wire[]
  groups: CircuitGroup[]
  folds: CircuitFold[]
}

let clipboard: ClipboardData | null = null
let pasteCount = 0

export const clipboardState = reactive({ hasData: false })

export function copySelection() {
  const selection = circuit.selection
  if (!selection || !selection.nodes.length) return
  const ids = new Set(selection.nodes)
  clipboard = {
    nodes: circuit.nodes.filter(node => ids.has(node.id)).map(node => ({ ...node })),
    wires: cloneWires(
      circuit.wires.filter(wire => ids.has(wire.from.nodeId) && ids.has(wire.to.nodeId)),
    ),
    groups: circuit.groups
      .filter(group => group.nodes.every(id => ids.has(id)))
      .map(group => ({ id: group.id, nodes: [...group.nodes] })),
    folds: circuit.folds
      .filter(fold => fold.nodes.every(id => ids.has(id)))
      .map(fold => ({
        id: fold.id,
        nodes: [...fold.nodes],
        ...(fold.collapsed ? { collapsed: true } : {}),
        ...(fold.label ? { label: fold.label } : {}),
      })),
  }
  clipboardState.hasData = clipboard.nodes.length > 0
  pasteCount = 0
}

export function cutSelection() {
  const selection = circuit.selection
  if (!selection || !selection.nodes.length) return
  copySelection()
  deleteSelection()
}

export function pasteClipboard() {
  const data = clipboard
  if (!data || !data.nodes.length) return
  flushNudge()
  pasteCount += 1
  const offset = 24 * pasteCount
  const idMap = new Map<string, string>()
  const nodes = data.nodes.map(node => {
    const id = `n${++nodeSeq}`
    idMap.set(node.id, id)
    return { ...node, id, x: node.x + offset, y: node.y + offset }
  })
  const wires: Wire[] = data.wires.map(wire => ({
    id: `w${++wireSeq}`,
    from: { nodeId: idMap.get(wire.from.nodeId)!, port: wire.from.port },
    to: { nodeId: idMap.get(wire.to.nodeId)!, port: wire.to.port },
  }))
  const groups: CircuitGroup[] = data.groups
    .map(group => ({
      id: `g${++groupSeq}`,
      nodes: group.nodes.map(id => idMap.get(id)).filter((id): id is string => Boolean(id)),
    }))
    .filter(group => group.nodes.length >= 2)
  const folds: CircuitFold[] = data.folds
    .map(fold => ({
      id: `f${++foldSeq}`,
      nodes: fold.nodes.map(id => idMap.get(id)).filter((id): id is string => Boolean(id)),
      ...(fold.collapsed ? { collapsed: true } : {}),
      ...(fold.label ? { label: fold.label } : {}),
    }))
    .filter(fold => fold.nodes.length >= 2)
  circuit.nodes.push(...nodes)
  circuit.wires.push(...wires)
  circuit.groups.push(...groups)
  circuit.folds.push(...folds)
  circuit.selection = {
    nodes: nodes.map(node => node.id),
    wires: wires.map(wire => wire.id),
  }
  recordHistory()
}

export function duplicateSelection() {
  copySelection()
  pasteClipboard()
}

export function clearCircuit() {
  flushNudge()
  circuit.nodes = []
  circuit.wires = []
  circuit.groups = []
  circuit.folds = []
  circuit.selection = null
  circuit.running = false
  recordHistory()
}

function syncSequences() {
  let maxNode = nodeSeq
  let maxWire = wireSeq
  let maxGroup = groupSeq
  let maxFold = foldSeq
  for (const node of circuit.nodes) {
    const match = /^n(\d+)$/.exec(node.id)
    if (match) maxNode = Math.max(maxNode, Number(match[1]))
  }
  for (const wire of circuit.wires) {
    const match = /^w(\d+)$/.exec(wire.id)
    if (match) maxWire = Math.max(maxWire, Number(match[1]))
  }
  for (const group of circuit.groups) {
    const match = /^g(\d+)$/.exec(group.id)
    if (match) maxGroup = Math.max(maxGroup, Number(match[1]))
  }
  for (const fold of circuit.folds) {
    const match = /^f(\d+)$/.exec(fold.id)
    if (match) maxFold = Math.max(maxFold, Number(match[1]))
  }
  nodeSeq = maxNode
  wireSeq = maxWire
  groupSeq = maxGroup
  foldSeq = maxFold
}

export function importCircuit(data: CircuitData) {
  flushNudge()
  circuit.nodes = cloneNodes(data.nodes)
  circuit.wires = cloneWires(data.wires)
  circuit.groups = cloneGroups(data.groups ?? [])
  circuit.folds = cloneFolds(data.folds ?? [])
  pruneGroups()
  pruneFolds()
  circuit.selection = null
  circuit.running = false
  circuit.time = 0
  syncSequences()
  recordHistory()
}

export function toggleRunning() {
  circuit.running = !circuit.running
}

export function toggleNode(id: string) {
  const node = circuit.nodes.find(item => item.id === id)
  if (node?.type === 'switch') {
    flushNudge()
    node.value = node.value === 1 ? 0 : 1
    recordHistory()
  }
}

export function cycleClockFreq(id: string) {
  const node = circuit.nodes.find(item => item.id === id)
  if (node?.type !== 'clock') return
  flushNudge()
  const freq = node.freq ?? 1
  const index = CLOCK_RATES.indexOf(freq)
  if (index === -1) {
    // 导入的数据可能带有非标准频率，先归到下一个更大的标准档位
    node.freq = CLOCK_RATES.find(rate => rate > freq) ?? CLOCK_RATES[0]
  } else {
    node.freq = CLOCK_RATES[(index + 1) % CLOCK_RATES.length]
  }
  recordHistory()
}

const stored = loadStoredCircuit()
if (stored) {
  circuit.nodes = cloneNodes(stored.nodes)
  circuit.wires = cloneWires(stored.wires)
  circuit.groups = cloneGroups(stored.groups ?? [])
  circuit.folds = cloneFolds(stored.folds ?? [])
  pruneGroups()
  pruneFolds()
  syncSequences()
}
past = []
future = []
committed = takeSnapshot()
committedKey = snapshotKey(committed)
syncHistoryFlags()
