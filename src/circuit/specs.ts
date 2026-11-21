import type { CircuitNode, NodeType, Vec } from '../types'

export interface Port {
  id: string
  x: number
  y: number
  label?: string
}

export interface NodeSpec {
  width: number
  height: number
  ins: Port[]
  outs: Port[]
}

const TWO_INPUTS: Port[] = [
  { id: 'a', x: -10, y: 14 },
  { id: 'b', x: -10, y: 34 },
]
const ONE_INPUT: Port[] = [{ id: 'a', x: -10, y: 24 }]
const GATE_OUT: Port[] = [{ id: 'out', x: 66, y: 24 }]
const DISPLAY_INPUTS: Port[] = [
  { id: 'a', x: -10, y: 20, label: 'A' },
  { id: 'b', x: -10, y: 48, label: 'B' },
  { id: 'c', x: -10, y: 76, label: 'C' },
  { id: 'd', x: -10, y: 104, label: 'D' },
]

export const NODE_SPECS: Record<NodeType, NodeSpec> = {
  switch: { width: 44, height: 34, ins: [], outs: [{ id: 'out', x: 54, y: 17 }] },
  clock: { width: 48, height: 36, ins: [], outs: [{ id: 'out', x: 58, y: 18 }] },
  lamp: { width: 48, height: 48, ins: ONE_INPUT, outs: [] },
  display: { width: 96, height: 128, ins: DISPLAY_INPUTS, outs: [] },
  text: { width: 60, height: 18, ins: [], outs: [] },
  dff: {
    width: 60,
    height: 52,
    ins: [
      { id: 'd', x: -10, y: 14 },
      { id: 'clk', x: -10, y: 38 },
    ],
    outs: [
      { id: 'q', x: 70, y: 16 },
      { id: 'qbar', x: 70, y: 40 },
    ],
  },
  and: { width: 56, height: 48, ins: TWO_INPUTS, outs: GATE_OUT },
  or: { width: 56, height: 48, ins: TWO_INPUTS, outs: GATE_OUT },
  not: { width: 56, height: 48, ins: ONE_INPUT, outs: GATE_OUT },
  xor: { width: 56, height: 48, ins: TWO_INPUTS, outs: GATE_OUT },
  nand: { width: 56, height: 48, ins: TWO_INPUTS, outs: GATE_OUT },
  nor: { width: 56, height: 48, ins: TWO_INPUTS, outs: GATE_OUT },
  xnor: { width: 56, height: 48, ins: TWO_INPUTS, outs: GATE_OUT },
}

let measureContext: CanvasRenderingContext2D | null | undefined
let measureFont = ''

function fallbackLineWidth(line: string): number {
  let width = 0
  for (const char of line) {
    const code = char.codePointAt(0) ?? 0
    width += code >= 0x2e80 ? 13 : 7.4
  }
  return width
}

function measureLineWidth(line: string): number {
  if (measureContext === undefined) {
    measureContext =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  }
  if (!measureContext) return fallbackLineWidth(line)
  if (!measureFont) {
    measureFont = `13px ${getComputedStyle(document.documentElement).fontFamily || 'sans-serif'}`
    measureContext.font = measureFont
  }
  return measureContext.measureText(line).width
}

interface TextSize {
  width: number
  height: number
}

const textSizeCache = new Map<string, TextSize>()

export function textMetrics(text: string) {
  const lines = text.split('\n')
  let size = textSizeCache.get(text)
  if (!size) {
    let widest = 0
    for (const line of lines) widest = Math.max(widest, measureLineWidth(line))
    size = { width: Math.max(48, widest), height: Math.max(18, lines.length * 18) }
    if (textSizeCache.size > 2000) textSizeCache.clear()
    textSizeCache.set(text, size)
  }
  return { lines, width: size.width, height: size.height }
}

export function portPointOf(node: CircuitNode | undefined, port: string): Vec | null {
  if (!node) return null
  const spec = NODE_SPECS[node.type]
  const point = [...spec.outs, ...spec.ins].find(item => item.id === port)
  if (!point) return null
  return { x: node.x + point.x, y: node.y + point.y }
}

export function frameFromSpec(
  node: CircuitNode,
  spec: NodeSpec,
): { x: number; y: number; w: number; h: number } {
  const left = -16
  const rightX = spec.outs.length ? Math.max(...spec.outs.map(port => port.x)) : spec.width
  const right = rightX + 12
  return { x: node.x + left, y: node.y - 8, w: right - left, h: spec.height + 16 }
}

export function nodeFrame(node: CircuitNode): { x: number; y: number; w: number; h: number } {
  if (node.type === 'text') {
    const metrics = textMetrics(node.text ?? '')
    return { x: node.x - 8, y: node.y - 5, w: metrics.width + 14, h: metrics.height + 10 }
  }
  return frameFromSpec(node, NODE_SPECS[node.type])
}

export function wirePath(a: Vec, b: Vec): string {
  const dx = Math.max(30, Math.abs(b.x - a.x) * 0.45)
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`
}
