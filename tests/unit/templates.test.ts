import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCircuit, type CircuitData } from '../../src/circuit/persist'
import { advance, createRuntime, simulate } from '../../src/circuit/simulate'
import { loadTemplateCatalog, loadTemplateData } from '../../src/circuit/templates'
import type { Bit } from '../../src/types'

interface CatalogEntry {
  id: string
  file: string
  featured: boolean
  name: { zh: string; en: string }
  description: { zh: string; en: string }
}

const templateDir = new URL('../../public/templates/', import.meta.url)
const catalog = JSON.parse(readFileSync(new URL('index.json', templateDir), 'utf8')) as CatalogEntry[]
const circuits = new Map(
  catalog.map(entry => [entry.id, parseCircuit(readFileSync(new URL(entry.file, templateDir), 'utf8'))]),
)

afterEach(() => {
  vi.unstubAllGlobals()
})

function template(id: string): CircuitData {
  const data = circuits.get(id)
  if (!data) throw new Error(`missing template: ${id}`)
  return structuredClone(data)
}

function setSwitch(data: CircuitData, id: string, value: Bit) {
  const node = data.nodes.find(item => item.id === id)
  if (!node || node.type !== 'switch') throw new Error(`missing switch: ${id}`)
  node.value = value
}

function lampValue(data: CircuitData, id: string): Bit {
  return simulate(data.nodes, data.wires, createRuntime(), 0).ins.get(`${id}:a`) ?? 0
}

function bits(value: number, count: number): Bit[] {
  return Array.from({ length: count }, (_, index) => ((value >> index) & 1) as Bit)
}

describe('template files', () => {
  it('provides five quick templates and six more templates', () => {
    expect(catalog).toHaveLength(11)
    expect(catalog.filter(entry => entry.featured)).toHaveLength(5)
    expect(catalog.filter(entry => !entry.featured)).toHaveLength(6)
    expect(new Set(catalog.map(entry => entry.id)).size).toBe(catalog.length)
    expect(new Set(catalog.map(entry => entry.file)).size).toBe(catalog.length)
  })

  it.each(catalog)('loads $id as a valid circuit with localized metadata', entry => {
    const data = circuits.get(entry.id)
    expect(data?.nodes.length).toBeGreaterThan(0)
    expect(entry.name.zh).not.toBe('')
    expect(entry.name.en).not.toBe('')
    expect(entry.description.zh).not.toBe('')
    expect(entry.description.en).not.toBe('')
  })
})

describe('template loading', () => {
  it('loads only the catalog without fetching circuit files', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadTemplateCatalog()).resolves.toEqual(catalog)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${import.meta.env.BASE_URL}templates/index.json`)
  })

  it('loads and parses one circuit file on demand', async () => {
    const entry = catalog.find(item => item.id === 'mux-4-1')!
    const source = readFileSync(new URL(entry.file, templateDir), 'utf8')
    const fetchMock = vi.fn().mockResolvedValue(new Response(source, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadTemplateData(entry)).resolves.toEqual(circuits.get(entry.id))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${import.meta.env.BASE_URL}templates/${entry.file}`)
  })

  it('rejects a missing circuit file without rejecting the catalog', async () => {
    const entry = catalog[0]
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadTemplateData(entry)).rejects.toThrow(`failed to load template: ${entry.id}`)
  })

  it('forwards cancellation to the circuit request', async () => {
    const entry = catalog[0]
    const controller = new AbortController()
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const request = loadTemplateData(entry, controller.signal)
    controller.abort()

    await expect(request).rejects.toThrow('Aborted')
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal)
  })
})

