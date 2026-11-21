import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  STORAGE_KEY,
  loadStoredCircuit,
  parseCircuit,
  saveStoredCircuit,
  serializeCircuit,
} from '../../src/circuit/persist'
import type { CircuitGroup, CircuitNode, Wire } from '../../src/types'
import { createMemoryStorage } from './storage'

const nodes: CircuitNode[] = [
  { id: 'sw', type: 'switch', x: 10, y: 20, value: 1 },
  { id: 'clk', type: 'clock', x: 30, y: 40, value: 0, freq: 2 },
  { id: 'ff', type: 'dff', x: 120, y: 40, value: 0 },
  { id: 'lamp', type: 'lamp', x: 240, y: 50, value: 0 },
  { id: 'label', type: 'text', x: 0, y: 120, value: 0, text: 'Q\nQ̄' },
]
const wires: Wire[] = [
  { id: 'w1', from: { nodeId: 'sw', port: 'out' }, to: { nodeId: 'ff', port: 'd' } },
  { id: 'w2', from: { nodeId: 'clk', port: 'out' }, to: { nodeId: 'ff', port: 'clk' } },
  { id: 'w3', from: { nodeId: 'ff', port: 'q' }, to: { nodeId: 'lamp', port: 'a' } },
]
const groups: CircuitGroup[] = [{ id: 'g1', nodes: ['sw', 'clk', 'ff'] }]

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('circuit serialization', () => {
  it('round-trips nodes, wires, and groups', () => {
    const parsed = parseCircuit(serializeCircuit(nodes, wires, groups))

    expect(parsed).toEqual({ nodes, wires, groups })
  })

  it('normalizes missing clock and text fields', () => {
    const parsed = parseCircuit(
      JSON.stringify({
        nodes: [
          { id: 'clk', type: 'clock', x: 0, y: 0, value: 0, freq: 0 },
          { id: 'label', type: 'text', x: 0, y: 0, value: 0 },
        ],
        wires: [],
      }),
    )

    expect(parsed.nodes[0]).toMatchObject({ type: 'clock', freq: 1 })
    expect(parsed.nodes[1]).toMatchObject({ type: 'text', text: '' })
    expect(parsed.groups).toEqual([])
  })

  it('rejects duplicate input connections', () => {
    const text = JSON.stringify({
      nodes: [
        { id: 'a', type: 'switch', x: 0, y: 0, value: 0 },
        { id: 'b', type: 'switch', x: 0, y: 80, value: 0 },
        { id: 'and', type: 'and', x: 120, y: 0, value: 0 },
      ],
      wires: [
        { id: 'w1', from: { nodeId: 'a', port: 'out' }, to: { nodeId: 'and', port: 'a' } },
        { id: 'w2', from: { nodeId: 'b', port: 'out' }, to: { nodeId: 'and', port: 'a' } },
      ],
    })

    expect(() => parseCircuit(text)).toThrow('duplicate input connection')
  })

  it('rejects overlapping groups', () => {
    const text = JSON.stringify({
      nodes: [
        { id: 'a', type: 'switch', x: 0, y: 0, value: 0 },
        { id: 'b', type: 'switch', x: 0, y: 80, value: 0 },
        { id: 'c', type: 'lamp', x: 160, y: 20, value: 0 },
      ],
      wires: [],
      groups: [
        { id: 'g1', nodes: ['a', 'b'] },
        { id: 'g2', nodes: ['b', 'c'] },
      ],
    })

    expect(() => parseCircuit(text)).toThrow('invalid group nodes')
  })

  it('rejects invalid JSON and unknown node types', () => {
    expect(() => parseCircuit('{')).toThrow('invalid json')
    expect(() =>
      parseCircuit(
        JSON.stringify({
          nodes: [{ id: 'x', type: 'relay', x: 0, y: 0, value: 0 }],
          wires: [],
        }),
      ),
    ).toThrow('invalid node type')
  })
})

describe('local storage persistence', () => {
  it('saves and loads a circuit', () => {
    saveStoredCircuit(nodes, wires, groups)

    expect(localStorage.getItem(STORAGE_KEY)).toContain('"linea-circuit"')
    expect(loadStoredCircuit()).toEqual({ nodes, wires, groups })
  })

  it('ignores corrupt stored data', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(loadStoredCircuit()).toBeNull()

    localStorage.setItem(STORAGE_KEY, '{"nodes":[],"wires":[],"groups":"bad"}')
    expect(loadStoredCircuit()).toBeNull()
  })
})
