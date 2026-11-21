import type { CircuitGroup, CircuitNode, NodeType, Wire } from '../types'
import { NODE_SPECS } from './specs'

export interface CircuitData {
  nodes: CircuitNode[]
  wires: Wire[]
  groups?: CircuitGroup[]
}

export const STORAGE_KEY = 'linea.circuit.v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readEnd(value: unknown): { nodeId: string; port: string } {
  if (!isRecord(value) || typeof value.nodeId !== 'string' || typeof value.port !== 'string') {
    throw new Error('invalid wire end')
  }
  return { nodeId: value.nodeId, port: value.port }
}

export function serializeCircuit(
  nodes: CircuitNode[],
  wires: Wire[],
  groups: CircuitGroup[],
): string {
  return JSON.stringify(
    {
      type: 'linea-circuit',
      version: 1,
      nodes,
      wires,
      groups,
    },
    null,
    2,
  )
}

function parseNodes(rawNodes: unknown): CircuitNode[] {
  const nodes: CircuitNode[] = []
  const nodeIds = new Set<string>()
  for (const item of rawNodes as unknown[]) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id) {
      throw new Error('invalid node')
    }
    if (nodeIds.has(item.id)) throw new Error('duplicate node id')
    const type = item.type
    if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(NODE_SPECS, type)) {
      throw new Error('invalid node type')
    }
    if (
      typeof item.x !== 'number' ||
      !Number.isFinite(item.x) ||
      typeof item.y !== 'number' ||
      !Number.isFinite(item.y)
    ) {
      throw new Error('invalid node position')
    }
    const nodeType = type as NodeType
    const node: CircuitNode = {
      id: item.id,
      type: nodeType,
      x: Math.round(item.x),
      y: Math.round(item.y),
      value: item.value === 1 ? 1 : 0,
    }
    if (nodeType === 'clock') {
      node.freq =
        typeof item.freq === 'number' && Number.isFinite(item.freq) && item.freq > 0 && item.freq <= 64
          ? item.freq
          : 1
    }
    if (nodeType === 'text') {
      node.text = typeof item.text === 'string' ? item.text : ''
    }
    nodes.push(node)
    nodeIds.add(node.id)
  }
  return nodes
}

function parseWires(rawWires: unknown, nodes: CircuitNode[]): Wire[] {
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const wires: Wire[] = []
  const wireIds = new Set<string>()
  const occupiedInputs = new Set<string>()
  for (const item of rawWires as unknown[]) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id) {
      throw new Error('invalid wire')
    }
    if (wireIds.has(item.id)) throw new Error('duplicate wire id')
    const from = readEnd(item.from)
    const to = readEnd(item.to)
    const fromNode = nodeById.get(from.nodeId)
    const toNode = nodeById.get(to.nodeId)
    if (!fromNode || !toNode || fromNode.id === toNode.id) throw new Error('invalid wire node')
    if (!NODE_SPECS[fromNode.type].outs.some(port => port.id === from.port)) {
      throw new Error('invalid output port')
    }
    if (!NODE_SPECS[toNode.type].ins.some(port => port.id === to.port)) {
      throw new Error('invalid input port')
    }
    const inputKey = `${to.nodeId}:${to.port}`
    if (occupiedInputs.has(inputKey)) throw new Error('duplicate input connection')
    occupiedInputs.add(inputKey)
    wires.push({ id: item.id, from, to })
    wireIds.add(item.id)
  }
  return wires
}

function parseGroups(rawGroups: unknown, nodes: CircuitNode[]): CircuitGroup[] {
  if (rawGroups === undefined) return []
  if (!Array.isArray(rawGroups)) throw new Error('invalid groups')
  const nodeIds = new Set(nodes.map(node => node.id))
  const usedNodes = new Set<string>()
  const groupIds = new Set<string>()
  const groups: CircuitGroup[] = []
  for (const item of rawGroups) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id || !Array.isArray(item.nodes)) {
      throw new Error('invalid group')
    }
    if (groupIds.has(item.id)) throw new Error('duplicate group id')
    const uniqueIds = [...new Set(item.nodes)]
    if (uniqueIds.length < 2 || uniqueIds.some(id => typeof id !== 'string')) {
      throw new Error('invalid group nodes')
    }
    const ids = uniqueIds as string[]
    if (ids.some(id => !nodeIds.has(id) || usedNodes.has(id))) {
      throw new Error('invalid group nodes')
    }
    groupIds.add(item.id)
    for (const id of ids) usedNodes.add(id)
    groups.push({ id: item.id, nodes: ids })
  }
  return groups
}

export function parseCircuit(text: string): CircuitData {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('invalid json')
  }
  if (!isRecord(raw) || !Array.isArray(raw.nodes) || !Array.isArray(raw.wires)) {
    throw new Error('invalid circuit')
  }
  if (raw.type !== undefined && raw.type !== 'linea-circuit') {
    throw new Error('unknown file type')
  }

  const nodes = parseNodes(raw.nodes)
  const wires = parseWires(raw.wires, nodes)
  const groups = parseGroups(raw.groups, nodes)
  return { nodes, wires, groups }
}

export function loadStoredCircuit(): CircuitData | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    if (!text) return null
    return parseCircuit(text)
  } catch {
    return null
  }
}

export function saveStoredCircuit(nodes: CircuitNode[], wires: Wire[], groups: CircuitGroup[]) {
  try {
    localStorage.setItem(STORAGE_KEY, serializeCircuit(nodes, wires, groups))
  } catch {
    // 存储不可用时静默跳过
  }
}