describe('combinational templates', () => {
  it('selects every 4:1 multiplexer input for all input combinations', () => {
    for (let combination = 0; combination < 64; combination += 1) {
      const data = template('mux-4-1')
      const values = bits(combination, 6)
      setSwitch(data, 'a', values[0])
      setSwitch(data, 'b', values[1])
      setSwitch(data, 'c', values[2])
      setSwitch(data, 'd', values[3])
      setSwitch(data, 's0', values[4])
      setSwitch(data, 's1', values[5])
      const selected = values[values[4] + values[5] * 2]
      expect(lampValue(data, 'y')).toBe(selected)
    }
  })

  it('activates exactly one 2-to-4 decoder output', () => {
    for (let input = 0; input < 4; input += 1) {
      const data = template('decoder-2-4')
      const [s0, s1] = bits(input, 2)
      setSwitch(data, 's0', s0)
      setSwitch(data, 's1', s1)
      expect([0, 1, 2, 3].map(index => lampValue(data, `y${index}`))).toEqual(
        [0, 1, 2, 3].map(index => (index === input ? 1 : 0)),
      )
    }
  })

  it('adds every pair of four-bit numbers with carry-in', () => {
    for (let a = 0; a < 16; a += 1) {
      for (let b = 0; b < 16; b += 1) {
        for (const cin of [0, 1] as Bit[]) {
          const data = template('ripple-adder-4')
          bits(a, 4).forEach((value, index) => setSwitch(data, `a${index}`, value))
          bits(b, 4).forEach((value, index) => setSwitch(data, `b${index}`, value))
          setSwitch(data, 'cin', cin)
          const result = simulate(data.nodes, data.wires, createRuntime(), 0)
          const sum = bits(a + b + cin, 5)
          expect([0, 1, 2, 3].map(index => result.ins.get(`sum${index}:a`))).toEqual(sum.slice(0, 4))
          expect(result.ins.get('cout:a')).toBe(sum[4])
        }
      }
    }
  })

  it('decodes BCD digits 0 through 9 into seven-segment outputs', () => {
    const expected = [
      'abcdef',
      'bc',
      'abdeg',
      'abcdg',
      'bcfg',
      'acdfg',
      'acdefg',
      'abc',
      'abcdefg',
      'abcdfg',
    ]
    for (let value = 0; value < 10; value += 1) {
      const data = template('seven-segment-decoder')
      const [d, c, b, a] = bits(value, 4)
      setSwitch(data, 'a', a)
      setSwitch(data, 'b', b)
      setSwitch(data, 'c', c)
      setSwitch(data, 'd', d)
      const actual = 'abcdefg'
        .split('')
        .filter(segment => lampValue(data, `seg-${segment}`) === 1)
        .join('')
      expect(actual).toBe(expected[value])
    }
  })
})

describe('sequential templates', () => {
  it('shifts four serial bits through the shift register', () => {
    const data = template('shift-register-4')
    const runtime = createRuntime()
    const states: Bit[][] = []
    advance(data.nodes, data.wires, runtime, 0)
    for (let edge = 1; edge <= 4; edge += 1) {
      advance(data.nodes, data.wires, runtime, edge * 1000 - 500)
      states.push([0, 1, 2, 3].map(index => runtime.ffQ[`ff${index}`] ?? 0))
      advance(data.nodes, data.wires, runtime, edge * 1000)
    }
    expect(states).toEqual([
      [1, 0, 0, 0],
      [1, 1, 0, 0],
      [1, 1, 1, 0],
      [1, 1, 1, 1],
    ])
  })

  it('counts 00, 01, 10, 11 and wraps to 00', () => {
    const data = template('binary-counter-2')
    const runtime = createRuntime()
    const states: Bit[][] = []
    advance(data.nodes, data.wires, runtime, 0)
    for (let edge = 1; edge <= 4; edge += 1) {
      advance(data.nodes, data.wires, runtime, edge * 1000 - 500)
      states.push([runtime.ffQ.ff1 ?? 0, runtime.ffQ.ff0 ?? 0])
      advance(data.nodes, data.wires, runtime, edge * 1000)
    }
    expect(states).toEqual([
      [0, 1],
      [1, 0],
      [1, 1],
      [0, 0],
    ])
  })
})
