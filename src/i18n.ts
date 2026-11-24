import { reactive, watch } from 'vue'
import type { NodeType } from './types'

export type Locale = 'zh' | 'en'

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

export const modLabel = isMac ? '⌘' : 'Ctrl+'
export const shiftModLabel = isMac ? '⇧⌘' : 'Ctrl+Shift+'
export const shiftLabel = isMac ? '⇧' : 'Shift+'

const LOCALE_KEY = 'linea.locale.v1'

const MESSAGES = {
  'app.title': { zh: 'Linea · 数字电路画布', en: 'Linea · Digital Circuit Canvas' },

  'menu.actions': { zh: '画布操作', en: 'Canvas actions' },
  'menu.group': { zh: '组合', en: 'Group' },
  'menu.ungroup': { zh: '解组', en: 'Ungroup' },
  'menu.collapse': { zh: '折叠', en: 'Collapse' },
  'menu.expand': { zh: '展开', en: 'Expand' },
  'menu.unfold': { zh: '取消折叠', en: 'Unfold' },
  'menu.rename': { zh: '重命名', en: 'Rename' },
  'menu.copy': { zh: '复制', en: 'Copy' },
  'menu.cut': { zh: '剪切', en: 'Cut' },
  'menu.paste': { zh: '粘贴', en: 'Paste' },
  'menu.duplicate': { zh: '创建副本', en: 'Duplicate' },
  'menu.delete': { zh: '删除', en: 'Delete' },
  'menu.deleteWire': { zh: '删除连线', en: 'Delete wire' },

  'topbar.run': { zh: '运行', en: 'Run' },
  'topbar.stop': { zh: '停止', en: 'Stop' },
  'topbar.simulating': { zh: '仿真中', en: 'Simulating' },
  'topbar.undo': { zh: '撤销 ({mod}Z)', en: 'Undo ({mod}Z)' },
  'topbar.redo': { zh: '重做 ({shiftMod}Z)', en: 'Redo ({shiftMod}Z)' },
  'topbar.clear': { zh: '清空', en: 'Clear' },
  'topbar.zoomOut': { zh: '缩小', en: 'Zoom out' },
  'topbar.zoomIn': { zh: '放大', en: 'Zoom in' },
  'topbar.fit': { zh: '适应画布', en: 'Fit view' },
  'topbar.export': { zh: '导出电路', en: 'Export circuit' },
  'topbar.import': { zh: '导入电路', en: 'Import circuit' },

  'tool.select': { zh: '选择 (V)', en: 'Select (V)' },
  'tool.pan': { zh: '抓手 (H)', en: 'Hand (H)' },

  'category.input': { zh: '输入器件', en: 'Inputs' },
  'category.gates': { zh: '基础门', en: 'Gates' },
  'category.output': { zh: '输出器件', en: 'Outputs' },
  'category.sequential': { zh: '时序器件', en: 'Sequential' },

  'node.switch': { zh: '输入开关', en: 'Input switch' },
  'node.clock': { zh: '时钟', en: 'Clock' },
  'node.lamp': { zh: '输出指示灯', en: 'Output lamp' },
  'node.display': { zh: '数码管', en: 'Seven-segment display' },
  'node.display4': { zh: '四位数码管', en: '4-digit display' },
  'node.text': { zh: '文本', en: 'Text' },
  'node.dff': { zh: 'D 触发器', en: 'D flip-flop' },
  'node.and': { zh: '与门', en: 'AND gate' },
  'node.or': { zh: '或门', en: 'OR gate' },
  'node.not': { zh: '非门', en: 'NOT gate' },
  'node.xor': { zh: '异或门', en: 'XOR gate' },
  'node.nand': { zh: '与非门', en: 'NAND gate' },
  'node.nor': { zh: '或非门', en: 'NOR gate' },
  'node.xnor': { zh: '同或门', en: 'XNOR gate' },

  'group.collapsed': { zh: '已折叠 · {count}', en: '{count} folded' },
  'group.expandHint': { zh: '双击展开', en: 'Double-click to expand' },

  'templates.button': { zh: '电路模板', en: 'Circuit templates' },
  'templates.title': { zh: '电路模板', en: 'Circuit templates' },
  'templates.note': {
    zh: '载入会替换当前画布，可撤销',
    en: 'Loading replaces the current canvas (undoable)',
  },
  'templates.pin': { zh: '固定弹出框', en: 'Pin panel' },
  'templates.unpin': { zh: '取消固定', en: 'Unpin panel' },

  'template.halfAdder.name': { zh: '半加器', en: 'Half adder' },
  'template.halfAdder.desc': {
    zh: '两个输入相加，输出和与进位',
    en: 'Adds two inputs and outputs sum and carry',
  },
  'template.fullAdder.name': { zh: '全加器', en: 'Full adder' },
  'template.fullAdder.desc': {
    zh: '带进位输入的一位加法器',
    en: 'One-bit adder with carry-in',
  },
  'template.mux.name': { zh: '2:1 多路选择器', en: '2:1 multiplexer' },
  'template.mux.desc': {
    zh: 'S=0 时输出 A，S=1 时输出 B',
    en: 'Outputs A when S=0 and B when S=1',
  },
  'template.srLatch.name': { zh: 'SR 锁存器', en: 'SR latch' },
  'template.srLatch.desc': {
    zh: '用两个或非门保存一位状态',
    en: 'Stores one bit with two NOR gates',
  },
  'template.dff.name': { zh: 'D 触发器', en: 'D flip-flop' },
  'template.dff.desc': {
    zh: '时钟上升沿锁存输入 D',
    en: 'Latches input D on the clock rising edge',
  },

  'language.switch': { zh: '切换到 English', en: 'Switch to 中文' },
} as const

