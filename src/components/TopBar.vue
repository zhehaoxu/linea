<script setup lang="ts">
import { computed } from 'vue'
import { circuit, historyState } from '../circuit/store'
import { t, modLabel, shiftModLabel } from '../i18n'

const emit = defineEmits<{
  (e: 'run'): void
  (e: 'clear'): void
  (e: 'undo'): void
  (e: 'redo'): void
  (e: 'zoom-in'): void
  (e: 'zoom-out'): void
  (e: 'fit'): void
  (e: 'export'): void
  (e: 'import'): void
}>()

const zoomLabel = computed(() => `${Math.round(circuit.view.zoom * 100)}%`)
const undoTip = computed(() => t('topbar.undo', { mod: modLabel }))
const redoTip = computed(() => t('topbar.redo', { shiftMod: shiftModLabel }))
</script>

<template>
  <div class="topbar">
    <button v-if="!circuit.running" class="btn primary" @click="emit('run')">
      <svg viewBox="0 0 24 24" class="btn-icon solid" aria-hidden="true">
        <path d="M8 5.5v13l10-6.5-10-6.5Z" />
      </svg>
      {{ t('topbar.run') }}
    </button>
    <button v-else class="btn stop" @click="emit('run')">
      <svg viewBox="0 0 24 24" class="btn-icon solid" aria-hidden="true">
        <path d="M8 8h8v8H8Z" />
      </svg>
      {{ t('topbar.stop') }}
    </button>
    <span v-if="circuit.running" class="live" role="status" aria-live="polite">
      <i aria-hidden="true" />{{ t('topbar.simulating') }}
    </span>

    <div class="sep" />

    <button
      class="icon-btn"
      :data-tip="undoTip"
      :aria-label="undoTip"
      :disabled="!historyState.canUndo"
      @click="emit('undo')"
    >
      <svg viewBox="0 0 24 24" class="icon-glyph" aria-hidden="true">
        <path d="M8.5 5.5 4 10l4.5 4.5" />
        <path d="M4 10h9.5a5.5 5.5 0 0 1 0 11H10" />
      </svg>
    </button>
    <button
      class="icon-btn"
      :data-tip="redoTip"
      :aria-label="redoTip"
      :disabled="!historyState.canRedo"
      @click="emit('redo')"
    >
      <svg viewBox="0 0 24 24" class="icon-glyph" aria-hidden="true">
        <path d="M15.5 5.5 20 10l-4.5 4.5" />
        <path d="M20 10h-9.5a5.5 5.5 0 0 0 0 11H14" />
      </svg>
    </button>

    <button class="btn" @click="emit('clear')">
      <svg viewBox="0 0 24 24" class="btn-icon" aria-hidden="true">
        <path d="M4.5 7h15M9.5 7V4.8h5V7M7 7l.8 12h8.4L17 7M10.5 10.5V16M13.5 10.5V16" />
      </svg>
      {{ t('topbar.clear') }}
    </button>

    <div class="sep" />

    <div class="zoom">
      <button :data-tip="t('topbar.zoomOut')" :aria-label="t('topbar.zoomOut')" @click="emit('zoom-out')">−</button>
      <span>{{ zoomLabel }}</span>
      <button :data-tip="t('topbar.zoomIn')" :aria-label="t('topbar.zoomIn')" @click="emit('zoom-in')">+</button>
    </div>

    <div class="sep" />

    <button class="btn" @click="emit('fit')">
      <svg viewBox="0 0 24 24" class="btn-icon" aria-hidden="true">
        <path
          d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"
        />
      </svg>
      {{ t('topbar.fit') }}
    </button>

    <div class="sep" />

    <button
      class="icon-btn"
      :data-tip="t('topbar.export')"
      :aria-label="t('topbar.export')"
      @click="emit('export')"
    >
      <svg viewBox="0 0 24 24" class="icon-glyph" aria-hidden="true">
        <path d="M12 14.5V4M8.5 7 12 3.5 15.5 7" />
        <path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
      </svg>
    </button>
    <button
      class="icon-btn"
      :data-tip="t('topbar.import')"
      :aria-label="t('topbar.import')"
      @click="emit('import')"
    >
      <svg viewBox="0 0 24 24" class="icon-glyph" aria-hidden="true">
        <path d="M12 3.5V14M8.5 10.5 12 14l3.5-3.5" />
        <path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.topbar {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 7;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(14px);
  user-select: none;
  white-space: nowrap;
}

.btn {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 13px;
  white-space: nowrap;
  color: var(--ink-soft);
  transition:
    background 0.15s,
    color 0.15s;
}

.btn:hover {
  background: #f2f3f7;
  color: var(--ink);
}

.btn.primary {
  background: var(--accent);
  color: #fff;
  box-shadow: 0 1px 2px rgba(80, 92, 184, 0.28);
}

.btn.primary:hover {
  background: #5f6cd0;
  color: #fff;
}

.btn.stop {
  background: #f8efef;
  color: #a46460;
  border: 1px solid #efdddc;
}

.btn.stop:hover {
  background: #f2e5e4;
  color: #94524d;
}

.live {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  font-size: 11.5px;
  color: #6f8a63;
  background: #f1f7ee;
  border: 1px solid #e0ebd9;
  border-radius: 999px;
}

.live i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #8ab878;
  animation: live-pulse 1.6s ease-in-out infinite;
}

@keyframes live-pulse {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.btn-icon {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.btn-icon.solid {
  fill: currentColor;
  stroke: none;
}

.icon-btn {
  position: relative;
  flex: none;
  width: 30px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  color: var(--ink-soft);
  transition:
    background 0.15s,
    color 0.15s;
}

.icon-btn:hover {
  background: #f2f3f7;
  color: var(--ink);
}

.icon-btn:disabled {
  background: transparent;
  color: var(--ink-faint);
  opacity: 0.55;
  cursor: default;
}

.icon-btn.active {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.icon-glyph {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sep {
  flex: none;
  width: 1px;
  height: 20px;
  background: var(--line);
  margin: 0 5px;
}

.zoom {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
}

.zoom button {
  position: relative;
  width: 30px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 15px;
  line-height: 1;
  color: var(--ink-soft);
  transition:
    background 0.15s,
    color 0.15s;
}

.zoom button:hover {
  background: #f2f3f7;
  color: var(--ink);
}

.zoom span {
  min-width: 46px;
  text-align: center;
  font-size: 12px;
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}

.icon-btn::after,
.zoom button::after {
  content: attr(data-tip);
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  z-index: 2;
  transform: translateX(-50%) scale(0.96);
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

.icon-btn:hover::after,
.icon-btn:focus-visible::after,
.zoom button:hover::after,
.zoom button:focus-visible::after {
  opacity: 1;
  transform: translateX(-50%) scale(1);
}

@media (max-width: 720px) {
  .topbar {
    gap: 2px;
  }

  .btn {
    padding: 0 10px;
  }

  .btn-icon {
    display: none;
  }

  .sep {
    margin: 0 3px;
  }

  .live {
    display: none;
  }
}

@media (max-width: 480px) {
  .topbar {
    gap: 1px;
    padding: 5px;
    max-width: calc(100vw - 16px);
  }

  .btn {
    gap: 4px;
    padding: 0 7px;
    font-size: 12px;
  }

  .icon-btn {
    width: 26px;
  }

  .sep {
    display: none;
  }

  .zoom button {
    width: 26px;
  }

  .zoom span {
    min-width: 34px;
    font-size: 11px;
  }
}
</style>
