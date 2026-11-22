import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { TEMPLATES } from '../../src/circuit/templates'
import type { CircuitData } from '../../src/circuit/persist'

const HALF_ADDER = JSON.stringify(TEMPLATES.find(template => template.id === 'half-adder')?.data ?? {
  nodes: [],
  wires: [],
} satisfies CircuitData)

test.beforeEach(async ({ page }) => {
  // 首次加载写入半加器种子（初始画布为空）；sessionStorage 标记让 reload 保留刚写入的数据
  await page.addInitScript(seed => {
    if (sessionStorage.getItem('linea-e2e-ready') !== '1') {
      localStorage.clear()
      localStorage.setItem('linea.circuit.v1', seed)
      sessionStorage.setItem('linea-e2e-ready', '1')
    }
  }, HALF_ADDER)
  await page.goto('/')
  await expect(page.locator('.stage .node').first()).toBeVisible()
})

test('toolbar flyout works from the keyboard', async ({ page }) => {
  const trigger = page.getByRole('button', { name: '输入器件', exact: true })
  const panel = page.getByRole('group', { name: '输入器件' })
  const firstItem = panel.getByRole('button', { name: '输入开关', exact: true })
  const nodeCount = await page.locator('.stage .node').count()

  await trigger.focus()
  await page.keyboard.press('Enter')

  await expect(panel).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(trigger).toHaveAttribute('aria-controls', 'toolbar-flyout')
  await expect(firstItem).toBeFocused()

  await page.keyboard.press('Tab')
  await expect(panel.getByRole('button', { name: '时钟', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(firstItem).toBeFocused()

  await page.keyboard.press('Enter')

  await expect(page.locator('.stage .node')).toHaveCount(nodeCount + 1)
  await expect(panel).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')

  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.stage .node')).toHaveCount(nodeCount)
})

test('canvas shortcuts select all, clear selection, fit, and zoom', async ({ page }) => {
  const zoom = page.locator('.topbar .zoom span')
  const initialZoom = (await zoom.textContent()) ?? ''
  const nodeCount = await page.locator('.stage .node').count()
  const wireCount = await page.locator('.stage .wire').count()

  await page.keyboard.press('ControlOrMeta+a')
  await expect(page.locator('.stage .node .selected-outline')).toHaveCount(nodeCount)
  await expect(page.locator('.stage .wire.selected')).toHaveCount(wireCount)

  await page.keyboard.press('Escape')
  await expect(page.locator('.stage .node .selected-outline')).toHaveCount(0)
  await expect(page.locator('.stage .wire.selected')).toHaveCount(0)

  await page.keyboard.press('=')
  await expect(zoom).not.toHaveText(initialZoom)

  await page.keyboard.press('-')
  await expect(zoom).toHaveText(initialZoom)

  await page.keyboard.press('-')
  await expect(zoom).not.toHaveText(initialZoom)

  await page.keyboard.press('0')
  await expect(zoom).toHaveText(initialZoom)
})

test('context menu groups and ungroups with the keyboard', async ({ page }) => {
  const nodes = page.locator('.stage .node')
  await nodes.nth(0).click()
  await nodes.nth(1).click({ modifiers: ['Shift'] })
  await expect(page.locator('.stage .node .selected-outline')).toHaveCount(2)

  await nodes.nth(0).click({ button: 'right' })
  const menu = page.getByRole('menu', { name: '画布操作' })
  const groupItem = page.getByRole('menuitem', { name: '组合' })

  await expect(menu).toBeVisible()
  await expect(groupItem).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: '剪切' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('menuitem', { name: '删除' })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(groupItem).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(menu).toBeHidden()
  await expect(page.locator('.group-box')).toHaveCount(1)

  await page.mouse.click(1100, 760)
  await expect(page.locator('.stage .node .selected-outline')).toHaveCount(0)
  await expect(page.locator('.group-box')).toHaveCount(0)
  await nodes.nth(0).click()
  await expect(page.locator('.stage .node .selected-outline')).toHaveCount(2)
  await expect(page.locator('.group-box.selected')).toHaveCount(1)

  await nodes.nth(0).click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: '解组' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('.group-box')).toHaveCount(0)

  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.group-box')).toHaveCount(1)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(page.locator('.group-box')).toHaveCount(0)
})

test('group selection: click selects the group only while its frame is hidden', async ({ page }) => {
  const nodes = page.locator('.stage .node')
  const selected = page.locator('.stage .node .selected-outline')
  const initialCount = await nodes.count()

  await nodes.nth(0).click()
  await nodes.nth(1).click({ modifiers: ['Shift'] })
  await nodes.nth(0).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '组合' }).click()
  await expect(page.locator('.group-box.selected')).toHaveCount(1)

  const box = await page.locator('.group-box').boundingBox()
  if (!box) throw new Error('group box missing')

  await page.mouse.click(1100, 760)
  await expect(selected).toHaveCount(0)
  await expect(page.locator('.group-box')).toHaveCount(0)

  await nodes.nth(1).click()
  await expect(selected).toHaveCount(2)
  await expect(page.locator('.group-box.selected')).toHaveCount(1)

  await nodes.nth(1).click()
  await expect(selected).toHaveCount(1)
  await expect(nodes.nth(1).locator('.selected-outline')).toHaveCount(1)
  await expect(page.locator('.group-box')).toHaveCount(1)
  await expect(page.locator('.group-box.selected')).toHaveCount(0)

  await nodes.nth(0).click()
  await expect(selected).toHaveCount(1)
  await expect(nodes.nth(0).locator('.selected-outline')).toHaveCount(1)
  await expect(page.locator('.group-box')).toHaveCount(1)

  await page.mouse.click(1100, 760)
  await expect(page.locator('.group-box')).toHaveCount(0)
  await page.mouse.dblclick(box.x + 3, box.y + 3)
  await expect(page.locator('.text-editor')).toBeVisible()
  await expect(nodes).toHaveCount(initialCount + 1)
  await expect(page.locator('.group-box')).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(nodes).toHaveCount(initialCount)
})

