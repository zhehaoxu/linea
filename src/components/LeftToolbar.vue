<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import NodeGlyph from './NodeGlyph.vue'
import { circuit } from '../circuit/store'
import { TEMPLATES, type CircuitTemplate } from '../circuit/templates'
import { t, templateDescription, templateName, type MessageKey } from '../i18n'
import type { BasicNodeType, NodeType, Vec } from '../types'

type CategoryKey = 'input' | 'gates' | 'output' | 'sequential'
type FlyoutKey = CategoryKey | 'templates'

interface Category {
  key: CategoryKey
  labelKey: MessageKey
  icon: NodeType
  items: { type: BasicNodeType; labelKey: MessageKey }[]
}

const CATEGORIES: Category[] = [
  {
    key: 'input',
    labelKey: 'category.input',
    icon: 'switch',
    items: [
      { type: 'switch', labelKey: 'node.switch' },
      { type: 'clock', labelKey: 'node.clock' },
    ],
  },
  {
    key: 'gates',
    labelKey: 'category.gates',
    icon: 'and',
    items: [
      { type: 'and', labelKey: 'node.and' },
      { type: 'or', labelKey: 'node.or' },
      { type: 'not', labelKey: 'node.not' },
      { type: 'xor', labelKey: 'node.xor' },
      { type: 'nand', labelKey: 'node.nand' },
      { type: 'nor', labelKey: 'node.nor' },
      { type: 'xnor', labelKey: 'node.xnor' },
    ],
  },
  {
    key: 'output',
    labelKey: 'category.output',
    icon: 'lamp',
    items: [
      { type: 'lamp', labelKey: 'node.lamp' },
      { type: 'display', labelKey: 'node.display' },
    ],
  },
  {
    key: 'sequential',
    labelKey: 'category.sequential',
    icon: 'dff',
    items: [{ type: 'dff', labelKey: 'node.dff' }],
  },
]

const emit = defineEmits<{
  (e: 'drop', type: BasicNodeType, point: Vec | null): void
  (e: 'load-template', template: CircuitTemplate): void
}>()

const toolbarEl = ref<HTMLElement | null>(null)
const flyoutEl = ref<HTMLElement | null>(null)
const triggerEl = ref<HTMLButtonElement | null>(null)
const openKey = ref<FlyoutKey | null>(null)
const pinned = reactive<Record<FlyoutKey, boolean>>({
  input: false,
  gates: false,
  output: false,
  sequential: false,
  templates: false,
})
const pos = reactive({ left: 0, top: 16 })
let anchorRect: DOMRect | null = null

const category = computed(() => CATEGORIES.find(item => item.key === openKey.value) ?? null)
const flyoutTitle = computed(() => {
  if (openKey.value === 'templates') return t('templates.title')
  return category.value ? t(category.value.labelKey) : ''
})
const pinOn = computed(() => (openKey.value ? pinned[openKey.value] : false))

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

async function toggleFlyout(key: FlyoutKey, ev: MouseEvent) {
  if (openKey.value === key) {
    closeFlyout()
    return
  }
  triggerEl.value = ev.currentTarget as HTMLButtonElement
  anchorRect = triggerEl.value.getBoundingClientRect()
  openKey.value = key
  await nextTick()
  alignFlyout()
  if (ev.detail === 0) focusFirstItem()
}

function focusFirstItem() {
  const item =
    flyoutEl.value?.querySelector<HTMLButtonElement>('.item, .template-item') ??
    flyoutEl.value?.querySelector<HTMLButtonElement>('.pin')
  item?.focus({ preventScroll: true })
}

function alignFlyout() {
  if (!anchorRect || !flyoutEl.value) return
  const width = flyoutEl.value.offsetWidth
  const height = flyoutEl.value.offsetHeight
  pos.left = clamp(anchorRect.right + 12, 16, window.innerWidth - width - 16)
  pos.top = clamp(anchorRect.top - 6, 16, Math.max(16, window.innerHeight - height - 16))
}

function closeFlyout(restoreFocus = false) {
  openKey.value = null
  anchorRect = null
  if (restoreFocus) triggerEl.value?.focus({ preventScroll: true })
}

function togglePin() {
  if (!openKey.value) return
  pinned[openKey.value] = !pinned[openKey.value]
}

function loadTemplate(template: CircuitTemplate, ev: MouseEvent) {
  emit('load-template', template)
  if (openKey.value && !pinned[openKey.value]) closeFlyout(ev.detail === 0)
}

function activateByKeyboard(categoryKey: CategoryKey, type: BasicNodeType, ev: MouseEvent) {
  if (ev.detail !== 0) return
  emit('drop', type, null)
  if (!pinned[categoryKey]) closeFlyout(true)
}

function chooseTool(tool: 'select' | 'pan') {
  circuit.tool = tool
  closeFlyout()
}

interface PickState {
  flyout: FlyoutKey
  type: BasicNodeType
  startX: number
  startY: number
  x: number
  y: number
  moved: boolean
}

