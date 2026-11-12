import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { init } from '@embedpdf/pdfium'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [async ({ page }, use) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    await use(errors)
    expect(errors, 'Keine unbehandelten Browserfehler').toEqual([])
  }, { auto: true }],
})

async function fixture(labels = ['Originaltext']) {
  const doc = await PDFDocument.create()
  for (const label of labels) doc.addPage([500, 600]).drawText(label, { x: 50, y: 500, size: 18 })
  return Buffer.from(await doc.save())
}
async function open(page: Page, labels?: string[]) {
  const buffer = await fixture(labels)
  await page.goto('/')
  await page.locator('input[type=file]').first().setInputFiles({ name: 'Test.PDF', mimeType: 'application/pdf', buffer })
  await expect(page.locator('.pdf-surface canvas')).toHaveAttribute('aria-label', new RegExp(labels?.[0] ?? 'Originaltext'))
  return buffer
}
async function download(page: Page) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Herunterladen', exact: true }).click()
  return readFile((await (await pending).path())!)
}
async function contents(data: Uint8Array) {
  const task = getDocument({ data: new Uint8Array(data), standardFontDataUrl: fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)).replaceAll('\\', '/') }), doc = await task.promise
  try {
    const result: string[] = []
    for (let i = 1; i <= doc.numPages; i++) result.push((await (await doc.getPage(i)).getTextContent()).items.map(t => 'str' in t ? t.str : '').join(' '))
    return result
  } finally { await task.destroy() }
}
async function drag(page: Page, start: { x: number; y: number }, end: { x: number; y: number }) {
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up()
}
async function imageFile(page: Page, mime = 'image/png') {
  const data = await page.evaluate(type => {
    const c = document.createElement('canvas'); c.width = 80; c.height = 40
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#0077ff'; ctx.fillRect(0, 0, 80, 40)
    return c.toDataURL(type).split(',')[1]!
  }, mime)
  return { name: `Bild.${mime.split('/')[1]}`, mimeType: mime, buffer: Buffer.from(data, 'base64') }
}
async function oversized(page: Page, index: number, name: string, mime: string, bytes: number) {
  await page.locator('input[type=file]').nth(index).evaluate((input: HTMLInputElement, data) => {
    const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(data.bytes)], data.name, { type: data.mime }))
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }))
  }, { name, mime, bytes })
}

test('Dateiauswahl öffnen und abbrechen, PDF laden und per Drag-and-drop wechseln', async ({ page }) => {
  await page.goto('/')
  let chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'PDF auswählen' }).click(); await (await chooser).setFiles([])
  await expect(page.getByRole('button', { name: 'Herunterladen' })).toBeDisabled()
  chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'PDF öffnen', exact: true }).click()
  await (await chooser).setFiles({ name: 'Auswahl.pdf', mimeType: 'application/pdf', buffer: await fixture() })
  await expect(page.locator('.document-name strong')).toHaveText('Auswahl.pdf')
  const bytes = [...await fixture(['Drop-Datei'])]
  await page.locator('.workspace').evaluate((element, data) => {
    const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(data)], 'Drop.pdf', { type: 'application/pdf' }))
    element.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, bytes)
  await expect(page.locator('.document-name strong')).toHaveText('Drop.pdf')
  await expect(page.locator('.pdf-surface canvas')).toHaveAttribute('aria-label', /Drop-Datei/)
})

test('Falsche Dateiendung und PDF über 50 MB werden abgewiesen; gültige Datei bleibt geöffnet', async ({ page }) => {
  await open(page)
  await page.locator('input[type=file]').first().setInputFiles({ name: 'Datei.txt', mimeType: 'text/plain', buffer: Buffer.from('Text') })
  await expect(page.getByRole('alert')).toContainText('PDF-Datei')
  await page.getByRole('button', { name: 'Fehler schließen' }).click()
  await oversized(page, 0, 'Gross.pdf', 'application/pdf', 50 * 1024 * 1024 + 1)
  await expect(page.getByRole('alert')).toContainText('50 MB')
  await expect(page.locator('.document-name strong')).toHaveText('Test.PDF')
  await expect(page.locator('.pdf-surface canvas')).toHaveAttribute('aria-label', /Originaltext/)
})

