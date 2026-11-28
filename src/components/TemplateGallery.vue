<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { CircuitTemplate } from '../circuit/templates'
import { i18n, t } from '../i18n'

type TemplateLoadState = 'idle' | 'loading' | 'error'

const props = defineProps<{
  open: boolean
  templates: CircuitTemplate[]
  templateStates: Record<string, TemplateLoadState>
  loadingTemplateId: string | null
  loading: boolean
  error: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'retry'): void
  (e: 'load-template', template: CircuitTemplate): void
}>()

const dialog = ref<HTMLDialogElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)

function syncDialog(open: boolean) {
  if (!dialog.value) return
  if (open && !dialog.value.open) {
    dialog.value.showModal()
    void nextTick(() => {
      if (props.loading) closeButton.value?.focus({ preventScroll: true })
      else dialog.value
        ?.querySelector<HTMLButtonElement>('.gallery-card:not(:disabled)')
        ?.focus({ preventScroll: true })
    })
  } else if (!open && dialog.value.open) {
    dialog.value.close()
  }
}

function close() {
  dialog.value?.close()
  emit('close')
}

function load(template: CircuitTemplate) {
  emit('load-template', template)
}

function templateState(template: CircuitTemplate): TemplateLoadState {
  return props.templateStates[template.id] ?? 'idle'
}

function templateAction(template: CircuitTemplate): string {
  const state = templateState(template)
  if (state === 'loading') return t('templates.itemLoading')
  if (state === 'error') return t('templates.itemLoadError')
  return t('templates.load')
}

function focusTemplate(id: string) {
  dialog.value
    ?.querySelector<HTMLButtonElement>(`[data-template="${id}"]`)
    ?.focus({ preventScroll: true })
}

function onCancel(ev: Event) {
  ev.preventDefault()
  close()
}

function onDialogClick(ev: MouseEvent) {
  const el = dialog.value
  if (!el || ev.target !== el) return
  const rect = el.getBoundingClientRect()
  if (
    ev.clientX < rect.left ||
    ev.clientX > rect.right ||
    ev.clientY < rect.top ||
    ev.clientY > rect.bottom
  ) {
    close()
  }
}

watch(() => props.open, syncDialog)
onBeforeUnmount(() => dialog.value?.close())

defineExpose({ close, focusTemplate })
</script>

<template>
  <dialog
    id="template-gallery"
    ref="dialog"
    class="template-gallery"
    :aria-labelledby="'template-gallery-title'"
    :aria-describedby="'template-gallery-note'"
    :aria-busy="loading"
    @cancel="onCancel"
    @click="onDialogClick"
  >
    <div class="gallery-head">
      <div>
        <h2 id="template-gallery-title">{{ t('templates.moreTitle') }}</h2>
        <p id="template-gallery-note">{{ t('templates.note') }}</p>
      </div>
      <button
        ref="closeButton"
        class="gallery-close"
        :aria-label="t('templates.close')"
        :title="t('templates.close')"
        @click="close"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m7 7 10 10M17 7 7 17" />
        </svg>
      </button>
    </div>

    <div v-if="loading" class="gallery-status" role="status">
      {{ t('templates.loading') }}
    </div>
    <div v-else-if="error" class="gallery-status" role="alert">
      <p>{{ t('templates.loadError') }}</p>
      <button class="gallery-retry" @click="emit('retry')">{{ t('templates.retry') }}</button>
    </div>
    <div v-else class="gallery-grid">
      <button
        v-for="template in templates"
        :key="template.id"
        class="gallery-card"
        :data-template="template.id"
        :disabled="loadingTemplateId !== null"
        :aria-busy="loadingTemplateId === template.id"
        @click="load(template)"
      >
        <span class="gallery-card-name">{{ template.name[i18n.locale] }}</span>
        <span class="gallery-card-desc">{{ template.description[i18n.locale] }}</span>
        <span
          class="gallery-card-action"
          :class="{ error: templateState(template) === 'error' }"
          aria-live="polite"
        >
          {{ templateAction(template) }}
        </span>
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.template-gallery {
  width: min(720px, calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  margin: auto;
  padding: 0;
  overflow: hidden;
  color: var(--ink);
  background: var(--panel-solid);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 24px 80px rgba(30, 40, 70, 0.18);
}

.template-gallery[open] {
  display: flex;
  flex-direction: column;
}

.template-gallery::backdrop {
  background: rgba(38, 44, 62, 0.24);
  backdrop-filter: blur(3px);
}

.gallery-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 24px 24px 18px;
  border-bottom: 1px solid var(--line);
}

.gallery-head h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.2px;
}

.gallery-head p {
  margin: 6px 0 0;
  color: var(--ink-faint);
  font-size: 12px;
  line-height: 1.5;
}

.gallery-close {
  width: 32px;
  height: 32px;
  flex: none;
  display: grid;
  place-items: center;
  color: var(--ink-soft);
  border-radius: 9px;
  transition: background 0.12s;
}

.gallery-close:hover {
  background: var(--bg);
  color: var(--ink);
}

.gallery-close svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 20px 24px 24px;
  overflow-y: auto;
}

.gallery-card {
  min-height: 132px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 7px;
  padding: 16px;
  text-align: left;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 13px;
  transition:
    border-color 0.12s,
    background 0.12s,
    transform 0.12s;
}

.gallery-card:hover {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  transform: translateY(-1px);
}

.gallery-card:disabled {
  cursor: wait;
}

.gallery-card:disabled:hover {
  background: var(--bg);
  border-color: var(--line);
  transform: none;
}

.gallery-card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}

.gallery-card-desc {
  flex: 1;
  font-size: 12px;
  line-height: 1.55;
  color: var(--ink-soft);
}

.gallery-card-action {
  font-size: 11.5px;
  color: var(--accent-ink);
}

.gallery-card-action.error {
  color: var(--signal);
}

.gallery-status {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 28px;
  color: var(--ink-soft);
  font-size: 13px;
}

.gallery-status p {
  margin: 0;
}

.gallery-retry {
  padding: 8px 14px;
  color: var(--accent-ink);
  background: var(--accent-soft);
  border-radius: 9px;
}

@media (max-width: 600px) {
  .gallery-head {
    padding: 20px 18px 16px;
  }

  .gallery-grid {
    grid-template-columns: 1fr;
    padding: 16px 18px 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gallery-card {
    transition: none;
  }
}
</style>
