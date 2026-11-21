import type { Bit, CircuitNode, NodeType, Wire } from '../types'
import { NODE_SPECS } from './specs'

export interface Simulation {
  ins: Map<string, Bit>
  outs: Map<string, Bit>
  wires: Map<string, Bit>
}

export interface Runtime {
  ffQ: Record<string, Bit>
  prevClk: Record<string, Bit>
  lastOuts: Record<string, Bit>
}

export function createRuntime(): Runtime {
  return { ffQ: {}, prevClk: {}, lastOuts: {} }
}

function gateValue(type: NodeType, a: Bit, b: Bit): Bit {
  switch (type) {
    case 'and':
      return (a & b) as Bit
    case 'or':
      return (a | b) as Bit
    case 'not':
      return (a ^ 1) as Bit
    case 'xor':
      return (a ^ b) as Bit
    case 'nand':
      return a & b ? 0 : 1
    case 'nor':
      return a | b ? 0 : 1
    case 'xnor':
      return a ^ b ? 0 : 1
    default:
      return 0
  }
}

export function simulate(nodes: CircuitNode[], wires: Wire[], runtime: Runtime, time: number): Simulation {
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const incoming = new Map<string, Wire>()
  for (const wire of wires) incoming.set(`${wire.to.nodeId}:${wire.to.port}`, wire)

  const ins = new Map<string, Bit>()
  const outs = new Map<string, Bit>()
  // Seed from the previous tick so cross-coupled gates (SR latch) keep their state.
  for (const [key, value] of Object.entries(runtime.lastOuts)) outs.set(key, value)
  const visiting = new Set<string>()
  const done = new Set<string>()

  const readInput = (nodeId: string, port: string): Bit => {
    const wire = incoming.get(`${nodeId}:${port}`)
    if (!wire) return 0
    return portValue(wire.from.nodeId, wire.from.port)
  }

  function portValue(nodeId: string, port: string): Bit {
    evaluate(nodeId)
    return outs.get(`${nodeId}:${port}`) ?? 0
  }

  function evaluate(nodeId: string) {
    if (done.has(nodeId)) return
    const node = nodeById.get(nodeId)
    if (!node) return

    if (node.type === 'switch') {
      outs.set(`${nodeId}:out`, node.value)
      done.add(nodeId)
      return
    }
    if (node.type === 'clock') {
      const half = 500 / (node.freq ?? 1)
      outs.set(`${nodeId}:out`, Math.floor(time / half) % 2 === 0 ? 0 : 1)
      done.add(nodeId)
      return
    }
    if (node.type === 'text') {
      done.add(nodeId)
      return
    }
    if (visiting.has(nodeId)) return
    visiting.add(nodeId)

    if (node.type === 'dff') {
      const q: Bit = runtime.ffQ[nodeId] ?? 0
      outs.set(`${nodeId}:q`, q)
      outs.set(`${nodeId}:qbar`, q ? 0 : 1)
    }

    const spec = NODE_SPECS[node.type]
    const inputs = spec.ins.map(port => {
      const value = readInput(nodeId, port.id)
      ins.set(`${nodeId}:${port.id}`, value)
      return value
    })

    if (node.type === 'lamp' || node.type === 'display') {
      // 指示灯与数码管没有输出，只记录输入用于显示
    } else if (node.type !== 'dff') {
      outs.set(`${nodeId}:out`, gateValue(node.type, inputs[0] ?? 0, inputs[1] ?? 0))
    }

    visiting.delete(nodeId)
    done.add(nodeId)
  }

  for (const node of nodes) evaluate(node.id)

  const wireValues = new Map<string, Bit>()
  for (const wire of wires) wireValues.set(wire.id, portValue(wire.from.nodeId, wire.from.port))

  const nextOuts: Record<string, Bit> = {}
  for (const node of nodes) {
    for (const port of NODE_SPECS[node.type].outs) {
      const value = outs.get(`${node.id}:${port.id}`)
      if (value !== undefined) nextOuts[`${node.id}:${port.id}`] = value
    }
  }
  runtime.lastOuts = nextOuts

  return { ins, outs, wires: wireValues }
}

export function advance(
  nodes: CircuitNode[],
  wires: Wire[],
  runtime: Runtime,
  time: number,
): Simulation {
  const result = simulate(nodes, wires, runtime, time)
  for (const node of nodes) {
    if (node.type !== 'dff') continue
    const clock = result.ins.get(`${node.id}:clk`) ?? 0
    const previous = runtime.prevClk[node.id] ?? 0
    if (previous === 0 && clock === 1) {
      const d = result.ins.get(`${node.id}:d`) ?? 0
      runtime.ffQ[node.id] = d
      result.outs.set(`${node.id}:q`, d)
      result.outs.set(`${node.id}:qbar`, d ? 0 : 1)
    }
    runtime.prevClk[node.id] = clock
  }
  return result
}