test('Passwortgeschützte PDFs werden verständlich abgewiesen', async ({ page }) => {
  const api = await init({ wasmBinary: await readFile(new URL('../node_modules/@embedpdf/pdfium/dist/pdfium.wasm', import.meta.url)) })
  api.PDFiumExt_Init()
  const data = await fixture(), ptr = api.pdfium.wasmExports.malloc(data.length)
  const heap = () => (api.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8
  heap().set(data, ptr)
  const doc = api.FPDF_LoadMemDocument(ptr, data.length, ''), writer = api.PDFiumExt_OpenFileWriter()
  let encrypted: Buffer
  try {
    expect(api.EPDF_SetEncryption(doc, 'reader', 'owner', -4)).toBeTruthy()
    expect(api.FPDF_SaveAsCopy(doc, writer, 2)).toBeTruthy()
    const size = api.PDFiumExt_GetFileWriterSize(writer), output = api.pdfium.wasmExports.malloc(size)
    try { api.PDFiumExt_GetFileWriterData(writer, output, size); encrypted = Buffer.from(heap().slice(output, output + size)) }
    finally { api.pdfium.wasmExports.free(output) }
  } finally { api.PDFiumExt_CloseFileWriter(writer); api.FPDF_CloseDocument(doc); api.pdfium.wasmExports.free(ptr) }
  await page.goto('/')
  await page.locator('input[type=file]').first().setInputFiles({ name: 'Geschützt.pdf', mimeType: 'application/pdf', buffer: encrypted! })
  await expect(page.getByRole('alert')).toContainText('passwortgeschützt')
  await expect(page.getByRole('button', { name: 'Herunterladen' })).toBeDisabled()
})

test('Bildtyp, Bildgröße und defekte Bilddaten werden geprüft', async ({ page }) => {
  await open(page)
  await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'Bild.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
  await expect(page.getByRole('alert')).toContainText('PNG-, JPG- oder WebP')
  await page.getByRole('button', { name: 'Fehler schließen' }).click()
  await oversized(page, 1, 'Gross.png', 'image/png', 10 * 1024 * 1024 + 1)
  await expect(page.getByRole('alert')).toContainText('10 MB')
  await page.getByRole('button', { name: 'Fehler schließen' }).click()
  await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'Defekt.png', mimeType: 'image/png', buffer: Buffer.from('invalid image') })
  await expect(page.getByRole('alert')).toContainText('Bild konnte nicht geöffnet')
})

