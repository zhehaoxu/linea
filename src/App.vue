<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import TopBar from './components/TopBar.vue'
import LeftToolbar from './components/LeftToolbar.vue'
import CircuitCanvas from './components/CircuitCanvas.vue'
import LanguageSwitch from './components/LanguageSwitch.vue'
import { circuit, clearCircuit, copySelection, cutSelection, duplicateSelection, importCircuit, pasteClipboard, redo, toggleRunning, undo } from './circuit/store'
import { parseCircuit, serializeCircuit } from './circuit/persist'
import type { CircuitTemplate } from './circuit/templates'
import type { BasicNodeType, Vec } from './types'

const canvas = ref<InstanceType<typeof CircuitCanvas> | null>(null)
const importInput = ref<HTMLInputElement | null>(null)

function handleDrop(type: BasicNodeType, point: Vec | null) {
  if (point) canvas.value?.addNodeAtClient(type, point.x, point.y)
  else canvas.value?.addNodeCenter(type)
}

function handleRun() {
  toggleRunning()
}

function handleClear() {
  clearCircuit()
}

function handleTemplate(template: CircuitTemplate) {
  importCircuit(template.data)
  canvas.value?.fitView()
}

function downloadFallback(text: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'linea-circuit.json'
  link.click()
  URL.revokeObjectURL(url)
}

interface SaveFileHandle {
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
}

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description?: string; accept: Record<string, string[]> }[]
}

async function handleExport() {
  const text = serializeCircuit(circuit.nodes, circuit.wires, circuit.groups, circuit.folds)
  const picker = (
    window as unknown as {
      showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<SaveFileHandle>
    }
  ).showSaveFilePicker
  if (typeof picker !== 'function') {
    downloadFallback(text)
    return
  }
  try {
    const handle = await picker.call(window, {
      suggestedName: 'linea-circuit.json',
      types: [{ description: 'Linea circuit', accept: { 'application/json': ['.json'] } }],
    })
    const writable = await handle.createWritable()
    await writable.write(text)
    await writable.close()
  } catch (error) {
    // 用户取消保存对话框不算失败
    if ((error as { name?: string })?.name === 'AbortError') return
  }
}

function requestImport() {
  importInput.value?.click()
}

async function handleImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const data = parseCircuit(await file.text())
    importCircuit(data)
    canvas.value?.fitView()
  } catch {
    // 无效文件保持当前画布不变
  }
}

function onShortcut(ev: KeyboardEvent) {
  if (!(ev.metaKey || ev.ctrlKey) || ev.altKey) return
  const key = ev.key.toLowerCase()
  if (key === 'z') {
    ev.preventDefault()
    if (ev.shiftKey) redo()
    else undo()
  } else if (key === 'y') {
    ev.preventDefault()
    redo()
  } else if (key === 'c') {
    ev.preventDefault()
    copySelection()
  } else if (key === 'x') {
    ev.preventDefault()
    cutSelection()
  } else if (key === 'v') {
    ev.preventDefault()
    pasteClipboard()
  } else if (key === 'd') {
    ev.preventDefault()
    duplicateSelection()
  }
}

onMounted(() => window.addEventListener('keydown', onShortcut))

onBeforeUnmount(() => window.removeEventListener('keydown', onShortcut))
</script>

<template>
  <div class="app">
    <div class="workspace">
      <CircuitCanvas ref="canvas" />
      <TopBar
        @run="handleRun"
        @clear="handleClear"
        @undo="undo"
        @redo="redo"
        @zoom-in="canvas?.zoomIn()"
        @zoom-out="canvas?.zoomOut()"
        @fit="canvas?.fitView()"
        @export="handleExport"
        @import="requestImport"
      />
      <input
        ref="importInput"
        type="file"
        accept=".json,application/json"
        class="import-input"
        @change="handleImportFile"
      />
      <LeftToolbar @drop="handleDrop" @load-template="handleTemplate" />
      <LanguageSwitch />
    </div>
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.workspace {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}

.import-input {
  display: none;
}
</style>
