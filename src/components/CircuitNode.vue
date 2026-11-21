<script setup lang="ts">
import { computed } from 'vue'
import type { Bit, CircuitNode, NodeType, Vec } from '../types'
import { NODE_SPECS, nodeFrame, textMetrics } from '../circuit/specs'
import { nodeLabel } from '../i18n'

const props = defineProps<{
  node: CircuitNode
  selected: boolean
  connectedIns: string[]
  connectedOuts: string[]
  hoverPort: string | null
  running: boolean
  editing: boolean
  editingText?: string
  inValues: Record<string, Bit>
  outValues: Record<string, Bit>
}>()

const emit = defineEmits<{
  (e: 'bodydown', payload: { id: string; event: PointerEvent }): void
  (e: 'portdown', payload: { id: string; port: string; dir: 'in' | 'out'; event: PointerEvent }): void
  (e: 'edit', id: string): void
  (e: 'menu', payload: { id: string; event: MouseEvent }): void
}>()

type GateType = Exclude<NodeType, 'switch' | 'clock' | 'lamp' | 'display' | 'dff' | 'text'>

interface GateArt {
  fill: string
  stubs: string[]
  arcs?: string[]
  bubble?: Vec
}

const IN2 = 'M-10 14H8M-10 34H8'
const IN1 = 'M-10 24H8'
const OR_BODY = 'M0 0C15 1 32 9 44 24C32 39 15 47 0 48C12 35 12 13 0 0Z'
const XOR_ARC = 'M-7 0C5 13 5 35 -7 48'

const ART: Record<GateType, GateArt> = {
  and: {
    fill: 'M0 0H30A24 24 0 0 1 30 48H0Z',
    stubs: [IN2, 'M54 24H66'],
  },
  or: {
    fill: OR_BODY,
    stubs: [IN2, 'M44 24H66'],
  },
  not: {
    fill: 'M0 0L38 24L0 48Z',
    stubs: [IN1, 'M47 24H66'],
    bubble: { x: 42.6, y: 24 },
  },
  xor: {
    fill: OR_BODY,
    stubs: [IN2, 'M44 24H66'],
    arcs: [XOR_ARC],
  },
  nand: {
    fill: 'M0 0H30A24 24 0 0 1 30 48H0Z',
    stubs: [IN2, 'M63 24H66'],
    bubble: { x: 58.5, y: 24 },
  },
  nor: {
    fill: OR_BODY,
    stubs: [IN2, 'M53 24H66'],
    bubble: { x: 48.5, y: 24 },
  },
  xnor: {
    fill: OR_BODY,
    stubs: [IN2, 'M53 24H66'],
    arcs: [XOR_ARC],
    bubble: { x: 48.5, y: 24 },
  },
}

function gateArt(type: NodeType): GateArt | null {
  if (type !== 'and' && type !== 'or' && type !== 'not' && type !== 'xor' && type !== 'nand' && type !== 'nor' && type !== 'xnor') {
    return null
  }
  return ART[type]
}

const spec = computed(() => NODE_SPECS[props.node.type])
const art = computed(() => gateArt(props.node.type))
const textLines = computed(() => (props.node.text ?? '').split('\n'))

type SegKey = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g'

