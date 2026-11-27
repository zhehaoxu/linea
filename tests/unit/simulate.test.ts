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
    const lamp: CircuitNode = { id: 'lamp', type: 'lamp', x: 300, y: 0, value: 0 }
    const nodes = [data, clock, flipFlop, lamp]
    const wires = [
      wire('w-d', 'd', 'out', 'ff', 'd'),
      wire('w-clk', 'clk', 'out', 'ff', 'clk'),
      wire('w-q', 'ff', 'q', 'lamp', 'a'),
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
    expect(result.wires.get('w-q')).toBe(1)
    expect(result.outs.get('ff:q')).toBe(1)
    expect(result.outs.get('ff:qbar')).toBe(0)
    expect(result.ins.get('lamp:a')).toBe(1)
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
    expect(result.wires.get('w-q')).toBe(0)
    expect(result.ins.get('lamp:a')).toBe(0)
    expect(runtime.ffQ.ff).toBe(0)
  })
})

describe('combinational simulation', () => {
  it('preserves a cross-coupled NOR latch across ticks', () => {
    const set = switchNode('set', 0)
    const reset = switchNode('reset', 0)
    const q: CircuitNode = { id: 'q', type: 'nor', x: 100, y: 0, value: 0 }
    const qbar: CircuitNode = { id: 'qbar', type: 'nor', x: 200, y: 0, value: 0 }
    const nodes = [qbar, q, reset, set]
    const wires = [
      wire('w-set', 'set', 'out', 'q', 'a'),
      wire('w-feedback-q', 'qbar', 'out', 'q', 'b'),
      wire('w-reset', 'reset', 'out', 'qbar', 'a'),
      wire('w-feedback-qbar', 'q', 'out', 'qbar', 'b'),
    ]
    const runtime = createRuntime()
    runtime.lastOuts = { 'q:out': 0, 'qbar:out': 1 }

    let result = simulate(nodes, wires, runtime, 0)
    expect(result.outs.get('q:out')).toBe(0)

    set.value = 1
    result = simulate(nodes, wires, runtime, 50)
    expect(result.outs.get('q:out')).toBe(0)

    set.value = 0
    reset.value = 1
    result = simulate(nodes, wires, runtime, 100)
    expect(result.outs.get('q:out')).toBe(1)

    reset.value = 0
    result = simulate(nodes, wires, runtime, 150)
    expect(result.outs.get('q:out')).toBe(1)
  })

  it('evaluates a deep reverse-ordered chain without recursive stack growth', () => {
    const source = switchNode('source', 1)
    const gates: CircuitNode[] = Array.from({ length: 2500 }, (_, index) => ({
      id: `gate-${index}`,
      type: 'not',
      x: index,
      y: 0,
      value: 0,
    }))
    const wires = [
      wire('w-0', 'source', 'out', 'gate-0', 'a'),
      ...gates.slice(1).map((gate, index) =>
        wire(`w-${index + 1}`, `gate-${index}`, 'out', gate.id, 'a'),
      ),
    ]

    const result = simulate([source, ...gates].reverse(), wires, createRuntime(), 0)

    expect(result.outs.get('gate-2499:out')).toBe(1)
  })
})