test('group frame drag moves the group, isolated node drag moves alone', async ({ page }) => {
  const nodes = page.locator('.stage .node')
  const selected = page.locator('.stage .node .selected-outline')

  await nodes.nth(0).click()
  await nodes.nth(1).click({ modifiers: ['Shift'] })
  await nodes.nth(0).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '组合' }).click()

  const box = await page.locator('.group-box').boundingBox()
  const firstBefore = await nodes.nth(0).boundingBox()
  const secondBefore = await nodes.nth(1).boundingBox()
  if (!box || !firstBefore || !secondBefore) throw new Error('group elements missing')

  await page.mouse.move(box.x + 4, box.y + 4)
  await page.mouse.down()
  await page.mouse.move(box.x + 44, box.y + 34, { steps: 6 })
  await page.mouse.up()

  const firstAfter = await nodes.nth(0).boundingBox()
  const secondAfter = await nodes.nth(1).boundingBox()
  expect(firstAfter).not.toBeNull()
  expect(secondAfter).not.toBeNull()
  expect(Math.abs((firstAfter?.x ?? 0) - firstBefore.x - 40)).toBeLessThan(2)
  expect(Math.abs((firstAfter?.y ?? 0) - firstBefore.y - 30)).toBeLessThan(2)
  expect(Math.abs((secondAfter?.x ?? 0) - secondBefore.x - 40)).toBeLessThan(2)
  expect(Math.abs((secondAfter?.y ?? 0) - secondBefore.y - 30)).toBeLessThan(2)

  await page.mouse.click(1100, 760)
  await nodes.nth(1).dblclick()
  await expect(selected).toHaveCount(1)

  const isolatedBefore = await nodes.nth(1).boundingBox()
  const otherBefore = await nodes.nth(0).boundingBox()
  if (!isolatedBefore || !otherBefore) throw new Error('nodes missing')

  const startX = isolatedBefore.x + isolatedBefore.width / 2
  const startY = isolatedBefore.y + isolatedBefore.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 30, startY + 20, { steps: 6 })
  await page.mouse.up()

  const isolatedAfter = await nodes.nth(1).boundingBox()
  const otherAfter = await nodes.nth(0).boundingBox()
  expect(isolatedAfter).not.toBeNull()
  expect(otherAfter).not.toBeNull()
  expect(Math.abs((isolatedAfter?.x ?? 0) - isolatedBefore.x - 30)).toBeLessThan(2)
  expect(Math.abs((isolatedAfter?.y ?? 0) - isolatedBefore.y - 20)).toBeLessThan(2)
  expect(Math.abs((otherAfter?.x ?? 0) - otherBefore.x)).toBeLessThan(1)
  expect(Math.abs((otherAfter?.y ?? 0) - otherBefore.y)).toBeLessThan(1)
})

