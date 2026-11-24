import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { TEMPLATES } from '../../src/circuit/templates'
import type { CircuitData } from '../../src/circuit/persist'

const HALF_ADDER = JSON.stringify(TEMPLATES.find(template => template.id === 'half-adder')?.data ?? {
  nodes: [],
  wires: [],
} satisfies CircuitData)

async function createFold(page: Page, nodes: Locator, indexes: number[]) {
  await nodes.nth(indexes[0]).click()
  for (const index of indexes.slice(1)) await nodes.nth(index).click({ modifiers: ['Shift'] })
  await nodes.nth(indexes[0]).click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^折叠/ }).click()
}

async function collapseFoldFrame(page: Page) {
  await page.locator('.fold-toggle').click()
}

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
  const foldItem = page.getByRole('menuitem', { name: /^折叠/ })
  await expect(foldItem).toBeFocused()
  await expect(foldItem.locator('.ctx-shortcut')).toHaveText(/F$/)
  await expect(page.getByRole('menuitem', { name: '重命名', exact: true })).toBeDisabled()
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

test('frames a fold, collapses it into a block, and unfolds back to a multi-selection', async ({
  page,
}) => {
  const nodes = page.locator('.stage .node')
  const wires = page.locator('.stage .wire')
  const frame = page.locator('.fold-box')
  const block = page.locator('.collapsed-block')
  const menu = page.getByRole('menu', { name: '画布操作' })
  const initialNodes = await nodes.count()
  const initialWires = await wires.count()

  await createFold(page, nodes, [2, 4])
  await expect(menu).toBeHidden()

  await expect(frame).toHaveCount(1)
  await expect(block).toHaveCount(0)
  await expect(nodes).toHaveCount(initialNodes)
  await expect(wires).toHaveCount(initialWires)
  await expect(page.locator('.group-box')).toHaveCount(0)
  await expect(page.locator('.stage .node .selected-outline')).toHaveCount(2)
  expect(await page.locator('.fold-frame').evaluate(el => getComputedStyle(el).strokeDasharray)).not.toBe('none')

  await collapseFoldFrame(page)
  await expect(frame).toHaveCount(0)
  await expect(block).toHaveCount(1)
  await expect(nodes).toHaveCount(initialNodes - 2)
  await expect(wires).toHaveCount(initialWires - 1)
  await expect(page.locator('.group-box')).toHaveCount(0)

  const box = await block.boundingBox()
  if (!box) throw new Error('collapsed block missing')
  expect(box.width).toBeLessThan(220)
  expect(box.height).toBeLessThan(120)

  await page.locator('.card-toggle').click()
  await expect(block).toHaveCount(0)
  await expect(frame).toHaveCount(1)
  await expect(nodes).toHaveCount(initialNodes)
  await expect(wires).toHaveCount(initialWires)
  await expect(page.locator('.group-box')).toHaveCount(0)
  await expect(page.locator('.stage .node .selected-outline')).toHaveCount(2)

  await nodes.nth(2).click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: /^取消折叠/ })).toBeEnabled()
  await page.keyboard.press('Escape')

  await collapseFoldFrame(page)
  await expect(block).toHaveCount(1)
  await block.click({ button: 'right' })
  const expandItem = page.getByRole('menuitem', { name: /^取消折叠/ })
  await expect(expandItem).toBeEnabled()
  await expandItem.click()
  await expect(menu).toBeHidden()
  await expect(block).toHaveCount(0)
  await expect(frame).toHaveCount(0)
  await expect(nodes).toHaveCount(initialNodes)
  await expect(wires).toHaveCount(initialWires)
  await expect(page.locator('.group-box')).toHaveCount(0)
  await expect(page.locator('.stage .node .selected-outline')).toHaveCount(2)

  await nodes.nth(2).click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: /^折叠/ })).toBeEnabled()
  await page.keyboard.press('Escape')

  await page.keyboard.press('ControlOrMeta+z')
  await expect(block).toHaveCount(1)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(block).toHaveCount(0)

  await createFold(page, nodes, [2, 4])
  await collapseFoldFrame(page)
  await expect(block).toHaveCount(1)
  await page.waitForFunction(() =>
    (localStorage.getItem('linea.circuit.v1') ?? '').includes('"collapsed": true'),
  )
  await page.reload()

  await expect(block).toHaveCount(1)
  await expect(nodes).toHaveCount(initialNodes - 2)

  await block.focus()
  await page.keyboard.press('Enter')
  await expect(block).toHaveCount(0)
  await expect(frame).toHaveCount(1)
  await expect(nodes).toHaveCount(initialNodes)
  await expect(page.locator('.group-box')).toHaveCount(0)
  await expect(page.locator('.stage .node .selected-outline')).toHaveCount(2)
})

