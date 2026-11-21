import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStorage } from './storage'

const STORAGE_KEY = 'linea.circuit.v1'
const EMPTY_CIRCUIT = JSON.stringify({
  type: 'linea-circuit',
  version: 1,
  nodes: [],
  wires: [],
  groups: [],
})

async function loadStore() {
  return import('../../src/circuit/store')
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('localStorage', createMemoryStorage({ [STORAGE_KEY]: EMPTY_CIRCUIT }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('circuit history', () => {
  it('starts empty with no undo or redo available', async () => {
    const store = await loadStore()

    expect(store.circuit.nodes).toEqual([])
    expect(store.circuit.wires).toEqual([])
    expect(store.historyState).toMatchObject({ canUndo: false, canRedo: false })
  })

  it('undoes and redoes node creation', async () => {
    const store = await loadStore()
    const node = store.addNode('switch', 12.4, 20.6)

    expect(node).toMatchObject({ type: 'switch', x: 12, y: 21, value: 0 })
    expect(store.circuit.selection).toEqual({ nodes: [node.id], wires: [] })
    expect(store.historyState).toMatchObject({ canUndo: true, canRedo: false })

    store.undo()

    expect(store.circuit.nodes).toEqual([])
    expect(store.circuit.selection).toBeNull()
    expect(store.historyState).toMatchObject({ canUndo: false, canRedo: true })

    store.redo()

    expect(store.circuit.nodes).toEqual([node])
    expect(store.circuit.selection).toEqual({ nodes: [node.id], wires: [] })
    expect(store.historyState).toMatchObject({ canUndo: true, canRedo: false })
  })

  it('selects every node and wire', async () => {
    const store = await loadStore()
    const source = store.addNode('switch', 0, 0)
    const lamp = store.addNode('lamp', 160, 0)

    store.connect(
      { nodeId: source.id, port: 'out' },
      { nodeId: lamp.id, port: 'a' },
    )
    store.selectAll()

    expect(store.circuit.selection).toEqual({
      nodes: [source.id, lamp.id],
      wires: [store.circuit.wires[0].id],
    })
  })

  it('pastes only internal wires and remaps their endpoints', async () => {
    const store = await loadStore()
    const source = store.addNode('switch', 0, 0)
    const gate = store.addNode('and', 120, 0)
    const lamp = store.addNode('lamp', 260, 0)

    store.connect(
      { nodeId: source.id, port: 'out' },
      { nodeId: gate.id, port: 'a' },
    )
    store.connect(
      { nodeId: gate.id, port: 'out' },
      { nodeId: lamp.id, port: 'a' },
    )
    const internalWireId = store.circuit.wires[0].id

    store.circuit.selection = { nodes: [source.id, gate.id], wires: [] }
    store.copySelection()
    store.pasteClipboard()

    const pasted = store.circuit.nodes.slice(3)
    const pastedWire = store.circuit.wires[2]
    expect(store.circuit.nodes).toHaveLength(5)
    expect(store.circuit.wires).toHaveLength(3)
    expect(new Set(store.circuit.nodes.map(node => node.id)).size).toBe(5)
    expect(pasted[0]).toMatchObject({ type: 'switch', x: source.x + 24, y: source.y + 24 })
    expect(pasted[1]).toMatchObject({ type: 'and', x: gate.x + 24, y: gate.y + 24 })
    expect(pastedWire.id).not.toBe(internalWireId)
    expect(pastedWire.from).toEqual({ nodeId: pasted[0].id, port: 'out' })
    expect(pastedWire.to).toEqual({ nodeId: pasted[1].id, port: 'a' })
    expect(store.circuit.selection).toEqual({
      nodes: pasted.map(node => node.id),
      wires: [pastedWire.id],
    })

    store.undo()

    expect(store.circuit.nodes).toHaveLength(3)
    expect(store.circuit.wires).toHaveLength(2)

    store.redo()

    expect(store.circuit.nodes).toHaveLength(5)
    expect(store.circuit.wires).toHaveLength(3)
  })

  it('offsets repeated pastes and duplicates the current selection', async () => {
    const store = await loadStore()
    store.addNode('switch', 10, 20)

    store.copySelection()
    store.pasteClipboard()
    store.pasteClipboard()

    expect(store.circuit.nodes).toHaveLength(3)
    expect(store.circuit.nodes[1]).toMatchObject({ x: 34, y: 44 })
    expect(store.circuit.nodes[2]).toMatchObject({ x: 58, y: 68 })

    store.duplicateSelection()

    expect(store.circuit.nodes).toHaveLength(4)
    expect(store.circuit.nodes[3]).toMatchObject({ x: 82, y: 92 })
    expect(new Set(store.circuit.nodes.map(node => node.id)).size).toBe(4)

    store.undo()

    expect(store.circuit.nodes).toHaveLength(3)
  })

  it('cuts the selection to the clipboard and restores it with undo', async () => {
    const store = await loadStore()
    const node = store.addNode('switch', 10, 20)

    expect(store.clipboardState.hasData).toBe(false)

    store.cutSelection()

    expect(store.circuit.nodes).toEqual([])
    expect(store.circuit.selection).toBeNull()
    expect(store.clipboardState.hasData).toBe(true)

    store.pasteClipboard()

    expect(store.circuit.nodes).toHaveLength(1)
    expect(store.circuit.nodes[0]).toMatchObject({
      type: 'switch',
      x: node.x + 24,
      y: node.y + 24,
    })

    store.undo()
    expect(store.circuit.nodes).toEqual([])

    store.undo()
    expect(store.circuit.nodes.map(item => item.id)).toEqual([node.id])
  })

  it('restores deleted nodes and their wires on undo', async () => {
    const store = await loadStore()
    const source = store.addNode('switch', 0, 0)
    const gate = store.addNode('and', 120, 0)

    store.connect(
      { nodeId: source.id, port: 'out' },
      { nodeId: gate.id, port: 'a' },
    )
    store.circuit.selection = { nodes: [source.id], wires: [] }
    store.deleteSelection()

    expect(store.circuit.nodes.map(node => node.id)).toEqual([gate.id])
    expect(store.circuit.wires).toEqual([])

    store.undo()

    expect(store.circuit.nodes.map(node => node.id)).toEqual([source.id, gate.id])
    expect(store.circuit.wires).toHaveLength(1)
    expect(store.circuit.wires[0]).toMatchObject({
      from: { nodeId: source.id, port: 'out' },
      to: { nodeId: gate.id, port: 'a' },
    })

    store.redo()

    expect(store.circuit.nodes.map(node => node.id)).toEqual([gate.id])
    expect(store.circuit.wires).toEqual([])
  })

  it('undoes and redoes grouping', async () => {
    const store = await loadStore()
    const first = store.addNode('switch', 0, 0)
    const second = store.addNode('switch', 0, 80)
    const third = store.addNode('lamp', 180, 30)

    store.circuit.selection = { nodes: [first.id, second.id, third.id], wires: [] }
    store.groupSelection()

    expect(store.circuit.groups).toHaveLength(1)
    expect(store.circuit.groups[0].nodes).toEqual([first.id, second.id, third.id])

    store.undo()

    expect(store.circuit.groups).toEqual([])
    expect(store.circuit.nodes.map(node => node.id)).toEqual([first.id, second.id, third.id])

    store.redo()

    expect(store.circuit.groups).toHaveLength(1)
    expect(store.circuit.groups[0].nodes).toEqual([first.id, second.id, third.id])

    store.ungroupSelection()

    expect(store.circuit.groups).toEqual([])

    store.undo()

    expect(store.circuit.groups).toHaveLength(1)

    store.redo()

    expect(store.circuit.groups).toEqual([])
  })

  it('merges overlapping groups into one group', async () => {
    const store = await loadStore()
    const first = store.addNode('switch', 0, 0)
    const second = store.addNode('switch', 0, 80)
    const third = store.addNode('lamp', 180, 30)

    store.circuit.selection = { nodes: [first.id, second.id], wires: [] }
    store.groupSelection()
    store.circuit.selection = { nodes: [second.id, third.id], wires: [] }
    store.groupSelection()

    expect(store.circuit.groups).toHaveLength(1)
    expect(new Set(store.circuit.groups[0].nodes)).toEqual(
      new Set([first.id, second.id, third.id]),
    )
  })

  it('restores the circuit after clearing it', async () => {
    const store = await loadStore()
    const source = store.addNode('switch', 10, 10)
    const lamp = store.addNode('lamp', 200, 10)

    store.connect(
      { nodeId: source.id, port: 'out' },
      { nodeId: lamp.id, port: 'a' },
    )
    store.toggleRunning()
    store.clearCircuit()

    expect(store.circuit.nodes).toEqual([])
    expect(store.circuit.wires).toEqual([])
    expect(store.circuit.running).toBe(false)

    store.undo()

    expect(store.circuit.nodes.map(node => node.id)).toEqual([source.id, lamp.id])
    expect(store.circuit.wires).toHaveLength(1)
  })
})
