import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  STORAGE_KEY,
  loadStoredCircuit,
  parseCircuit,
  saveStoredCircuit,
  serializeCircuit,
} from '../../src/circuit/persist'
import type { CircuitFold, CircuitGroup, CircuitNode, Wire } from '../../src/types'
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
const folds: CircuitFold[] = [
  { id: 'f1', nodes: ['sw', 'clk'], collapsed: true, label: '核心' },
]

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('circuit serialization', () => {
  it('round-trips nodes, wires, groups, and folds', () => {
    const parsed = parseCircuit(serializeCircuit(nodes, wires, groups, folds))

    expect(parsed).toEqual({ nodes, wires, groups, folds })
  })

  it('round-trips an expanded fold without touching groups', () => {
    const expanded: CircuitFold[] = [{ id: 'f1', nodes: ['sw', 'clk'], label: '核心' }]
    const parsed = parseCircuit(serializeCircuit(nodes, wires, [], expanded))

    expect(parsed.groups).toEqual([])
    expect(parsed.folds).toEqual(expanded)
  })

  it('migrates legacy auto groups into folds', () => {
    const parsed = parseCircuit(
      JSON.stringify({
        nodes,
        wires: [],
        groups: [{ id: 'g1', nodes: ['sw', 'clk'], collapsed: true, auto: true, label: '核心' }],
      }),
    )

    expect(parsed.groups).toEqual([])
    expect(parsed.folds).toEqual([
      { id: 'legacy-1', nodes: ['sw', 'clk'], collapsed: true, label: '核心' },
    ])
  })

  it('keeps a legacy collapsed group and adds a fold for it', () => {
    const parsed = parseCircuit(
      JSON.stringify({
        nodes,
        wires: [],
        groups: [{ id: 'g1', nodes: ['sw', 'clk'], collapsed: true, label: '核心' }],
      }),
    )

    expect(parsed.groups).toEqual([{ id: 'g1', nodes: ['sw', 'clk'] }])
    expect(parsed.folds).toEqual([
      { id: 'legacy-1', nodes: ['sw', 'clk'], collapsed: true, label: '核心' },
    ])
  })

  it('treats non-boolean collapsed values as expanded and drops invalid labels', () => {
    const parsed = parseCircuit(
      JSON.stringify({
        nodes,
        wires: [],
        groups: [{ id: 'g1', nodes: ['sw', 'clk'], collapsed: 'yes', auto: 'yes', label: 42 }],
      }),
    )

    expect(parsed.groups).toEqual([{ id: 'g1', nodes: ['sw', 'clk'] }])
    expect(parsed.folds).toEqual([])
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
    expect(parsed.folds).toEqual([])
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

  it('rejects overlapping folds', () => {
    const text = JSON.stringify({
      nodes: [
        { id: 'a', type: 'switch', x: 0, y: 0, value: 0 },
        { id: 'b', type: 'switch', x: 0, y: 80, value: 0 },
        { id: 'c', type: 'lamp', x: 160, y: 20, value: 0 },
      ],
      wires: [],
      folds: [
        { id: 'f1', nodes: ['a', 'b'] },
        { id: 'f2', nodes: ['b', 'c'] },
      ],
    })

    expect(() => parseCircuit(text)).toThrow('invalid fold nodes')
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
    saveStoredCircuit(nodes, wires, groups, folds)

    expect(localStorage.getItem(STORAGE_KEY)).toContain('"linea-circuit"')
    expect(loadStoredCircuit()).toEqual({ nodes, wires, groups, folds })
  })

  it('ignores corrupt stored data', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(loadStoredCircuit()).toBeNull()

    localStorage.setItem(STORAGE_KEY, '{"nodes":[],"wires":[],"groups":"bad"}')
    expect(loadStoredCircuit()).toBeNull()
  })
})