test('places folded inputs on the left edge and outputs on the right edge', async ({ page }) => {
  const nodes = page.locator('.stage .node')
  const block = page.locator('.collapsed-block')
  const menu = page.getByRole('menu', { name: '画布操作' })

  await createFold(page, nodes, [2, 3])
  await expect(menu).toBeHidden()
  await collapseFoldFrame(page)
  await expect(block).toHaveCount(1)

  const anchors = await page.evaluate(() => {
    const rect = document.querySelector('.collapsed-block rect') as SVGRectElement
    const b = rect.getBBox()
    const eps = 0.75
    const points: { edge: string; along: number }[] = []
    for (const path of document.querySelectorAll('path.wire')) {
      const nums = (path.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
      for (const p of [nums.slice(0, 2), nums.slice(-2)]) {
        const insideX = p[0] >= b.x - eps && p[0] <= b.x + b.width + eps
        const insideY = p[1] >= b.y - eps && p[1] <= b.y + b.height + eps
        if (Math.abs(p[1] - b.y) < eps && insideX) points.push({ edge: 'top', along: p[0] })
        else if (Math.abs(p[1] - (b.y + b.height)) < eps && insideX) {
          points.push({ edge: 'bottom', along: p[0] })
        } else if (Math.abs(p[0] - b.x) < eps && insideY) points.push({ edge: 'left', along: p[1] })
        else if (Math.abs(p[0] - (b.x + b.width)) < eps && insideY) {
          points.push({ edge: 'right', along: p[1] })
        }
      }
    }
    return points
  })

  expect(anchors).toHaveLength(6)
  expect(new Set(anchors.map(point => `${point.edge}:${point.along.toFixed(2)}`)).size).toBe(6)
  expect(anchors.filter(point => point.edge === 'left')).toHaveLength(4)
  expect(anchors.filter(point => point.edge === 'right')).toHaveLength(2)
  expect(anchors.filter(point => point.edge === 'top' || point.edge === 'bottom')).toHaveLength(0)
})

test('folding an explicitly grouped selection keeps the group', async ({ page }) => {
  const nodes = page.locator('.stage .node')
  const frame = page.locator('.fold-box')
  const block = page.locator('.collapsed-block')
  const menu = page.getByRole('menu', { name: '画布操作' })

  await nodes.nth(2).click()
  await nodes.nth(4).click({ modifiers: ['Shift'] })
  await nodes.nth(2).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '组合' }).click()
  await expect(menu).toBeHidden()

  const groupBox = await page.locator('.group-box').boundingBox()
  if (!groupBox) throw new Error('group box missing after grouping')

  await nodes.nth(2).click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^折叠/ }).click()
  await expect(menu).toBeHidden()
  await expect(frame).toHaveCount(1)
  await expect(page.locator('.group-box.selected')).toHaveCount(1)

  await collapseFoldFrame(page)
  await expect(block).toHaveCount(1)

  const box = await block.boundingBox()
  if (!box) throw new Error('collapsed block missing')
  expect(box.width).toBeLessThan(groupBox.width)
  expect(box.height).toBeLessThan(groupBox.height)

  await page.locator('.card-toggle').click()
  await expect(block).toHaveCount(0)
  await expect(frame).toHaveCount(1)
  await expect(page.locator('.group-box.selected')).toHaveCount(1)
  await expect(page.locator('.stage .node .selected-outline')).toHaveCount(2)

  await nodes.nth(2).click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^取消折叠/ }).click()
  await expect(frame).toHaveCount(0)
  await expect(page.locator('.group-box.selected')).toHaveCount(1)
  await expect(page.locator('.stage .node .selected-outline')).toHaveCount(2)
})

