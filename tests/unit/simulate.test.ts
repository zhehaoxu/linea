import { describe, expect, it } from 'vitest'
import { advance, createRuntime, simulate } from '../../src/circuit/simulate'
import type { Bit, CircuitNode, Wire } from '../../src/types'

function switchNode(id: string, value: Bit): CircuitNode {
  return { id, type: 'switch', x: 0, y: 0, value }
}

function clockNode(id: string, freq: number): CircuitNode {
  return { id, type: 'clock', x: 0, y: 0, value: 0, freq }
}

function dffNode(id: string): CircuitNode {
  return { id, type: 'dff', x: 200, y: 0, value: 0 }
}

function wire(id: string, fromId: string, fromPort: string, toId: string, toPort: string): Wire {
  return { id, from: { nodeId: fromId, port: fromPort }, to: { nodeId: toId, port: toPort } }
}

describe('clock simulation', () => {
  it.each<[frequency: number, time: number, expected: Bit]>([
    [1, 0, 0],
    [1, 499, 0],
    [1, 500, 1],
    [1, 999, 1],
    [1, 1000, 0],
    [2, 249, 0],
    [2, 250, 1],
    [2, 500, 0],
  ])('clock at %i Hz outputs %i at %i ms', (frequency, time, expected) => {
    const clock = clockNode('clk', frequency)
    const result = simulate([clock], [], createRuntime(), time)

    expect(result.outs.get('clk:out')).toBe(expected)
  })
})

describe('D flip-flop simulation', () => {
  it('captures D on a rising clock edge and holds it otherwise', () => {
    const data = switchNode('d', 1)
    const clock = clockNode('clk', 1)
    const flipFlop = dffNode('ff')
    const nodes = [data, clock, flipFlop]
    const wires = [
      wire('w-d', 'd', 'out', 'ff', 'd'),
      wire('w-clk', 'clk', 'out', 'ff', 'clk'),
    ]
    const runtime = createRuntime()

    let result = advance(nodes, wires, runtime, 0)
    expect(result.ins.get('ff:clk')).toBe(0)
    expect(result.outs.get('ff:q')).toBe(0)
    expect(result.outs.get('ff:qbar')).toBe(1)
    expect(runtime.ffQ.ff).toBeUndefined()

    result = advance(nodes, wires, runtime, 499)
    expect(result.outs.get('ff:q')).toBe(0)
    expect(runtime.ffQ.ff).toBeUndefined()

    result = advance(nodes, wires, runtime, 500)
    expect(result.wires.get('w-clk')).toBe(1)
    expect(result.wires.get('w-d')).toBe(1)
    expect(result.outs.get('ff:q')).toBe(1)
    expect(result.outs.get('ff:qbar')).toBe(0)
    expect(runtime.ffQ.ff).toBe(1)

    data.value = 0
    result = advance(nodes, wires, runtime, 700)
    expect(result.ins.get('ff:clk')).toBe(1)
    expect(result.outs.get('ff:q')).toBe(1)
    expect(runtime.ffQ.ff).toBe(1)

    result = advance(nodes, wires, runtime, 1000)
    expect(result.ins.get('ff:clk')).toBe(0)
    expect(result.outs.get('ff:q')).toBe(1)

    result = advance(nodes, wires, runtime, 1500)
    expect(result.ins.get('ff:clk')).toBe(1)
    expect(result.outs.get('ff:q')).toBe(0)
    expect(result.outs.get('ff:qbar')).toBe(1)
    expect(runtime.ffQ.ff).toBe(0)
  })
})
