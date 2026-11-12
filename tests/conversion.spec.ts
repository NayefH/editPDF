import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { PDFDocument, rgb } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
import { unzipSync } from 'fflate'
import { createCanvas } from '@napi-rs/canvas'

const test = base.extend<{ runtimeErrors: string[] }>({ runtimeErrors: [async ({ page }, use) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await use(errors); expect(errors).toEqual([])
}, { auto: true }] })

async function openConverter(page: Page, photos = false) {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Konvertieren', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Konvertieren', exact: true })).toBeVisible()
  if (photos) await page.getByRole('tab', { name: 'Fotos → PDF', exact: true }).click()
}
async function pdfFile(count = 3, withText = true) {
  const doc = await PDFDocument.create()
  const colors = [rgb(1, 0, 0), rgb(0, 1, 0), rgb(0, 0, 1)]
  for (let i = 0; i < count; i++) {
    const p = doc.addPage([200, 300]); p.drawRectangle({ x: 0, y: 0, width: 200, height: 300, color: colors[i % 3]! })
    if (withText) p.drawText(`Seite ${i + 1}: Grüße aus München`, { x: 15, y: 260, size: 10 })
  }
  return { name: 'Prüfung.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) }
}
async function putPdf(page: Page, count = 3, withText = true) {
  await page.getByLabel('PDF für Konvertierung', { exact: true }).setInputFiles(await pdfFile(count, withText))
  await expect(page.locator('.conversion-filebar')).toContainText('Prüfung.pdf')
}
async function downloaded(page: Page, name = 'Konvertieren & herunterladen') {
  const promise = page.waitForEvent('download'); await page.getByRole('button', { name, exact: true }).click()
  const file = await promise; return { name: file.suggestedFilename(), data: await readFile((await file.path())!) }
}
async function photo(name: string, type: 'png' | 'jpeg' | 'webp' | 'avif', color: string, w = 80, h = 40) {
  const canvas = createCanvas(w, h), ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, w, h)
  const buffer = type === 'png' ? canvas.toBuffer('image/png') : type === 'jpeg' ? canvas.toBuffer('image/jpeg') : type === 'webp' ? await canvas.encode('webp') : await canvas.encode('avif')
  return { name, mimeType: `image/${type}`, buffer }
}
async function resultColor(page: Page, channel: number) {
  await expect.poll(() => page.getByRole('figure', { name: 'Ergebnisvorschau' }).locator('canvas').evaluate((c: HTMLCanvasElement, ch) => {
    const data = c.getContext('2d')!.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data
    return data[ch]!
  }, channel)).toBeGreaterThan(220)
}