test('context menu cuts, copies, pastes, and deletes', async ({ page }) => {
  const nodes = page.locator('.stage .node')
  const menu = page.getByRole('menu', { name: '画布操作' })
  const pasteItem = page.getByRole('menuitem', { name: '粘贴' })
  const initialCount = await nodes.count()

  await nodes.first().click()
  await nodes.first().click({ button: 'right' })
  await expect(menu).toBeVisible()
  await expect(page.getByRole('menuitem')).toHaveCount(7)
  await expect(page.getByRole('menuitem', { name: '组合', exact: true })).toBeDisabled()
  await expect(page.getByRole('menuitem', { name: '解组', exact: true })).toBeDisabled()
  await expect(page.getByRole('menuitem', { name: '剪切' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '复制' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '删除' })).toBeVisible()
  await expect(pasteItem).toBeDisabled()

  await page.getByRole('menuitem', { name: '复制' }).click()
  await expect(menu).toBeHidden()

  await nodes.first().click({ button: 'right' })
  await expect(pasteItem).toBeEnabled()
  await pasteItem.click()
  await expect(nodes).toHaveCount(initialCount + 1)

  await page.mouse.click(1100, 760, { button: 'right' })
  await expect(menu).toBeVisible()
  await expect(pasteItem).toBeFocused()
  await pasteItem.click()
  await expect(nodes).toHaveCount(initialCount + 2)

  await nodes.last().click({ button: 'right' })
  await page.getByRole('menuitem', { name: '剪切' }).click()
  await expect(nodes).toHaveCount(initialCount + 1)

  await page.mouse.click(1100, 760, { button: 'right' })
  await pasteItem.click()
  await expect(nodes).toHaveCount(initialCount + 2)

  await nodes.last().click({ button: 'right' })
  await page.getByRole('menuitem', { name: '删除' }).click()
  await expect(nodes).toHaveCount(initialCount + 1)
})

test('wire context menu deletes the clicked wire and closes on outside click', async ({ page }) => {
  const wireCount = await page.locator('.stage .wire').count()
  const point = await page.locator('.stage .wire-hit').first().evaluate(element => {
    const path = element as SVGPathElement
    const local = path.getPointAtLength(path.getTotalLength() / 2)
    const matrix = path.getScreenCTM()
    if (!matrix) return { x: 0, y: 0 }
    const screen = new DOMPoint(local.x, local.y).matrixTransform(matrix)
    return { x: screen.x, y: screen.y }
  })
  const menu = page.getByRole('menu', { name: '画布操作' })
  const items = page.getByRole('menuitem')

  await page.mouse.click(point.x, point.y, { button: 'right' })
  await expect(menu).toBeVisible()
  await expect(items).toHaveCount(7)
  const deleteWire = page.getByRole('menuitem', { name: '删除连线' })
  await expect(deleteWire).toBeEnabled()
  await expect(deleteWire).toBeFocused()
  await expect(page.getByRole('menuitem', { name: '组合', exact: true })).toBeDisabled()
  await expect(page.getByRole('menuitem', { name: '剪切' })).toBeDisabled()
  await expect(page.getByRole('menuitem', { name: '复制' })).toBeDisabled()
  await expect(page.getByRole('menuitem', { name: '粘贴' })).toBeDisabled()
  await expect(page.getByRole('menuitem', { name: '创建副本' })).toBeDisabled()

  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(page.locator('.stage')).toBeFocused()

  await page.mouse.click(point.x, point.y, { button: 'right' })
  await expect(menu).toBeVisible()
  await page.mouse.click(1100, 760)
  await expect(menu).toBeHidden()

  await page.mouse.click(point.x, point.y, { button: 'right' })
  await page.keyboard.press('Enter')
  await expect(menu).toBeHidden()
  await expect(page.locator('.stage .wire')).toHaveCount(wireCount - 1)

  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.stage .wire')).toHaveCount(wireCount)
})

