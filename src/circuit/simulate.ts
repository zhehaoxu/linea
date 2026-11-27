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
  let sawCycle = false

  interface Frame {
    node: CircuitNode
    nextInput: number
  }

  function portValue(nodeId: string, port: string): Bit {
    evaluate(nodeId)
    return outs.get(`${nodeId}:${port}`) ?? 0
  }

  function evaluate(nodeId: string) {
    if (done.has(nodeId)) return
    const root = nodeById.get(nodeId)
    if (!root) return

    const stack: Frame[] = []
    const push = (node: CircuitNode) => {
      if (done.has(node.id) || visiting.has(node.id)) return
      if (node.type === 'switch') {
        outs.set(`${node.id}:out`, node.value)
        done.add(node.id)
        return
      }
      if (node.type === 'clock') {
        const half = 500 / (node.freq ?? 1)
        outs.set(`${node.id}:out`, Math.floor(time / half) % 2 === 0 ? 0 : 1)
        done.add(node.id)
        return
      }
      if (node.type === 'text') {
        done.add(node.id)
        return
      }
      visiting.add(node.id)
      if (node.type === 'dff') {
        const q: Bit = runtime.ffQ[node.id] ?? 0
        outs.set(`${node.id}:q`, q)
        outs.set(`${node.id}:qbar`, q ? 0 : 1)
      }
      stack.push({ node, nextInput: 0 })
    }

    push(root)
    while (stack.length) {
      const frame = stack[stack.length - 1]
      const { node } = frame
      const spec = NODE_SPECS[node.type]

      if (frame.nextInput < spec.ins.length) {
        const port = spec.ins[frame.nextInput]
        const wire = incoming.get(`${node.id}:${port.id}`)
        if (wire && !done.has(wire.from.nodeId)) {
          const source = nodeById.get(wire.from.nodeId)
          if (source && !visiting.has(source.id)) {
            push(source)
            continue
          }
          if (source) sawCycle = true
        }
        const value = wire ? (outs.get(`${wire.from.nodeId}:${wire.from.port}`) ?? 0) : 0
        ins.set(`${node.id}:${port.id}`, value)
        frame.nextInput += 1
        continue
      }

      const inputs = spec.ins.map(port => ins.get(`${node.id}:${port.id}`) ?? 0)
      if (node.type === 'lamp' || node.type === 'display') {
        // 指示灯与数码管没有输出，只记录输入用于显示
      } else if (node.type !== 'dff') {
        outs.set(`${node.id}:out`, gateValue(node.type, inputs[0] ?? 0, inputs[1] ?? 0))
      }
      visiting.delete(node.id)
      done.add(node.id)
      stack.pop()
    }
  }

  for (const node of nodes) evaluate(node.id)

  // 组合环路需要迭代到稳定，避免结果依赖器件排列顺序。
  if (sawCycle) {
    for (let pass = 0; pass < nodes.length; pass += 1) {
      const before = new Map<string, Bit>()
      for (const node of nodes) {
        for (const port of NODE_SPECS[node.type].outs) {
          const key = `${node.id}:${port.id}`
          before.set(key, outs.get(key) ?? 0)
        }
      }
      done.clear()
      visiting.clear()
      for (const node of nodes) evaluate(node.id)
      let stable = true
      for (const node of nodes) {
        for (const port of NODE_SPECS[node.type].outs) {
          const key = `${node.id}:${port.id}`
          if ((outs.get(key) ?? 0) !== before.get(key)) {
            stable = false
            break
          }
        }
        if (!stable) break
      }
      if (stable) break
    }
  }

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
  let edgeChanged = false
  for (const node of nodes) {
    if (node.type !== 'dff') continue
    const clock = result.ins.get(`${node.id}:clk`) ?? 0
    const previous = runtime.prevClk[node.id] ?? 0
    if (previous === 0 && clock === 1) {
      const d = result.ins.get(`${node.id}:d`) ?? 0
      if (d !== (runtime.ffQ[node.id] ?? 0)) {
        runtime.ffQ[node.id] = d
        edgeChanged = true
      }
    }
    runtime.prevClk[node.id] = clock
  }
  return edgeChanged ? simulate(nodes, wires, runtime, time) : result
}
