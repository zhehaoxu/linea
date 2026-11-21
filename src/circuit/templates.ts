import type { Bit, CircuitNode, NodeType, Wire } from '../types'
import type { CircuitData } from './persist'

interface TemplateNode {
  type: NodeType
  x: number
  y: number
  value?: Bit
  freq?: number
  text?: string
}

type WireSeed = [fromId: string, fromPort: string, toId: string, toPort: string]

interface TemplateSeed {
  nodes: Record<string, TemplateNode>
  wires: WireSeed[]
}

export interface CircuitTemplate {
  id: string
  data: CircuitData
}

function label(x: number, y: number, text: string): TemplateNode {
  return { type: 'text', x, y, text }
}

function build(seed: TemplateSeed): CircuitData {
  const nodes: CircuitNode[] = Object.entries(seed.nodes).map(([id, node]) => ({
    id,
    type: node.type,
    x: node.x,
    y: node.y,
    value: node.value ?? 0,
    ...(node.freq !== undefined ? { freq: node.freq } : {}),
    ...(node.text !== undefined ? { text: node.text } : {}),
  }))
  const wires: Wire[] = seed.wires.map(([fromId, fromPort, toId, toPort], index) => ({
    id: `w${index + 1}`,
    from: { nodeId: fromId, port: fromPort },
    to: { nodeId: toId, port: toPort },
  }))
  return { nodes, wires }
}

export const TEMPLATES: CircuitTemplate[] = [
  {
    id: 'half-adder',
    data: build({
      nodes: {
        a: { type: 'switch', x: 60, y: 70, value: 1 },
        b: { type: 'switch', x: 60, y: 190, value: 0 },
        xor: { type: 'xor', x: 300, y: 40 },
        and: { type: 'and', x: 300, y: 170 },
        sum: { type: 'lamp', x: 510, y: 50 },
        carry: { type: 'lamp', x: 510, y: 175 },
        'label-a': label(60, 16, 'A'),
        'label-b': label(60, 136, 'B'),
        'label-sum': label(510, 8, 'Σ'),
        'label-carry': label(510, 133, 'C'),
      },
      wires: [
        ['a', 'out', 'xor', 'a'],
        ['a', 'out', 'and', 'a'],
        ['b', 'out', 'xor', 'b'],
        ['b', 'out', 'and', 'b'],
        ['xor', 'out', 'sum', 'a'],
        ['and', 'out', 'carry', 'a'],
      ],
    }),
  },
  {
    id: 'full-adder',
    data: build({
      nodes: {
        a: { type: 'switch', x: 60, y: 50, value: 1 },
        b: { type: 'switch', x: 60, y: 160, value: 0 },
        cin: { type: 'switch', x: 60, y: 330, value: 0 },
        xor1: { type: 'xor', x: 300, y: 30 },
        xor2: { type: 'xor', x: 560, y: 60 },
        and1: { type: 'and', x: 300, y: 270 },
        and2: { type: 'and', x: 560, y: 270 },
        or: { type: 'or', x: 760, y: 170 },
        sum: { type: 'lamp', x: 880, y: 50 },
        cout: { type: 'lamp', x: 880, y: 235 },
        'label-a': label(60, 16, 'A'),
        'label-b': label(60, 126, 'B'),
        'label-cin': label(60, 296, 'Cin'),
        'label-sum': label(880, 8, 'S'),
        'label-cout': label(880, 191, 'Cout'),
      },
      wires: [
        ['a', 'out', 'xor1', 'a'],
        ['b', 'out', 'xor1', 'b'],
        ['a', 'out', 'and1', 'a'],
        ['b', 'out', 'and1', 'b'],
        ['xor1', 'out', 'xor2', 'a'],
        ['xor1', 'out', 'and2', 'a'],
        ['cin', 'out', 'xor2', 'b'],
        ['cin', 'out', 'and2', 'b'],
        ['and1', 'out', 'or', 'a'],
        ['and2', 'out', 'or', 'b'],
        ['xor2', 'out', 'sum', 'a'],
        ['or', 'out', 'cout', 'a'],
      ],
    }),
  },
  {
    id: 'mux-2-1',
    data: build({
      nodes: {
        s: { type: 'switch', x: 60, y: 40, value: 0 },
        a: { type: 'switch', x: 60, y: 160, value: 1 },
        b: { type: 'switch', x: 60, y: 290, value: 0 },
        not: { type: 'not', x: 280, y: 30 },
        and1: { type: 'and', x: 430, y: 120 },
        and2: { type: 'and', x: 430, y: 260 },
        or: { type: 'or', x: 600, y: 190 },
        y: { type: 'lamp', x: 780, y: 190 },
        'label-s': label(60, 6, 'S'),
        'label-a': label(60, 126, 'A'),
        'label-b': label(60, 256, 'B'),
        'label-y': label(780, 156, 'Y'),
      },
      wires: [
        ['s', 'out', 'not', 'a'],
        ['s', 'out', 'and2', 'b'],
        ['not', 'out', 'and1', 'b'],
        ['a', 'out', 'and1', 'a'],
        ['b', 'out', 'and2', 'a'],
        ['and1', 'out', 'or', 'a'],
        ['and2', 'out', 'or', 'b'],
        ['or', 'out', 'y', 'a'],
      ],
    }),
  },
  {
    id: 'sr-latch',
    data: build({
      nodes: {
        s: { type: 'switch', x: 60, y: 80, value: 1 },
        r: { type: 'switch', x: 60, y: 300, value: 0 },
        'nor-s': { type: 'nor', x: 320, y: 80 },
        'nor-r': { type: 'nor', x: 320, y: 260 },
        qb: { type: 'lamp', x: 520, y: 80 },
        q: { type: 'lamp', x: 520, y: 260 },
        'label-s': label(60, 46, 'S'),
        'label-r': label(60, 266, 'R'),
        'label-qb': label(520, 46, "Q'"),
        'label-q': label(520, 226, 'Q'),
      },
      wires: [
        ['s', 'out', 'nor-s', 'a'],
        ['r', 'out', 'nor-r', 'a'],
        ['nor-s', 'out', 'nor-r', 'b'],
        ['nor-r', 'out', 'nor-s', 'b'],
        ['nor-s', 'out', 'qb', 'a'],
        ['nor-r', 'out', 'q', 'a'],
      ],
    }),
  },
  {
    id: 'dff-register',
    data: build({
      nodes: {
        d: { type: 'switch', x: 60, y: 48, value: 1 },
        clk: { type: 'clock', x: 60, y: 200, freq: 1 },
        dff: { type: 'dff', x: 320, y: 68 },
        q: { type: 'lamp', x: 520, y: 60 },
        qb: { type: 'lamp', x: 520, y: 140 },
        'label-d': label(60, 14, 'D'),
        'label-clk': label(60, 162, 'CLK'),
        'label-q': label(584, 75, 'Q'),
        'label-qb': label(584, 155, "Q'"),
      },
      wires: [
        ['d', 'out', 'dff', 'd'],
        ['clk', 'out', 'dff', 'clk'],
        ['dff', 'q', 'q', 'a'],
        ['dff', 'qbar', 'qb', 'a'],
      ],
    }),
  },
]