test('PDF → PNG: Seitenwahl, Auflösung und Bilddaten', async ({ page }) => {
  await openConverter(page); await putPdf(page)
  await page.getByRole('combobox', { name: 'Auflösung' }).selectOption('72')
  await page.getByRole('textbox', { name: 'Seiten für Export' }).fill('2')
  const file = await downloaded(page)
  expect(file.name).toBe('Prüfung-Seite-002.png')
  expect(file.data.subarray(1, 4).toString()).toBe('PNG')
  expect(file.data.readUInt32BE(16)).toBe(200); expect(file.data.readUInt32BE(20)).toBe(300)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('PDF → JPG: mehrere Seiten werden als gültiges ZIP ausgegeben', async ({ page }) => {
  await openConverter(page); await putPdf(page)
  await page.getByRole('combobox', { name: 'Zielformat' }).selectOption('jpg')
  await page.getByRole('textbox', { name: 'Seiten für Export' }).fill('1-2, 2')
  const file = await downloaded(page), entries = unzipSync(file.data)
  expect(file.name).toBe('Prüfung-JPG.zip')
  expect(Object.keys(entries)).toEqual(['Prüfung-Seite-001.jpg', 'Prüfung-Seite-002.jpg'])
  for (const data of Object.values(entries)) expect([...data.subarray(0, 2)]).toEqual([255, 216])
})

test('PDF → TXT erhält deutsche Zeichen und exportiert nur gewählte Seiten', async ({ page }) => {
  await openConverter(page); await putPdf(page)
  await page.getByRole('combobox', { name: 'Zielformat' }).selectOption('txt')
  await page.getByRole('textbox', { name: 'Seiten für Export' }).fill('2')
  const file = await downloaded(page)
  expect(file.name).toBe('Prüfung.txt')
  expect(file.data.toString('utf8')).toContain('Seite 2: Grüße aus München')
  expect(file.data.toString('utf8')).not.toContain('Seite 1:')
})

test('Ungültige Bereiche und zu viele Seiten werden abgewiesen', async ({ page }) => {
  await openConverter(page); await putPdf(page)
  for (const range of ['0', '3-1', '4', '1,', 'abc']) {
    await page.getByRole('textbox', { name: 'Seiten für Export' }).fill(range)
    await page.getByRole('button', { name: 'Konvertieren & herunterladen' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
  }
  await putPdf(page, 101)
  await page.getByRole('button', { name: 'Konvertieren & herunterladen' }).click()
  await expect(page.getByRole('alert')).toContainText('100 Seiten')
})

test('TXT ohne Textebene zeigt OCR-Hinweis; Bildexport bleibt möglich', async ({ page }) => {
  await openConverter(page); await putPdf(page, 1, false)
  await page.getByRole('combobox', { name: 'Zielformat' }).selectOption('txt')
  await page.getByRole('button', { name: 'Konvertieren & herunterladen' }).click()
  await expect(page.getByRole('alert')).toContainText('OCR')
  await page.getByRole('combobox', { name: 'Zielformat' }).selectOption('png')
  expect((await downloaded(page)).name).toMatch(/\.png$/)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('Fotos: Formate, Reihenfolge, Drehung, Vorschau und mehrseitiger PDF-Download', async ({ page }) => {
  await openConverter(page, true)
  await page.getByLabel('Fotos für PDF', { exact: true }).setInputFiles([
    await photo('Rot.jpg', 'jpeg', '#ff0000'), await photo('Blau.png', 'png', '#0000ff', 40, 80), await photo('Grün.webp', 'webp', '#00ff00'),
  ])
  await expect(page.locator('.photo-card')).toHaveCount(3)
  await page.getByRole('button', { name: 'Foto 2 drehen', exact: true }).click()
  await page.getByRole('button', { name: 'Foto 3 nach vorne', exact: true }).click()
  await page.getByRole('button', { name: 'Foto 2 nach vorne', exact: true }).click()
  await expect(page.locator('.photo-name strong')).toHaveText(['Grün.webp', 'Rot.jpg', 'Blau.png'])
  await page.getByRole('textbox', { name: 'PDF-Dateiname' }).fill('Familie.2026.pdf')
  await page.getByRole('button', { name: 'PDF erstellen', exact: true }).click()
  await expect(page.getByRole('figure', { name: 'Ergebnisvorschau' })).toBeVisible()
  await resultColor(page, 1)
  await page.getByRole('button', { name: 'Vorschau: nächste Seite', exact: true }).click(); await resultColor(page, 0)
  await page.getByRole('button', { name: 'Vorschau: nächste Seite', exact: true }).click(); await resultColor(page, 2)
  const file = await downloaded(page, 'PDF herunterladen'), pdf = await PDFDocument.load(file.data)
  expect(file.name).toBe('Familie.2026.pdf'); expect(pdf.getPageCount()).toBe(3)
  for (const p of pdf.getPages()) expect(p.getWidth()).toBeGreaterThan(p.getHeight())
})

test('Bildformat, Ränder und ungültig gewordene Ergebnisse nach Änderung', async ({ page }) => {
  await openConverter(page, true)
  await page.getByLabel('Fotos für PDF', { exact: true }).setInputFiles(await photo('Hoch.png', 'png', '#ff0000', 40, 80))
  await page.getByRole('combobox', { name: 'Seitenformat' }).selectOption('image')
  await page.getByRole('combobox', { name: 'Rand', exact: true }).selectOption('0')
  await expect(page.getByRole('combobox', { name: 'Ausrichtung' })).toBeDisabled()
  await page.getByRole('button', { name: 'PDF erstellen', exact: true }).click()
  let pdf = await PDFDocument.load((await downloaded(page, 'PDF herunterladen')).data)
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(19.2); expect(pdf.getPage(0).getHeight()).toBeCloseTo(38.4)
  await page.getByRole('button', { name: 'Foto 1 drehen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'PDF herunterladen', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'PDF erstellen', exact: true }).click()
  pdf = await PDFDocument.load((await downloaded(page, 'PDF herunterladen')).data)
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(38.4); expect(pdf.getPage(0).getHeight()).toBeCloseTo(19.2)
  await page.getByRole('button', { name: 'Foto 1 entfernen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'PDF erstellen', exact: true })).toBeDisabled()
})

test('AVIF-Foto lässt sich als PDF exportieren', async ({ page }) => {
  await openConverter(page, true)
  await page.getByLabel('Fotos für PDF', { exact: true }).setInputFiles(await photo('Foto.avif', 'avif', '#ff0000'))
  await page.getByRole('button', { name: 'PDF erstellen', exact: true }).click()
  expect((await PDFDocument.load((await downloaded(page, 'PDF herunterladen')).data)).getPageCount()).toBe(1)
})

test('JPEG-EXIF-Ausrichtung von Handyfotos wird berücksichtigt', async ({ page }) => {
  const jpeg = await photo('Handy.jpg', 'jpeg', '#0000ff', 80, 40)
  // APP1/Exif: little-endian TIFF with orientation 6 (90 degrees clockwise).
  const exif = Buffer.from([255, 225, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0])
  jpeg.buffer = Buffer.concat([jpeg.buffer.subarray(0, 2), exif, jpeg.buffer.subarray(2)])
  await openConverter(page, true)
  await page.getByLabel('Fotos für PDF', { exact: true }).setInputFiles(jpeg)
  await expect.poll(() => page.locator('.photo-preview img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(40)
  await page.getByRole('button', { name: 'PDF erstellen', exact: true }).click()
  const doc = await PDFDocument.load((await downloaded(page, 'PDF herunterladen')).data)
  expect(doc.getPage(0).getHeight()).toBeGreaterThan(doc.getPage(0).getWidth())
})

test('A4-Hochformat mit 20-mm-Rand und Fotoauswahl per Drag-and-drop', async ({ page }) => {
  await openConverter(page, true)
  const file = await photo('Foto.png', 'png', '#ff0000')
  await page.locator('.photos-workspace').evaluate((element, data) => {
    const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(data)], 'Foto.png', { type: 'image/png' }))
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, [...file.buffer])
  await page.getByRole('combobox', { name: 'Ausrichtung' }).selectOption('portrait')
  await page.getByRole('combobox', { name: 'Rand', exact: true }).selectOption('20')
  await page.getByRole('button', { name: 'PDF erstellen', exact: true }).click()
  await resultColor(page, 0)
  const pdf = await PDFDocument.load((await downloaded(page, 'PDF herunterladen')).data)
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28); expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89)
})

test('Erzeugte Foto-PDF kann direkt im Editor geöffnet werden', async ({ page }) => {
  await openConverter(page, true)
  await page.getByLabel('Fotos für PDF', { exact: true }).setInputFiles(await photo('Foto.png', 'png', '#ff0000'))
  await page.getByRole('button', { name: 'PDF erstellen', exact: true }).click()
  await page.getByRole('button', { name: 'Im Editor öffnen', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Bearbeiten', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.document-name strong')).toHaveText('Fotos.pdf')
  await expect(page.locator('.pdf-surface canvas')).toBeVisible()
  await page.getByRole('tab', { name: 'Konvertieren', exact: true }).click()
  await expect(page.locator('.photo-card')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'PDF herunterladen', exact: true })).toBeVisible()
})

test('Bearbeitete Editor-PDF samt Live-Entwurf wird für TXT übernommen', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: /Testdokument laden/ }).click()
  await page.getByRole('button', { name: 'Text bearbeiten: Projektübersicht', exact: true }).click()
  await page.getByRole('textbox', { name: 'Vorhandener Text', exact: true }).fill('Konvertierte Grüße')
  await page.getByRole('tab', { name: 'Konvertieren', exact: true }).click()
  await page.getByRole('button', { name: 'Geöffnete PDF übernehmen', exact: true }).click()
  await expect(page.locator('.conversion-filebar')).toContainText('Beispieldokument-bearbeitet.pdf')
  await page.getByRole('combobox', { name: 'Zielformat' }).selectOption('txt')
  expect((await downloaded(page)).data.toString('utf8')).toContain('Konvertierte Grüße')
  await page.getByRole('tab', { name: 'Bearbeiten', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Vorhandener Text', exact: true })).toHaveValue('Konvertierte Grüße')
})

test('Ungültige Fotos, große Dateien und zu viele Fotos', async ({ page }) => {
  await openConverter(page, true)
  const input = page.getByLabel('Fotos für PDF', { exact: true })
  await input.setInputFiles({ name: 'Datei.txt', mimeType: 'text/plain', buffer: Buffer.from('Text') })
  await expect(page.getByRole('alert')).toContainText('JPG, PNG, WebP oder AVIF')
  await input.setInputFiles({ name: 'Defekt.png', mimeType: 'image/png', buffer: Buffer.from('not a photo') })
  await expect(page.getByRole('alert')).toContainText('nicht gelesen')
  await input.evaluate((el: HTMLInputElement) => { const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'Gross.jpg', { type: 'image/jpeg' })); el.files = transfer.files; el.dispatchEvent(new Event('change', { bubbles: true })) })
  await expect(page.getByRole('alert')).toContainText('20 MB')
  await input.evaluate((el: HTMLInputElement) => { const transfer = new DataTransfer(); for (let i = 0; i < 51; i++) transfer.items.add(new File([''], `${i}.png`, { type: 'image/png' })); el.files = transfer.files; el.dispatchEvent(new Event('change', { bubbles: true })) })
  await expect(page.getByRole('alert')).toContainText('50 Fotos')
  await expect(page.locator('.photo-card')).toHaveCount(0)
})

test('PDF-Konvertierung kann abgebrochen werden', async ({ page }) => {
  await openConverter(page)
  const doc = await PDFDocument.create()
  for (let i = 0; i < 15; i++) doc.addPage([595, 842]).drawText('Abbrechen', { x: 50, y: 700 })
  await page.getByLabel('PDF für Konvertierung', { exact: true }).setInputFiles({ name: 'Viele.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) })
  await page.getByRole('combobox', { name: 'Auflösung' }).selectOption('300')
  let downloads = 0; page.on('download', () => downloads++)
  await page.getByRole('button', { name: 'Konvertieren & herunterladen' }).click()
  await page.locator('.conversion-progress').getByRole('button', { name: 'Abbrechen', exact: true }).click()
  await expect(page.locator('.conversion-progress')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0); expect(downloads).toBe(0)
  await expect(page.getByRole('button', { name: 'Konvertieren & herunterladen' })).toBeEnabled()
})

for (const width of [360, 768, 1440]) {
  test(`Konverter bei ${width}px: größere Schrift und kein Überlauf`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await openConverter(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    expect(await page.getByRole('combobox', { name: 'Zielformat' }).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18)
    await page.getByRole('tab', { name: 'Fotos → PDF', exact: true }).click()
    await page.getByLabel('Fotos für PDF', { exact: true }).setInputFiles(await photo('Foto.png', 'png', '#0000ff'))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await page.screenshot({ path: `test-results/konverter-${width}.png`, fullPage: true })
  })
}
