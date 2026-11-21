<script setup lang="ts">
import { computed } from 'vue'
import type { NodeType } from '../types'

const props = defineProps<{ type: NodeType }>()

type GateType = Exclude<NodeType, 'switch' | 'clock' | 'lamp' | 'display' | 'dff' | 'text'>

const GLYPHS: Record<GateType, string[]> = {
  and: ['M4 3H11A7 7 0 0 1 11 17H4Z', 'M1 7H4M1 13H4M18 10H23'],
  or: ['M4 3C8.5 3 12.5 5.5 15 10C12.5 14.5 8.5 17 4 17C7 13 7 7 4 3Z', 'M1 7H4M1 13H4M15 10H23'],
  not: ['M4 3L15 10L4 17Z', 'M1 10H4M19 10H23', 'M15 10A2 2 0 1 1 19 10A2 2 0 1 1 15 10'],
  xor: [
    'M4.5 3C8.5 3 12 5.5 14.5 10C12 14.5 8.5 17 4.5 17C7.5 13 7.5 7 4.5 3Z',
    'M1.8 3C4.5 7 4.5 13 1.8 17',
    'M1 7H4.5M1 13H4.5M14.5 10H23',
  ],
  nand: [
    'M4 3H11A7 7 0 0 1 11 17H4Z',
    'M1 7H4M1 13H4M21.8 10H23.6',
    'M18 10A1.9 1.9 0 1 1 21.8 10A1.9 1.9 0 1 1 18 10',
  ],
  nor: [
    'M4 3C8.5 3 12.5 5.5 15 10C12.5 14.5 8.5 17 4 17C7 13 7 7 4 3Z',
    'M1 7H4M1 13H4M19 10H23',
    'M15 10A2 2 0 1 1 19 10A2 2 0 1 1 15 10',
  ],
  xnor: [
    'M4.5 3C8.5 3 12 5.5 14.5 10C12 14.5 8.5 17 4.5 17C7.5 13 7.5 7 4.5 3Z',
    'M1.8 3C4.5 7 4.5 13 1.8 17',
    'M1 7H4.5M1 13H4.5M19 10H23',
    'M15 10A2 2 0 1 1 19 10A2 2 0 1 1 15 10',
  ],
}

function pathsFor(type: NodeType): string[] {
  if (
    type === 'switch' ||
    type === 'clock' ||
    type === 'lamp' ||
    type === 'display' ||
    type === 'dff' ||
    type === 'text'
  ) {
    return []
  }
  return GLYPHS[type]
}

const paths = computed(() => pathsFor(props.type))
</script>

<template>
  <svg v-if="type === 'switch'" class="glyph" viewBox="0 0 24 20">
    <rect x="5" y="7" width="12" height="6" rx="3" />
    <circle class="knob" cx="13.8" cy="10" r="2.1" />
    <path d="M17 10H22" />
  </svg>
  <svg v-else-if="type === 'clock'" class="glyph" viewBox="0 0 24 20">
    <path d="M2 12H7V7H12V13H17V7H22" />
  </svg>
  <svg v-else-if="type === 'dff'" class="glyph" viewBox="0 0 24 20">
    <path d="M5 3H17A2 2 0 0 1 19 5V15A2 2 0 0 1 17 17H5Z" />
    <path d="M1 7H5M1 13H5M19 6H23M19 14H23" />
    <path d="M5.5 10L8.5 12L5.5 14" />
  </svg>
  <svg v-else-if="type === 'lamp'" class="glyph" viewBox="0 0 24 20">
    <circle cx="12" cy="8.5" r="4.6" />
    <path d="M9.6 15.2H14.4M10.8 17.6H13.2" />
  </svg>
  <svg v-else-if="type === 'display'" class="glyph" viewBox="0 0 24 20">
    <rect x="7" y="1.5" width="10" height="17" rx="2" />
    <path d="M9.5 4.5h5M16 5.5v4M16 10.5v4M9.5 15.5h5M8 10.5v4M8 5.5v4M9.5 10h5" />
  </svg>
  <svg v-else class="glyph" viewBox="0 0 24 20">
    <path v-for="(d, index) in paths" :key="index" :d="d" />
  </svg>
</template>

<style scoped>
.glyph {
  width: 24px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.glyph .knob {
  fill: currentColor;
  stroke: none;
}
</style>