const SEG_KEYS: SegKey[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
const SEG_PATHS: Record<SegKey, string> = {
  a: 'M8 3H46',
  b: 'M49 6V44',
  c: 'M49 52V90',
  d: 'M8 93H46',
  e: 'M5 52V90',
  f: 'M5 6V44',
  g: 'M8 48H46',
}
const DIGIT_SEGMENTS: Record<number, string> = {
  0: 'abcdef',
  1: 'bc',
  2: 'abged',
  3: 'abgcd',
  4: 'fgbc',
  5: 'afgcd',
  6: 'afgecd',
  7: 'abc',
  8: 'abcdefg',
  9: 'abcdfg',
}
const OVERFLOW_SEGMENTS = new Set<SegKey>(['g'])

const display = computed(() => {
  if (!props.running) return { on: new Set<SegKey>(), over: false }
  const value =
    (props.inValues.a ?? 0) |
    ((props.inValues.b ?? 0) << 1) |
    ((props.inValues.c ?? 0) << 2) |
    ((props.inValues.d ?? 0) << 3)
  if (value > 9) return { on: OVERFLOW_SEGMENTS, over: true }
  return { on: new Set(DIGIT_SEGMENTS[value].split('') as SegKey[]), over: false }
})

const frame = computed(() => {
  if (props.editingText !== undefined) {
    const metrics = textMetrics(props.editingText)
    return { x: -8, y: -5, w: metrics.width + 14, h: metrics.height + 10 }
  }
  const rect = nodeFrame(props.node)
  return { x: rect.x - props.node.x, y: rect.y - props.node.y, w: rect.w, h: rect.h }
})
</script>

<template>
  <g
    class="node"
    :transform="`translate(${node.x} ${node.y})`"
    :data-id="node.id"
    :aria-label="nodeLabel(node.type)"
    role="button"
    tabindex="0"
    @pointerdown="emit('bodydown', { id: node.id, event: $event })"
    @dblclick.stop="node.type === 'text' && emit('edit', node.id)"
    @contextmenu.stop.prevent="emit('menu', { id: node.id, event: $event })"
  >
    <rect class="hit" :x="frame.x" :y="frame.y" :width="frame.w" :height="frame.h" rx="12" />
    <rect
      v-if="selected"
      class="selected-outline"
      :x="frame.x"
      :y="frame.y"
      :width="frame.w"
      :height="frame.h"
      rx="12"
    />
    <rect
      v-if="editing"
      class="text-edit-frame"
      :x="frame.x"
      :y="frame.y"
      :width="frame.w"
      :height="frame.h"
      rx="6"
      vector-effect="non-scaling-stroke"
    />
    <template v-if="node.type === 'text'">
      <text v-if="!editing" class="text-label" x="0" y="13" xml:space="preserve">
        <tspan v-for="(line, index) in textLines" :key="index" x="0" :y="13 + index * 18">{{ line }}</tspan>
      </text>
    </template>

    <template v-else-if="node.type === 'switch'">
      <path class="stub" d="M44 17H54" />
      <rect class="gate-body" x="0" y="0" :width="spec.width" :height="spec.height" rx="11" />
      <rect class="track" :class="{ on: node.value === 1 }" x="7" y="10.5" width="30" height="13" rx="6.5" />
      <circle class="knob" :class="{ on: node.value === 1 }" :cx="node.value === 1 ? 30.5 : 13.5" cy="17" r="5.2" />
    </template>

    <template v-else-if="node.type === 'clock'">
      <path class="stub" d="M48 18H58" />
      <rect class="gate-body" x="0" y="0" :width="spec.width" :height="spec.height" rx="10" />
      <path class="clock-wave" :class="{ live: running && outValues.out === 1 }" d="M9 23H16V13H25V23H34V13H39" />
      <text class="mini" x="24" y="32" text-anchor="middle">{{ node.freq ?? 1 }}Hz</text>
    </template>

    <template v-else-if="node.type === 'dff'">
      <path class="stub" d="M-10 14H0M-10 38H0M60 16H70M60 40H70" />
      <rect
        class="gate-body"
        :class="{ live: running && outValues.q === 1 }"
        x="0"
        y="0"
        :width="spec.width"
        :height="spec.height"
        rx="8"
      />
      <path class="clk-mark" d="M0 34L6 38L0 42" />
      <text class="label" x="7" y="18">D</text>
      <text class="label" x="48" y="20">Q</text>
      <text class="label" x="48" y="44">Q</text>
      <path class="label-bar" d="M47 36H54" />
    </template>

    <template v-else-if="node.type === 'lamp'">
      <path class="stub" d="M-10 24H0" />
      <rect class="gate-body" x="0" y="0" :width="spec.width" :height="spec.height" rx="14" />
      <circle class="lamp-core" :class="{ on: running && inValues.a === 1 }" cx="24" cy="20" r="8.5" />
      <path class="lamp-base" d="M18.5 32.5H29.5M21.5 36.5H26.5" />
    </template>

    <template v-else-if="node.type === 'display'">
      <path v-for="port in spec.ins" :key="`stub-${port.id}`" class="stub" :d="`M-10 ${port.y}H0`" />
      <rect
        class="gate-body display-body"
        :class="{ warn: display.over }"
        x="0"
        y="0"
        :width="spec.width"
        :height="spec.height"
        rx="14"
      />
      <rect class="display-panel" x="30" y="10" width="58" height="108" rx="10" />
      <text
        v-for="port in spec.ins"
        :key="`label-${port.id}`"
        class="display-pin"
        x="4"
        :y="port.y + 3.4"
      >{{ port.label }}</text>
      <g class="display-segs" transform="translate(36 16)">
        <path
          v-for="key in SEG_KEYS"
          :key="key"
          :d="SEG_PATHS[key]"
          class="seg"
          :class="[`seg-${key}`, { on: display.on.has(key), warn: display.over && key === 'g' }]"
        />
      </g>
    </template>

    <template v-else-if="art">
      <path v-for="d in art.stubs" :key="d" class="stub" :d="d" />
      <path class="gate-body" :class="{ live: running && outValues.out === 1 }" :d="art.fill" />
      <path v-for="d in art.arcs ?? []" :key="d" class="arc" :d="d" />
      <circle v-if="art.bubble" class="bubble" :cx="art.bubble.x" :cy="art.bubble.y" r="4.5" />
    </template>

    <g v-for="port in spec.ins" :key="`in-${port.id}`">
      <circle
        class="pin-dot"
        :class="{
          filled: connectedIns.includes(port.id),
          live: running && inValues[port.id] === 1,
          hot: hoverPort === port.id,
        }"
        :cx="port.x"
        :cy="port.y"
        r="3.2"
      />
      <circle
        class="pin-hit"
        :cx="port.x"
        :cy="port.y"
        r="9"
        @pointerdown.stop="emit('portdown', { id: node.id, port: port.id, dir: 'in', event: $event })"
      />
    </g>

    <g v-for="port in spec.outs" :key="`out-${port.id}`">
      <circle
        class="pin-dot"
        :class="{ filled: connectedOuts.includes(port.id), live: running && outValues[port.id] === 1 }"
        :cx="port.x"
        :cy="port.y"
        r="3.2"
      />
      <circle
        class="pin-hit"
        :cx="port.x"
        :cy="port.y"
        r="9"
        @pointerdown.stop="emit('portdown', { id: node.id, port: port.id, dir: 'out', event: $event })"
      />
    </g>

    <title>{{ nodeLabel(node.type) }}</title>
  </g>