const pick = ref<PickState | null>(null)

function beginPick(base: PickState) {
  pick.value = base
  window.addEventListener('pointermove', onPickMove)
  window.addEventListener('pointerup', onPickUp)
}

function startPick(categoryKey: CategoryKey, type: BasicNodeType, ev: PointerEvent) {
  if (ev.button !== 0) return
  ev.preventDefault()
  beginPick({
    flyout: categoryKey,
    type,
    startX: ev.clientX,
    startY: ev.clientY,
    x: ev.clientX,
    y: ev.clientY,
    moved: false,
  })
}

function onPickMove(ev: PointerEvent) {
  const current = pick.value
  if (!current) return
  current.x = ev.clientX
  current.y = ev.clientY
  if (Math.hypot(ev.clientX - current.startX, ev.clientY - current.startY) > 4) current.moved = true
}

function stopPick() {
  window.removeEventListener('pointermove', onPickMove)
  window.removeEventListener('pointerup', onPickUp)
}

function onPickUp(ev: PointerEvent) {
  const current = pick.value
  stopPick()
  pick.value = null
  if (!current) return
  const point = current.moved ? { x: ev.clientX, y: ev.clientY } : null
  emit('drop', current.type, point)
  if (!pinned[current.flyout]) closeFlyout()
}

function onOutsidePointerDown(ev: PointerEvent) {
  if (!openKey.value) return
  if (pinned[openKey.value]) return
  const target = ev.target as Node | null
  if (!target) return
  if (toolbarEl.value?.contains(target) || flyoutEl.value?.contains(target)) return
  closeFlyout()
}

function onKey(ev: KeyboardEvent) {
  if (ev.key !== 'Escape' || !openKey.value) return
  const target = ev.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .ctx-menu')) {
    return
  }
  const active = document.activeElement
  const restoreFocus = active === triggerEl.value || !!flyoutEl.value?.contains(active)
  ev.preventDefault()
  ev.stopPropagation()
  closeFlyout(restoreFocus)
}

function onResize() {
  alignFlyout()
}

onMounted(() => {
  window.addEventListener('pointerdown', onOutsidePointerDown, true)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onOutsidePointerDown, true)
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('resize', onResize)
  stopPick()
})
</script>

<template>
  <aside ref="toolbarEl" class="toolbar">
    <button
      class="tool"
      :data-label="t('tool.select')"
      :aria-label="t('tool.select')"
      :aria-pressed="circuit.tool === 'select'"
      :class="{ active: circuit.tool === 'select' }"
      @click="chooseTool('select')"
    >
      <svg viewBox="0 0 24 24" class="icon">
        <path d="M6 4.5 17.5 11l-5.2 1.3-2.6 4.9L6 4.5Z" />
      </svg>
    </button>
    <button
      class="tool"
      :data-label="t('tool.pan')"
      :aria-label="t('tool.pan')"
      :aria-pressed="circuit.tool === 'pan'"
      :class="{ active: circuit.tool === 'pan' }"
      @click="chooseTool('pan')"
    >
      <svg viewBox="0 0 24 24" class="icon">
        <path
          d="M8.5 11V6.8a1.6 1.6 0 0 1 3.2 0V10M11.7 10V5.8a1.6 1.6 0 0 1 3.2 0V10M14.9 10V7.4a1.6 1.6 0 0 1 3.2 0v7.4a6.2 6.2 0 0 1-6.2 6.2h-1.4a5 5 0 0 1-3.6-1.5l-3-3a1.7 1.7 0 0 1 2.4-2.4l1.6 1.6"
        />
      </svg>
    </button>
    <div class="sep" />
    <button
      v-for="item in CATEGORIES"
      :key="item.key"
      class="tool"
      :data-label="t(item.labelKey)"
      :aria-label="t(item.labelKey)"
      :class="{ active: openKey === item.key }"
      :aria-expanded="openKey === item.key"
      :aria-controls="openKey === item.key ? 'toolbar-flyout' : undefined"
      @click="toggleFlyout(item.key, $event)"
    >
      <NodeGlyph :type="item.icon" />
    </button>
    <div class="sep" />
    <button
      class="tool"
      :data-label="t('templates.button')"
      :aria-label="t('templates.button')"
      :class="{ active: openKey === 'templates' }"
      :aria-expanded="openKey === 'templates'"
      :aria-controls="openKey === 'templates' ? 'toolbar-flyout' : undefined"
      @click="toggleFlyout('templates', $event)"
    >
      <svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
        <rect x="4" y="4" width="7" height="7" rx="1.4" />
        <rect x="13" y="4" width="7" height="7" rx="1.4" />
        <rect x="4" y="13" width="7" height="7" rx="1.4" />
        <path d="M16.5 13v7M13 16.5h7" />
      </svg>
    </button>
  </aside>

  <Transition name="flyout">
    <div
      v-if="openKey"
      id="toolbar-flyout"
      ref="flyoutEl"
      class="flyout"
      role="group"
      aria-labelledby="toolbar-flyout-title"
      :class="{ templates: openKey === 'templates' }"
      :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
    >
      <div class="flyout-head">
        <span id="toolbar-flyout-title" class="flyout-title">{{ flyoutTitle }}</span>
        <button
          class="pin"
          :class="{ on: pinOn }"
          :title="pinOn ? t('templates.unpin') : t('templates.pin')"
          :aria-label="pinOn ? t('templates.unpin') : t('templates.pin')"
          :aria-pressed="pinOn"
          @click.stop="togglePin"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 3h6M10 3v5L6.5 11.5h11L14 8V3M12 11.5V21" />
          </svg>
        </button>
      </div>
      <template v-if="category">
        <button
          v-for="item in category.items"
          :key="item.type"
          class="item"
          :data-label="t(item.labelKey)"
          @pointerdown="startPick(category.key, item.type, $event)"
          @click="activateByKeyboard(category.key, item.type, $event)"
        >
          <span class="item-icon"><NodeGlyph :type="item.type" /></span>
          <span>{{ t(item.labelKey) }}</span>
        </button>
      </template>
      <template v-else>
        <button
          v-for="template in TEMPLATES"
          :key="template.id"
          class="template-item"
          @click="loadTemplate(template, $event)"
        >
          <span class="template-name">{{ templateName(template.id) }}</span>
          <span class="template-desc">{{ templateDescription(template.id) }}</span>
        </button>
        <p class="template-note">{{ t('templates.note') }}</p>
      </template>
    </div>
  </Transition>

  <div v-if="pick" class="pick-ghost" :style="{ left: `${pick.x + 18}px`, top: `${pick.y + 14}px` }">
    <NodeGlyph :type="pick.type" />
  </div>
