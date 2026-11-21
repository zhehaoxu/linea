<script setup lang="ts">
import { i18n, t, toggleLocale } from '../i18n'
</script>

<template>
  <button
    class="lang-switch"
    :title="t('language.switch')"
    :aria-label="t('language.switch')"
    @click="toggleLocale"
  >
    <svg viewBox="0 0 24 24" class="lang-icon" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5S9.6 5.8 12 3.5Z" />
    </svg>
    <span class="lang-opt" :class="{ on: i18n.locale === 'zh' }">中文</span>
    <span class="lang-sep" aria-hidden="true" />
    <span class="lang-opt" :class="{ on: i18n.locale === 'en' }">EN</span>
  </button>
</template>

<style scoped>
.lang-switch {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 7;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding: 0 8px;
  color: var(--ink-faint);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(14px);
  user-select: none;
  transition:
    background 0.15s,
    color 0.15s;
}

.lang-switch:hover {
  color: var(--ink);
}

.lang-icon {
  flex: none;
  width: 15px;
  height: 15px;
  margin-right: 1px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.lang-opt {
  padding: 3px 5px;
  border-radius: 6px;
  font-size: 11.5px;
  line-height: 1;
  color: var(--ink-faint);
  transition:
    background 0.15s,
    color 0.15s;
}

.lang-opt.on {
  color: var(--accent-ink);
  background: var(--accent-soft);
}

.lang-sep {
  width: 1px;
  height: 12px;
  background: var(--line);
}

@media (max-width: 720px) {
  .lang-switch {
    top: 64px;
    right: 10px;
  }
}
</style>