test('renames a collapsed block and keeps the name after reload', async ({ page }) => {
  const nodes = page.locator('.stage .node')
  const block = page.locator('.collapsed-block')
  const menu = page.getByRole('menu', { name: '画布操作' })
  const editor = page.locator('.card-rename')

  await createFold(page, nodes, [2, 4])
  await expect(menu).toBeHidden()
  await collapseFoldFrame(page)
  await expect(block).toHaveCount(1)

  const box = await block.boundingBox()
  if (!box) throw new Error('collapsed block missing')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
  const renameItem = page.getByRole('menuitem', { name: '重命名', exact: true })
  await expect(renameItem).toBeEnabled()
  await renameItem.click()
  await expect(menu).toBeHidden()
  await expect(editor).toBeVisible()
  await editor.fill('加法核心')
  await editor.press('Enter')

  await expect(editor).toHaveCount(0)
  await expect(block).toContainText('加法核心')
  await page.waitForFunction(() =>
    (localStorage.getItem('linea.circuit.v1') ?? '').includes('"label": "加法核心"'),
  )
  await page.reload()
  await expect(block).toContainText('加法核心')
  // 重命名提交会取消选中，折叠卡片仍应保持折叠底色而不是变成纯白
  const cardFill = await block
    .locator('rect')
    .first()
    .evaluate(element => getComputedStyle(element).fill)
  expect(cardFill).not.toBe('rgb(255, 255, 255)')

  await block.focus()
  await page.keyboard.press('Enter')
  await expect(block).toHaveCount(0)
  await expect(page.locator('.card-rename')).toHaveCount(0)
  await expect(page.locator('.fold-box')).toHaveCount(1)

  await collapseFoldFrame(page)
  await expect(block).toHaveCount(1)
  await expect(block).toContainText('加法核心')

  await block.click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^取消折叠/ }).click()
  await expect(block).toHaveCount(0)
  await expect(page.locator('.fold-box')).toHaveCount(0)
})

test('renames a fold in frame mode and keeps the name in both modes', async ({ page }) => {
  const nodes = page.locator('.stage .node')
  const frameLabel = page.locator('.fold-label')
  const block = page.locator('.collapsed-block')

  await createFold(page, nodes, [2, 4])
  await expect(page.getByRole('menu', { name: '画布操作' })).toBeHidden()
  await expect(page.locator('.fold-box')).toHaveCount(1)
  await expect(frameLabel).toHaveCount(0)

  await nodes.nth(2).click({ button: 'right' })
  const renameItem = page.getByRole('menuitem', { name: '重命名', exact: true })
  await expect(renameItem).toBeEnabled()
  await renameItem.click()

  const editor = page.locator('.card-rename')
  await expect(editor).toBeVisible()
  await expect(frameLabel).toHaveCount(0)
  await editor.fill('加法核心')
  await editor.press('Enter')

  await expect(frameLabel).toHaveText('加法核心')
  await collapseFoldFrame(page)
  await expect(block).toContainText('加法核心')
  await page.locator('.card-toggle').click()
  await expect(frameLabel).toHaveText('加法核心')

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('linea.circuit.v1')
    if (!raw) return false
    const data = JSON.parse(raw) as { folds?: { label?: string; collapsed?: boolean }[] }
    return Boolean(data.folds?.some(fold => fold.label === '加法核心' && !fold.collapsed))
  })
  await page.reload()
  await expect(page.locator('.fold-label')).toHaveText('加法核心')
})