for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
  test(`${mime}: einfügen, proportional skalieren, verschieben, löschen, wiederherstellen und exportieren`, async ({ page }) => {
    await open(page)
    await page.locator('input[type=file]').nth(1).setInputFiles(await imageFile(page, mime))
    await expect(page.getByRole('button', { name: 'Bild', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.locator('.pdf-surface').click({ position: { x: 75, y: 200 } })
    const image = page.locator('.annotation-layer image')
    await expect(image).toHaveCount(1)
    expect(Number(await image.getAttribute('width')) / Number(await image.getAttribute('height'))).toBeCloseTo(2)
    await page.getByRole('slider', { name: 'Bildbreite' }).fill('25')
    expect(Number(await image.getAttribute('width')) / Number(await image.getAttribute('height'))).toBeCloseTo(2)
    const beforeX = Number(await image.getAttribute('x')), box = (await image.boundingBox())!
    await drag(page, { x: box.x + 10, y: box.y + 10 }, { x: box.x + 50, y: box.y + 35 })
    expect(Number(await image.getAttribute('x'))).toBeGreaterThan(beforeX + 20)
    await page.getByRole('button', { name: 'Element entfernen' }).click(); await expect(image).toHaveCount(0)
    await page.getByRole('button', { name: 'Rückgängig', exact: true }).click(); await expect(image).toHaveCount(1)
    expect((await PDFDocument.load(await download(page))).getPageCount()).toBe(1)
  })
}

test('Neuen Text formatieren, verschieben, löschen sowie Undo/Redo', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Text hinzufügen', exact: true }).click()
  await page.locator('.pdf-surface').click({ position: { x: 75, y: 220 } })
  const field = page.getByRole('textbox', { name: 'Dein Text', exact: true })
  await field.fill('Text verschieben'); await field.press('Control+Enter')
  await page.getByRole('combobox', { name: 'Schriftgröße' }).selectOption('32')
  await page.getByRole('textbox', { name: 'Eigene Farbe' }).fill('#9933ff')
  const text = page.locator('.annotation-layer text')
  await expect(text).toHaveAttribute('fill', '#9933ff'); await expect(text).toHaveAttribute('font-size', '32')
  const x = Number(await text.getAttribute('x')), box = (await text.boundingBox())!
  await drag(page, { x: box.x + 10, y: box.y + 10 }, { x: box.x + 60, y: box.y + 35 })
  expect(Number(await text.getAttribute('x'))).toBeGreaterThan(x + 30)
  await page.getByRole('button', { name: 'Element entfernen' }).click(); await expect(text).toHaveCount(0)
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click(); await expect(text).toHaveCount(1)
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click(); await expect(text).toHaveCount(0)
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click()
  expect((await contents(await download(page)))[0]).toContain('Text verschieben')
})

test('Vorhandenen Text per Tastatur auswählen und Größe/Farbe live ändern', async ({ page }) => {
  await open(page)
  const target = page.getByRole('button', { name: 'Text bearbeiten: Originaltext', exact: true })
  await target.focus(); await target.press('Enter')
  const field = page.getByRole('textbox', { name: 'Vorhandener Text', exact: true })
  await field.fill('Größe und Farbe')
  await page.getByRole('combobox', { name: 'Schriftgröße' }).selectOption('32')
  await page.getByRole('button', { name: 'Farbe #00bcff', exact: true }).click()
  await expect(page.locator('.pdf-surface canvas')).toHaveAttribute('aria-label', 'PDF-Vorschau: Größe und Farbe')
  await expect.poll(() => page.locator('.pdf-surface canvas').evaluate((c: HTMLCanvasElement) => {
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let blue = 0; for (let i = 0; i < data.length; i += 4) if (data[i]! < 50 && data[i + 1]! > 120 && data[i + 1]! < 220 && data[i + 2]! > 220) blue++
    return blue
  })).toBeGreaterThan(30)
  await field.press('Control+Enter')
  expect((await contents(await download(page)))[0]).toContain('Größe und Farbe')
})

test('Rechteck rückwärts aufziehen und Freihand-Strichstärke ändern', async ({ page }) => {
  await open(page)
  const surface = (await page.locator('.pdf-surface').boundingBox())!
  await page.getByRole('button', { name: 'Formen', exact: true }).click()
  await drag(page, { x: surface.x + 200, y: surface.y + 250 }, { x: surface.x + 70, y: surface.y + 200 })
  const rect = page.locator('.annotation-layer rect[fill="transparent"]')
  expect(Number(await rect.getAttribute('width'))).toBeGreaterThan(100)
  expect(Number(await rect.getAttribute('height'))).toBeGreaterThan(40)
  await page.getByRole('button', { name: 'Zeichnen', exact: true }).click()
  await page.getByRole('combobox', { name: 'Strichstärke' }).selectOption('48')
  await drag(page, { x: surface.x + 70, y: surface.y + 300 }, { x: surface.x + 210, y: surface.y + 330 })
  await expect(page.locator('.annotation-layer polyline')).toHaveAttribute('stroke-width', '8')
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click(); await expect(page.locator('.annotation-layer polyline')).toHaveCount(0)
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click(); await expect(page.locator('.annotation-layer polyline')).toHaveCount(1)
  expect((await PDFDocument.load(await download(page))).getPageCount()).toBe(1)
})

test('Seitenreihenfolge, Löschen und Wiederholen stimmen im Download', async ({ page }) => {
  await open(page, ['Seite A', 'Seite B', 'Seite C'])
  await page.getByRole('button', { name: 'Seite 3', exact: true }).click()
  await page.getByRole('button', { name: 'Seite nach vorne', exact: true }).click()
  await page.getByRole('button', { name: 'Seite nach vorne', exact: true }).click()
  await page.getByRole('button', { name: 'Seite 3', exact: true }).click()
  await page.getByRole('button', { name: 'Seite löschen', exact: true }).click()
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click()
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click()
  expect(await contents(await download(page))).toEqual(['Seite C', 'Seite A'])
})

test('Redo einer Seitenlöschung nach Wechsel auf die wiederhergestellte letzte Seite', async ({ page }) => {
  await open(page, ['Seite A', 'Seite B', 'Seite C'])
  await page.getByRole('button', { name: 'Seite 3', exact: true }).click()
  await page.getByRole('button', { name: 'Seite löschen', exact: true }).click()
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click()
  await page.getByRole('button', { name: 'Seite 3', exact: true }).click()
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click()
  await expect(page.locator('.thumbnail')).toHaveCount(2)
  await expect(page.locator('.pdf-surface canvas')).toHaveAttribute('aria-label', /Seite [AB]/)
})

test('Zoom von 25 bis 200 Prozent, Einpassen und Seitennavigation', async ({ page }) => {
  await open(page, ['Seite A', 'Seite B'])
  const plus = page.getByRole('button', { name: 'Vergrößern', exact: true }), minus = page.getByRole('button', { name: 'Verkleinern', exact: true })
  for (let i = 0; i < 12; i++) await plus.click()
  await expect(plus).toBeDisabled(); await expect(page.locator('.zoom-controls')).toContainText('200 %')
  // At maximum zoom the left edge must remain reachable via horizontal scrolling.
  const bounds = await page.locator('.page-scroll').evaluate(el => { el.scrollLeft = 0; return { left: el.getBoundingClientRect().left, page: el.querySelector('.pdf-surface')!.getBoundingClientRect().left } })
  expect(bounds.page).toBeGreaterThanOrEqual(bounds.left)
  for (let i = 0; i < 18; i++) await minus.click()
  await expect(minus).toBeDisabled(); await expect(page.locator('.zoom-controls')).toContainText('25 %')
  await page.getByRole('button', { name: 'Seite einpassen', exact: true }).click()
  expect(await page.locator('.pdf-surface').evaluate(el => el.clientWidth <= el.parentElement!.clientWidth)).toBeTruthy()
  await expect(page.getByRole('button', { name: 'Vorherige Seite' })).toBeDisabled()
  await page.getByRole('button', { name: 'Nächste Seite', exact: true }).click()
  await expect(page.locator('.pdf-surface canvas')).toHaveAttribute('aria-label', /Seite B/)
  await expect(page.getByRole('button', { name: 'Nächste Seite' })).toBeDisabled()
  await page.getByRole('button', { name: 'Vorherige Seite' }).click()
  await expect(page.locator('.pdf-surface canvas')).toHaveAttribute('aria-label', /Seite A/)
})

test('Dokumentwechsel warnt bei einem Live-Entwurf; Abbrechen erhält den Inhalt', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Text bearbeiten: Originaltext' }).click()
  await page.getByRole('textbox', { name: 'Vorhandener Text', exact: true }).fill('Nicht verwerfen')
  const next = { name: 'Neu.pdf', mimeType: 'application/pdf', buffer: await fixture(['Neues Dokument']) }
  await page.locator('input[type=file]').first().setInputFiles(next)
  await expect(page.getByRole('dialog')).toContainText('verworfen')
  await page.getByRole('dialog').getByRole('button', { name: 'Abbrechen' }).click()
  await expect(page.getByRole('textbox', { name: 'Vorhandener Text', exact: true })).toHaveValue('Nicht verwerfen')
  await page.locator('input[type=file]').first().setInputFiles(next)
  await page.getByRole('dialog').getByRole('button', { name: 'PDF wechseln', exact: true }).click()
  await expect(page.locator('.document-name strong')).toHaveText('Neu.pdf')
  await expect(page.locator('.pdf-surface canvas')).toHaveAttribute('aria-label', /Neues Dokument/)
  await expect(page.getByRole('button', { name: 'Rückgängig', exact: true })).toBeDisabled()
})

