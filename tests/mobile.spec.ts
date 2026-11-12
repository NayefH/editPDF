import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
import { createCanvas } from '@napi-rs/canvas'

const test = base.extend<{ runtimeErrors: string[] }>({ runtimeErrors: [async ({ page }, use) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await use(errors); expect(errors).toEqual([])
}, { auto: true }] })
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((await page.viewportSize())!.width)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual((await page.viewportSize())!.height)
}
async function openDemo(page: Page) { await page.goto('/'); await page.getByRole('button', { name: 'Testdokument laden' }).tap(); await expect(page.locator('.pdf-surface canvas')).toBeVisible() }
function editorPane(page: Page, name: string) { return page.getByRole('navigation', { name: 'Editoransicht' }).getByRole('button', { name, exact: true }) }
function converterPane(page: Page, name: string) { return page.getByRole('navigation', { name: 'Konverteransicht' }).getByRole('button', { name, exact: true }) }
function mergePane(page: Page, name: string) { return page.getByRole('navigation', { name: 'Kombinationsansicht' }).getByRole('button', { name, exact: true }) }
async function pdfFile(name: string) { const doc = await PDFDocument.create(); doc.addPage([200, 300]).drawText(name); return { name: name + '.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) } }
async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const session = await page.context().newCDPSession(page)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
  for (let i = 1; i <= 12; i++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / 12, y: from.y + (to.y - from.y) * i / 12 }] })
    await new Promise(resolve => setTimeout(resolve, 16))
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach()
}

for (const [width, height] of [[320, 568], [360, 640], [390, 844], [430, 932], [844, 390]]) {
  test(`Touch-Navigation bei ${width}×${height}: ohne äußeren Scrollbereich`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! }); await page.goto('/'); await fits(page)
    await expect(page.getByRole('button', { name: 'PDF auswählen', exact: true })).toBeInViewport()
    for (const name of ['Konvertieren', 'Kombinieren', 'Bearbeiten']) {
      const tab = page.getByRole('tab', { name, exact: true }); expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await tab.tap(); await expect(tab).toHaveAttribute('aria-selected', 'true'); await fits(page)
    }
    await page.getByRole('button', { name: 'Testdokument laden' }).tap(); await expect(page.locator('.pdf-surface canvas')).toBeVisible()
    for (const name of ['Eigenschaften', 'Seiten', 'Dokument']) { await editorPane(page, name).tap(); await expect(editorPane(page, name)).toHaveAttribute('aria-pressed', 'true'); await fits(page) }
    await expect(page.locator('.page-scroll')).toBeInViewport(); await expect(page.getByRole('button', { name: 'Herunterladen', exact: true })).toBeInViewport()
    await page.screenshot({ path: `test-results/smartphone-${width}x${height}.png` })
  })
}

test('Vorhandenen Text per Touch bearbeiten, Vorschau öffnen und herunterladen', async ({ page }) => {
  await openDemo(page)
  await page.getByRole('button', { name: /^Text bearbeiten:/ }).first().tap()
  await expect(editorPane(page, 'Eigenschaften')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('textbox', { name: 'Vorhandener Text', exact: true }).fill('Grüße vom Smartphone')
  await page.getByRole('button', { name: 'Übernehmen', exact: true }).tap()
  await expect(editorPane(page, 'Dokument')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.pdf-surface canvas')).toHaveAttribute('aria-label', /Grüße vom Smartphone/)
  const event = page.waitForEvent('download'); await page.getByRole('button', { name: 'Herunterladen', exact: true }).tap()
  expect((await readFile((await (await event).path())!)).subarray(0, 4).toString()).toBe('%PDF'); await fits(page)
})

test('Seitenverwaltung ist mobil erreichbar und Rückgängig erhält das Dokument', async ({ page }) => {
  await openDemo(page); await editorPane(page, 'Seiten').tap()
  await page.getByRole('button', { name: 'Seite 2', exact: true }).tap()
  await expect(editorPane(page, 'Dokument')).toHaveAttribute('aria-pressed', 'true')
  await editorPane(page, 'Seiten').tap(); await page.getByRole('button', { name: 'Seite nach vorne', exact: true }).tap()
  await page.getByRole('button', { name: 'Seite löschen', exact: true }).tap()
  await expect(page.locator('.document-name')).toContainText('1 Seite')
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).tap(); await expect(page.locator('.document-name')).toContainText('2 Seiten')
  await fits(page)
})

test('Werkzeuge lassen sich wischen; Dokument lässt sich mit dem Finger scrollen', async ({ page }) => {
  await openDemo(page)
  const tools = (await page.locator('.tool-group').boundingBox())!
  await swipe(page, { x: tools.x + tools.width - 15, y: tools.y + 25 }, { x: tools.x + 15, y: tools.y + 25 })
  await expect.poll(() => page.locator('.tool-group').evaluate(e => e.scrollLeft)).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: 'Bild', exact: true })).toBeInViewport()
  await page.getByRole('button', { name: 'Auswählen', exact: true }).tap()
  const area = (await page.locator('.page-scroll').boundingBox())!
  await swipe(page, { x: area.x + area.width - 35, y: area.y + area.height - 20 }, { x: area.x + area.width - 35, y: area.y + 65 })
  await expect.poll(() => page.locator('.page-scroll').evaluate(e => e.scrollTop)).toBeGreaterThan(0)
  await fits(page)
})