test('canvas context menu keeps every action visible and disables the unavailable ones', async ({ page }) => {
  const menu = page.getByRole('menu', { name: '画布操作' })
  const items = page.getByRole('menuitem')

  await page.mouse.click(1100, 760, { button: 'right' })
  await expect(menu).toBeVisible()
  await expect(items).toHaveCount(7)
  for (const item of await items.all()) {
    await expect(item).toBeDisabled()
  }

  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
})

test('context menu closes before a pinned toolbar panel', async ({ page }) => {
  const trigger = page.locator('.toolbar .tool[data-label="输入器件"]')
  const menu = page.getByRole('menu', { name: '画布操作' })

  await trigger.click()
  await page.getByRole('button', { name: '固定弹出框' }).click()
  await expect(page.locator('#toolbar-flyout')).toBeVisible()

  await page.locator('.stage .node').last().click({ button: 'right' })
  await expect(menu).toBeVisible()
  await expect(page.locator('#toolbar-flyout')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(page.locator('#toolbar-flyout')).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')

  await page.keyboard.press('Escape')
  await expect(page.locator('#toolbar-flyout')).toBeHidden()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

test('copy, paste, and duplicate shortcuts create copies', async ({ page }) => {
  const nodes = page.locator('.stage .node')
  const selected = page.locator('.stage .node .selected-outline')
  const initialCount = await nodes.count()

  await nodes.first().click()
  await expect(selected).toHaveCount(1)

  await page.keyboard.press('ControlOrMeta+c')
  await page.keyboard.press('ControlOrMeta+v')
  await expect(nodes).toHaveCount(initialCount + 1)
  await expect(selected).toHaveCount(1)

  await page.keyboard.press('ControlOrMeta+d')
  await expect(nodes).toHaveCount(initialCount + 2)
  await expect(selected).toHaveCount(1)

  await page.keyboard.press('ControlOrMeta+z')
  await expect(nodes).toHaveCount(initialCount + 1)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(nodes).toHaveCount(initialCount)
})

test('circuit changes survive a reload', async ({ page }) => {
  const nodes = page.locator('.stage .node')
  const initialCount = await nodes.count()

  await page.getByRole('button', { name: '输入器件', exact: true }).click()
  await page
    .getByRole('group', { name: '输入器件' })
    .getByRole('button', { name: '输入开关', exact: true })
    .click()
  await expect(nodes).toHaveCount(initialCount + 1)

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('linea.circuit.v1')
        if (!raw) return 0
        return (JSON.parse(raw) as { nodes: unknown[] }).nodes.length
      }),
    )
    .toBe(initialCount + 1)

  await page.reload()
  await expect(nodes).toHaveCount(initialCount + 1)
  await expect(page.locator('.stage .node .selected-outline')).toHaveCount(0)
})

test('run and stop toggle simulation state', async ({ page }) => {
  const run = page.getByRole('button', { name: '运行', exact: true })
  const stop = page.getByRole('button', { name: '停止', exact: true })

  await run.click()
  await expect(stop).toBeVisible()
  await expect(run).toHaveCount(0)
  await expect(page.locator('.topbar .live')).toHaveText('仿真中')

  await stop.click()
  await expect(run).toBeVisible()
  await expect(stop).toHaveCount(0)
  await expect(page.locator('.topbar .live')).toHaveCount(0)
})