test('Bildscan zeigt OCR-Hinweis und erlaubt neue Texte', async ({ page }) => {
  await page.goto('/')
  const image = await imageFile(page), doc = await PDFDocument.create(), p = doc.addPage([500, 600])
  p.drawImage(await doc.embedPng(image.buffer), { x: 20, y: 200, width: 400, height: 200 })
  await page.locator('input[type=file]').first().setInputFiles({ name: 'Scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) })
  await expect(page.locator('.tool-instruction')).toContainText('OCR')
  await page.getByRole('button', { name: 'Text hinzufügen', exact: true }).click()
  await page.locator('.pdf-surface').click({ position: { x: 50, y: 60 } })
  await page.getByRole('textbox', { name: 'Dein Text', exact: true }).fill('Ergänzung zum Scan')
  expect((await contents(await download(page)))[0]).toContain('Ergänzung zum Scan')
})

test('Fehler beim Laden der Ersatzschrift wird gemeldet und ist behebbar', async ({ page }) => {
  await page.route('**/fonts/NotoSans-Bold.ttf', route => route.abort())
  await open(page)
  await page.getByRole('button', { name: 'Text bearbeiten: Originaltext' }).click()
  const field = page.getByRole('textbox', { name: 'Vorhandener Text', exact: true })
  await field.fill('Grüße')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('status', { name: 'Live-Vorschau aktuell' })).toHaveCount(0)
  await page.unroute('**/fonts/NotoSans-Bold.ttf')
  await field.fill('Grüße aus München')
  await expect(page.locator('.pdf-surface canvas')).toHaveAttribute('aria-label', 'PDF-Vorschau: Grüße aus München')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

declare global { interface Window { motionSamples: string[] } }
async function observeMotion(page: Page) {
  await page.evaluate(() => {
    window.motionSamples = []
    new MutationObserver(records => records.forEach(record => {
      const target = record.target as HTMLElement
      if (target.classList?.contains('modal')) window.motionSamples.push(target.style.opacity)
    })).observe(document.body, { attributes: true, attributeFilter: ['style'], subtree: true })
  })
}

test('Anime.js animiert Dialoge; Hilfe lässt sich über alle drei Wege schließen', async ({ page }) => {
  await page.goto('/'); await observeMotion(page)
  await page.getByRole('button', { name: 'Hilfe', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.motionSamples.some(s => s !== '' && Number(s) > 0 && Number(s) < 1))).toBeTruthy()
  await expect(page.locator('.modal')).toHaveCSS('opacity', '1')
  await page.getByRole('dialog').getByRole('button', { name: 'Schließen', exact: true }).last().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Hilfe', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Schließen', exact: true }).first().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Hilfe', exact: true }).click()
  await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } })
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('Reduzierte Bewegung deaktiviert Anime.js, auch beim Wechsel während einer Animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/'); await observeMotion(page)
  await page.getByRole('button', { name: 'Hilfe', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.evaluate(() => window.motionSamples.filter(s => s !== '' && Number(s) < 1))).toEqual([])
  await expect(page.locator('.modal')).toHaveCSS('transform', 'none')
  await page.getByRole('dialog').getByRole('button', { name: 'Schließen', exact: true }).last().click()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: 'Hilfe', exact: true }).click()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.modal')).toHaveCSS('transform', 'none')
  await expect(page.locator('.modal')).toHaveCSS('opacity', '1')
})

for (const width of [360, 768, 1440]) {
  test(`Größere Schrift bei ${width}px: lesbare Bedienelemente und kein horizontaler Überlauf`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await open(page)
    expect(await page.getByRole('button', { name: 'Herunterladen' }).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12)
    expect(await page.getByRole('button', { name: 'Hilfe', exact: true }).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12)
    await page.getByRole('button', { name: 'Text bearbeiten: Originaltext', exact: true }).click()
    const field = page.getByRole('textbox', { name: 'Vorhandener Text', exact: true })
    await field.fill('Größere Schrift')
    expect(await field.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(15)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await page.screenshot({ path: `test-results/lesbarkeit-${width}.png`, fullPage: true })
  })
}