test('Foto-PDF: Dateiliste, Einstellungen und Download per Touch', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Konvertieren', exact: true }).tap()
  await page.getByRole('tab', { name: 'Fotos → PDF', exact: true }).tap()
  const canvas = createCanvas(80, 40); canvas.getContext('2d').fillRect(0, 0, 80, 40)
  await page.getByLabel('Fotos für PDF', { exact: true }).setInputFiles({ name: 'Handyfoto.png', mimeType: 'image/png', buffer: canvas.toBuffer('image/png') })
  await expect(page.locator('.photo-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Foto 1 drehen', exact: true }).tap()
  await converterPane(page, 'Einstellungen').tap(); await page.getByRole('combobox', { name: 'Rand', exact: true }).selectOption('0')
  await page.getByRole('button', { name: 'PDF erstellen', exact: true }).tap(); await expect(page.getByRole('button', { name: 'PDF herunterladen', exact: true })).toBeEnabled()
  const event = page.waitForEvent('download'); await page.getByRole('button', { name: 'PDF herunterladen', exact: true }).tap()
  expect((await PDFDocument.load(await readFile((await (await event).path())!))).getPageCount()).toBe(1)
  await converterPane(page, 'Dateien & Vorschau').tap(); await expect(page.getByRole('figure', { name: 'Ergebnisvorschau' }).locator('canvas')).toBeVisible(); await fits(page)
})

test('PDF-Konvertierung und Kombination über mobile Einstellungen', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Konvertieren', exact: true }).tap()
  await page.getByLabel('PDF für Konvertierung', { exact: true }).setInputFiles(await pdfFile('München'))
  await converterPane(page, 'Einstellungen').tap(); await page.getByRole('combobox', { name: 'Zielformat' }).selectOption('txt')
  const textDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Konvertieren & herunterladen', exact: true }).tap()
  expect(await readFile((await (await textDownload).path())!, 'utf8')).toContain('München')
  await page.getByRole('tab', { name: 'Kombinieren', exact: true }).tap()
  await page.getByLabel('PDFs zum Kombinieren', { exact: true }).setInputFiles([await pdfFile('A'), await pdfFile('B')])
  await page.getByRole('button', { name: 'PDF 2 nach vorne', exact: true }).tap()
  await mergePane(page, 'Einstellungen').tap(); await page.getByRole('textbox', { name: 'Dateiname der kombinierten PDF' }).fill('Mobil')
  await page.getByRole('button', { name: 'PDFs kombinieren', exact: true }).tap(); await expect(page.getByRole('button', { name: 'Kombinierte PDF herunterladen', exact: true })).toBeEnabled()
  const event = page.waitForEvent('download'); await page.getByRole('button', { name: 'Kombinierte PDF herunterladen', exact: true }).tap()
  expect((await PDFDocument.load(await readFile((await (await event).path())!))).getPageCount()).toBe(2)
  await mergePane(page, 'Dateien & Vorschau').tap(); await expect(page.getByRole('figure', { name: 'Kombinierte PDF-Vorschau' }).locator('canvas')).toBeVisible(); await fits(page)
})

test('Drehen des Smartphones passt die Seitenbreite an; Zoom bleibt erreichbar', async ({ page }) => {
  await openDemo(page); await page.setViewportSize({ width: 844, height: 390 })
  await expect.poll(async () => (await page.locator('.pdf-surface').boundingBox())!.width).toBeLessThan(844)
  await page.setViewportSize({ width: 320, height: 568 })
  await expect.poll(async () => (await page.locator('.pdf-surface').boundingBox())!.width).toBeLessThan(300)
  await page.getByRole('button', { name: 'Vergrößern', exact: true }).tap()
  await page.getByRole('button', { name: 'Seite einpassen', exact: true }).tap()
  await expect.poll(async () => (await page.locator('.pdf-surface').boundingBox())!.width).toBeLessThan(300); await fits(page)
})

test('Neue Texte lassen sich per Finger verschieben und Freihand zeichnen', async ({ page }) => {
  await openDemo(page); await page.getByRole('button', { name: 'Text hinzufügen', exact: true }).tap()
  await page.locator('.pdf-surface').tap({ position: { x: 65, y: 80 } })
  await page.getByRole('textbox', { name: 'Dein Text', exact: true }).fill('Touchtext')
  await editorPane(page, 'Dokument').tap()
  await page.locator('.pdf-surface').tap({ position: { x: 20, y: 100 } })
  const text = page.locator('.annotation-layer text'), original = Number(await text.getAttribute('x')), box = (await text.boundingBox())!
  await swipe(page, { x: box.x + 5, y: box.y + box.height / 2 }, { x: box.x + 55, y: box.y + box.height / 2 + 20 })
  await expect.poll(async () => Number(await text.getAttribute('x'))).toBeGreaterThan(original + 30)
  await expect(editorPane(page, 'Eigenschaften')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Zeichnen', exact: true }).tap()
  const surface = (await page.locator('.pdf-surface').boundingBox())!
  await swipe(page, { x: surface.x + 35, y: surface.y + 40 }, { x: surface.x + 115, y: surface.y + 70 })
  await expect(page.locator('.annotation-layer polyline')).toHaveCount(1)
  expect((await page.locator('.annotation-layer polyline').getAttribute('points'))!.split(' ').length).toBeGreaterThan(5)
  await fits(page)
})

test('Texteingabe bleibt bei verkleinertem Sichtbereich erreichbar', async ({ page }) => {
  await openDemo(page); await page.getByRole('button', { name: /^Text bearbeiten:/ }).first().tap()
  const field = page.getByRole('textbox', { name: 'Vorhandener Text', exact: true })
  await field.fill('Mit Bildschirmtastatur'); await page.setViewportSize({ width: 390, height: 360 })
  await expect(field).toBeInViewport(); await fits(page)
  await page.getByRole('button', { name: 'Übernehmen', exact: true }).tap()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.pdf-surface canvas')).toHaveAttribute('aria-label', /Mit Bildschirmtastatur/)
  await expect(page.getByRole('button', { name: 'Herunterladen', exact: true })).toBeInViewport(); await fits(page)
})