test('fold shortcut creates a frame and dissolves a selected fold', async ({ page }) => {
  const nodes = page.locator('.stage .node')
  const nodeCount = await nodes.count()

  await nodes.nth(2).click()
  await nodes.nth(4).click({ modifiers: ['Shift'] })
  await page.keyboard.press('Shift+F')
  await expect(page.locator('.fold-box')).toHaveCount(1)
  await expect(page.getByRole('menu', { name: '画布操作' })).toBeHidden()

  await page.locator('.fold-toggle').click()
  await expect(page.locator('.collapsed-block')).toHaveCount(1)
  await page.keyboard.press('Shift+F')
  await expect(page.locator('.collapsed-block')).toHaveCount(0)
  await expect(page.locator('.fold-box')).toHaveCount(0)
  await expect(nodes).toHaveCount(nodeCount)
  await expect(page.locator('.stage .node .selected-outline')).toHaveCount(2)

  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.collapsed-block')).toHaveCount(1)

  await nodes.first().click()
  await page.keyboard.press('Shift+F')
  await expect(page.locator('.collapsed-block')).toHaveCount(1)
  await expect(page.locator('.fold-box')).toHaveCount(0)
})

test('shift-click and marquee select a collapsed block as a unit', async ({ page }) => {
  const nodes = page.locator('.stage .node')
  const block = page.locator('.collapsed-block')
  const menu = page.getByRole('menu', { name: '画布操作' })

  await createFold(page, nodes, [2, 4])
  await expect(menu).toBeHidden()
  await collapseFoldFrame(page)
  await expect(block).toHaveCount(1)

  const box = await block.boundingBox()
  if (!box) throw new Error('collapsed block missing')
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

  await nodes.nth(0).click()
  await expect(page.locator('.stage .node .selected-outline')).toHaveCount(1)
  await page.keyboard.down('Shift')
  await page.mouse.click(center.x, center.y)
  await page.keyboard.up('Shift')
  await expect(block).toHaveClass(/selected/)
  await expect(page.locator('.stage .node .selected-outline')).toHaveCount(1)

  await page.keyboard.down('Shift')
  await page.mouse.click(center.x, center.y)
  await page.keyboard.up('Shift')
  await expect(block).not.toHaveClass(/selected/)
  await expect(page.locator('.stage .node .selected-outline')).toHaveCount(1)

  await page.mouse.click(1100, 760)
  const start = { x: box.x - 8, y: box.y - 8 }
  const end = { x: box.x + box.width + 8, y: box.y + box.height + 8 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 6 })
  await page.mouse.up()

  await expect(block).toHaveClass(/selected/)
  await expect(page.locator('.stage .node .selected-outline')).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(block).not.toHaveClass(/selected/)
})

test('context menu cuts, copies, pastes, and deletes', async ({ page }) => {
  const nodes = page.locator('.stage .node')
  const menu = page.getByRole('menu', { name: '画布操作' })
  const pasteItem = page.getByRole('menuitem', { name: '粘贴' })
  const initialCount = await nodes.count()

  await nodes.first().click()
  await nodes.first().click({ button: 'right' })
  await expect(menu).toBeVisible()
  await expect(page.getByRole('menuitem')).toHaveCount(9)
  await expect(page.getByRole('menuitem', { name: '组合', exact: true })).toBeDisabled()
  await expect(page.getByRole('menuitem', { name: '解组', exact: true })).toBeDisabled()
  await expect(page.getByRole('menuitem', { name: '重命名', exact: true })).toBeDisabled()
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
  await expect(items).toHaveCount(9)
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
  await expect(items).toHaveCount(9)
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