export type MessageKey = keyof typeof MESSAGES

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch {
    // 存储不可用时使用默认语言
  }
  return 'zh'
}

export const i18n = reactive({ locale: initialLocale() })

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let text: string = MESSAGES[key][i18n.locale]
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value))
    }
  }
  return text
}

export function setLocale(locale: Locale) {
  i18n.locale = locale
  try {
    localStorage.setItem(LOCALE_KEY, locale)
  } catch {
    // 存储不可用时仅当前会话生效
  }
}

export function toggleLocale() {
  setLocale(i18n.locale === 'zh' ? 'en' : 'zh')
}

const NODE_LABEL_KEYS: Record<NodeType, MessageKey> = {
  switch: 'node.switch',
  clock: 'node.clock',
  lamp: 'node.lamp',
  display: 'node.display',
  text: 'node.text',
  dff: 'node.dff',
  and: 'node.and',
  or: 'node.or',
  not: 'node.not',
  xor: 'node.xor',
  nand: 'node.nand',
  nor: 'node.nor',
  xnor: 'node.xnor',
}

export function nodeLabel(type: NodeType): string {
  return t(NODE_LABEL_KEYS[type])
}

const TEMPLATE_NAME_KEYS: Record<string, MessageKey> = {
  'half-adder': 'template.halfAdder.name',
  'full-adder': 'template.fullAdder.name',
  'mux-2-1': 'template.mux.name',
  'sr-latch': 'template.srLatch.name',
  'dff-register': 'template.dff.name',
}

const TEMPLATE_DESC_KEYS: Record<string, MessageKey> = {
  'half-adder': 'template.halfAdder.desc',
  'full-adder': 'template.fullAdder.desc',
  'mux-2-1': 'template.mux.desc',
  'sr-latch': 'template.srLatch.desc',
  'dff-register': 'template.dff.desc',
}

export function templateName(id: string): string {
  const key = TEMPLATE_NAME_KEYS[id]
  return key ? t(key) : id
}

export function templateDescription(id: string): string {
  const key = TEMPLATE_DESC_KEYS[id]
  return key ? t(key) : ''
}

function applyDocumentLocale() {
  if (typeof document === 'undefined') return
  document.documentElement.lang = i18n.locale === 'zh' ? 'zh-CN' : 'en'
  document.title = t('app.title')
}

watch(() => i18n.locale, applyDocumentLocale, { immediate: true })