</template>

<style scoped>
.node {
  cursor: move;
}

.node:focus {
  outline: none;
}

.node:focus-visible .hit {
  stroke: var(--accent);
  stroke-width: 1.6;
  stroke-dasharray: 5 4;
}

.text-label {
  font-size: 13px;
  fill: var(--ink);
  white-space: pre;
  user-select: none;
}

.hit {
  fill: transparent;
}

.selected-outline {
  fill: rgba(108, 121, 220, 0.05);
  stroke: var(--accent);
  stroke-width: 1.4;
}

.text-edit-frame {
  fill: rgba(255, 255, 255, 0.96);
  stroke: var(--accent);
  stroke-width: 1.3;
  stroke-dasharray: 5 4;
  pointer-events: none;
}

.gate-body {
  fill: #fff;
  stroke: #4a5163;
  stroke-width: 1.7;
  stroke-linejoin: round;
  transition: fill 0.12s;
}

.gate-body.live {
  fill: var(--signal-soft);
}

.stub {
  fill: none;
  stroke: #7d8598;
  stroke-width: 1.6;
  stroke-linecap: round;
}

.arc {
  fill: none;
  stroke: #4a5163;
  stroke-width: 1.7;
}

.clock-wave {
  fill: none;
  stroke: #59627a;
  stroke-width: 1.7;
  stroke-linejoin: round;
  stroke-linecap: round;
  transition: stroke 0.12s;
}

.clock-wave.live {
  stroke: var(--signal);
}

.mini {
  font-size: 8px;
  font-weight: 500;
  letter-spacing: 0.2px;
  fill: #8a92a4;
  user-select: none;
}

.label {
  font-size: 10px;
  font-weight: 500;
  fill: #59627a;
  user-select: none;
}

.label-bar {
  stroke: #59627a;
  stroke-width: 1.1;
}

.clk-mark {
  fill: none;
  stroke: #59627a;
  stroke-width: 1.3;
  stroke-linejoin: round;
}

.bubble {
  fill: #fff;
  stroke: #4a5163;
  stroke-width: 1.6;
}

.pin-dot {
  fill: #fff;
  stroke: #7d8598;
  stroke-width: 1.5;
  pointer-events: none;
}

.pin-dot.filled {
  fill: #7d8598;
}

.pin-dot.live {
  fill: var(--signal);
  stroke: #c78d47;
}

.pin-dot.hot {
  fill: var(--accent-soft);
  stroke: var(--accent);
  stroke-width: 2;
}

.pin-hit {
  fill: transparent;
  cursor: crosshair;
}

.track {
  fill: #eaedf3;
  stroke: #c6ccd9;
  stroke-width: 1.2;
}

.track.on {
  fill: #d7dbf6;
  stroke: #bcc2ee;
}

.knob {
  fill: #fff;
  stroke: #a7afc2;
  stroke-width: 1.3;
}

.knob.on {
  stroke: var(--accent);
  stroke-width: 1.6;
}

.lamp-core {
  fill: #eef0f5;
  stroke: #8a92a4;
  stroke-width: 1.6;
  transition:
    fill 0.15s,
    stroke 0.15s;
}

.lamp-core.on {
  fill: #ffd79b;
  stroke: #dd9f52;
  filter: drop-shadow(0 0 7px rgba(226, 164, 86, 0.55));
}

.lamp-base {
  fill: none;
  stroke: #8a92a4;
  stroke-width: 1.6;
  stroke-linecap: round;
}

.display-body {
  fill: #fbfbfe;
  transition: stroke 0.15s;
}

.display-body.warn {
  stroke: #c76a6a;
}

.display-panel {
  fill: #f4f5fa;
  stroke: #e6e8f1;
  stroke-width: 1;
}

.display-pin {
  font-size: 9.5px;
  font-weight: 500;
  fill: #59627a;
  user-select: none;
}

.seg {
  fill: none;
  stroke: #e5e7ef;
  stroke-width: 6;
  stroke-linecap: round;
  transition:
    stroke 0.12s,
    filter 0.12s;
}

.seg.on {
  stroke: var(--accent);
  filter: drop-shadow(0 0 3px rgba(108, 121, 220, 0.35));
}

.seg.on.warn {
  stroke: #c76a6a;
  filter: drop-shadow(0 0 3px rgba(185, 92, 92, 0.25));
}
</style>