</template>

<style scoped>
.toolbar {
  position: absolute;
  left: 16px;
  top: 16px;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 5px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(14px);
  user-select: none;
}

.tool {
  position: relative;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  color: #7b8294;
  transition:
    background 0.15s,
    color 0.15s;
}

.tool:hover {
  background: #f2f3f7;
  color: var(--ink);
}

.tool.active {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.tool::after {
  content: attr(data-label);
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%) scale(0.96);
  padding: 6px 10px;
  color: var(--ink-soft);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(14px);
  font-size: 11.5px;
  line-height: 1.2;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.12s,
    transform 0.12s;
}

.tool:hover::after,
.tool:focus-visible::after {
  opacity: 1;
  transform: translateY(-50%) scale(1);
}

.icon {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.sep {
  width: 24px;
  height: 1px;
  background: var(--line);
  margin: 4px 0;
}

.flyout {
  position: fixed;
  z-index: 8;
  width: 152px;
  padding: 5px 5px 7px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(14px);
  user-select: none;
}

.flyout.templates {
  width: 258px;
}

.template-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 7px 8px;
  border-radius: 9px;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s;
}

.template-item:hover {
  background: #f2f3f7;
}

.template-name {
  font-size: 12.5px;
  line-height: 1.35;
  color: var(--ink-soft);
  transition: color 0.12s;
}

.template-item:hover .template-name {
  color: var(--ink);
}

.template-desc {
  font-size: 10.5px;
  line-height: 1.35;
  color: var(--ink-faint);
}

.template-note {
  margin: 0;
  padding: 6px 8px 2px;
  font-size: 10.5px;
  color: var(--ink-faint);
}

.flyout-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 3px 3px 7px 8px;
}

.flyout-title {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.4px;
  color: var(--ink-faint);
}

.pin {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  color: var(--ink-faint);
  transition:
    background 0.15s,
    color 0.15s;
}

.pin:hover {
  background: #f2f3f7;
  color: var(--ink);
}

.pin.on {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.pin svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 8px;
  border-radius: 9px;
  font-size: 12.5px;
  color: var(--ink-soft);
  cursor: grab;
  text-align: left;
  touch-action: none;
  transition:
    background 0.12s,
    color 0.12s;
}

.item:hover {
  background: #f2f3f7;
  color: var(--ink);
}

.item:active {
  cursor: grabbing;
}

.item-icon {
  width: 24px;
  height: 20px;
  display: grid;
  place-items: center;
  color: #59627a;
  flex: none;
}

.flyout-enter-active,
.flyout-leave-active {
  transition:
    opacity 0.14s,
    transform 0.14s;
}

.flyout-enter-from,
.flyout-leave-to {
  opacity: 0;
  transform: translateX(-5px);
}

.pick-ghost {
  position: fixed;
  z-index: 60;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  background: #fff;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  box-shadow: var(--shadow-soft);
  color: #59627a;
  pointer-events: none;
  transform: translate(-50%, -50%) scale(1.03);
}

@media (max-width: 600px) {
  .toolbar {
    top: 72px;
  }
}
</style>