test('dragging a device from the toolbar drops it at the pointer', async ({ page }) => {
  const nodes = page.locator('.stage .node')
  const initialCount = await nodes.count()

  await page.locator('.toolbar .tool[data-label="输入器件"]').click()
  const item = page
    .getByRole('group', { name: '输入器件' })
    .getByRole('button', { name: '输入开关', exact: true })
  const box = await item.boundingBox()
  if (!box) throw new Error('toolbar item missing')

  const dropX = 720
  const dropY = 660
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(dropX, dropY, { steps: 12 })
  await expect(page.locator('.pick-ghost')).toBeVisible()
  await page.mouse.up()

  await expect(nodes).toHaveCount(initialCount + 1)
  await expect(page.locator('#toolbar-flyout')).toBeHidden()
  const added = await nodes.last().boundingBox()
  if (!added) throw new Error('dropped node missing')
  expect(Math.abs(added.x + added.width / 2 - dropX)).toBeLessThan(8)
  expect(Math.abs(added.y + added.height / 2 - dropY)).toBeLessThan(2)
})

test('language switch localizes the UI and persists', async ({ page }) => {
  await page.locator('.lang-switch').click()

  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeVisible()
  await expect(page.locator('.toolbar .tool[data-label="Inputs"]')).toHaveCount(1)
  await expect(page).toHaveTitle('Linea · Digital Circuit Canvas')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await page.reload()
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeVisible()

  await page.locator('.lang-switch').click()
  await expect(page.getByRole('button', { name: '运行', exact: true })).toBeVisible()
  await expect(page).toHaveTitle('Linea · 数字电路画布')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
})

test('export downloads the circuit and import restores it', async ({ page }) => {
  const nodes = page.locator('.stage .node')
  const initialCount = await nodes.count()

  // Playwright 无法操作系统保存对话框，置空以走浏览器下载回退路径
  await page.evaluate(() => {
    ;(window as unknown as Record<string, unknown>).showSaveFilePicker = undefined
  })

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出电路', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('linea-circuit.json')

  const path = await download.path()
  if (!path) throw new Error('download missing')
  const exported = JSON.parse(readFileSync(path, 'utf8')) as {
    type: string
    nodes: unknown[]
  }
  expect(exported.type).toBe('linea-circuit')
  expect(exported.nodes.length).toBe(initialCount)

  await page.getByRole('button', { name: '清空', exact: true }).click()
  await expect(nodes).toHaveCount(0)

  await page.setInputFiles('.import-input', path)
  await expect(nodes).toHaveCount(initialCount)
})

test('import rejects invalid files and keeps the canvas', async ({ page }) => {
  const nodes = page.locator('.stage .node')
  const initialCount = await nodes.count()

  await page.setInputFiles('.import-input', {
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"type":"linea-circuit","nodes":'),
  })

  await expect(nodes).toHaveCount(initialCount)
})

test('focused nodes activate with Enter and Space', async ({ page }) => {
  const n1 = page.locator('.stage .node[data-id="a"]')
  const n2 = page.locator('.stage .node[data-id="b"]')

  await expect(n1.locator('.knob')).toHaveAttribute('cx', '30.5')
  await n1.focus()
  await page.keyboard.press('Enter')
  await expect(n1.locator('.knob')).toHaveAttribute('cx', '13.5')
  await expect(n1.locator('.selected-outline')).toHaveCount(1)

  await expect(n2.locator('.knob')).toHaveAttribute('cx', '13.5')
  await n2.focus()
  await page.keyboard.press('Space')
  await expect(n2.locator('.knob')).toHaveAttribute('cx', '30.5')
  await expect(n2.locator('.selected-outline')).toHaveCount(1)
  await expect(n1.locator('.selected-outline')).toHaveCount(0)
})

test('a fresh visit starts with an empty canvas', async ({ page }) => {
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await expect(page.locator('.stage .node')).toHaveCount(0)
  await expect(page.locator('.stage .wire')).toHaveCount(0)
  await expect(page.locator('.topbar .zoom span')).toHaveText('100%')
})
