import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { PDFDocument, degrees } from 'pdf-lib'
import { readFile } from 'node:fs/promises'

const test = base.extend<{ runtimeErrors: string[] }>({ runtimeErrors: [async ({ page }, use) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await use(errors); expect(errors).toEqual([])
}, { auto: true }] })
async function file(name: string, count = 1, rotated = false) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < count; i++) { const p = doc.addPage([200 + i * 20, 300]); p.drawText(`${name} ${i + 1}: Grüße`, { x: 10, y: 220, size: 12 }); if (rotated) { p.setRotation(degrees(90)); p.setCropBox(5, 10, 180, 270) } }
  return { name: name + '.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) }
}
async function open(page: Page) { await page.goto('/'); await page.getByRole('tab', { name: 'Kombinieren', exact: true }).click(); await expect(page.getByRole('button', { name: 'PDFs auswählen', exact: true })).toBeVisible() }
async function upload(page: Page, files: Awaited<ReturnType<typeof file>>[]) { await page.getByLabel('PDFs zum Kombinieren', { exact: true }).setInputFiles(files); await expect(page.locator('.merge-file-list li')).toHaveCount(files.length) }
async function combine(page: Page) { await page.getByRole('button', { name: 'PDFs kombinieren', exact: true }).click(); await expect(page.getByRole('figure', { name: 'Kombinierte PDF-Vorschau' }).locator('canvas')).toBeVisible() }
async function download(page: Page) { const event = page.waitForEvent('download'); await page.getByRole('button', { name: 'Kombinierte PDF herunterladen', exact: true }).click(); const d = await event; return { name: d.suggestedFilename(), bytes: await readFile((await d.path())!) } }

test('Kombination erhält Seitenreihenfolge, Drehung, CropBox, Text und Dateinamen', async ({ page }) => {
  await open(page); await upload(page, [await file('Erste', 2), await file('Zweite', 1, true)])
  await page.getByRole('button', { name: 'PDF 2 nach vorne', exact: true }).click()
  await expect(page.locator('.merge-file-list li').first()).toContainText('Zweite.pdf')
  await page.getByRole('textbox', { name: 'Dateiname der kombinierten PDF' }).fill('Grüße.2026.pdf')
  await combine(page)
  await expect(page.getByRole('figure', { name: 'Kombinierte PDF-Vorschau' }).locator('canvas')).toHaveAttribute('aria-label', /Zweite 1: Grüße/)
  await page.getByRole('button', { name: 'Vorschau: nächste Seite' }).click()
  await expect(page.getByRole('figure', { name: 'Kombinierte PDF-Vorschau' }).locator('canvas')).toHaveAttribute('aria-label', /Erste 1: Grüße/)
  const output = await download(page), pdf = await PDFDocument.load(output.bytes)
  expect(output.name).toBe('Grüße.2026.pdf'); expect(pdf.getPageCount()).toBe(3)
  expect(pdf.getPage(0).getRotation().angle).toBe(90); expect(pdf.getPage(0).getCropBox()).toEqual({ x: 5, y: 10, width: 180, height: 270 })
  expect(pdf.getPage(1).getSize()).toEqual({ width: 200, height: 300 }); expect(pdf.getPage(2).getWidth()).toBe(220)
  await page.getByRole('button', { name: 'Im Editor öffnen', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Bearbeiten', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.document-name')).toContainText('3 Seiten'); await expect(page.locator('.pdf-surface canvas')).toHaveAttribute('aria-label', /Zweite 1: Grüße/)
})

test('Warteschlange bleibt beim Bereichswechsel erhalten und Änderungen verwerfen das alte Ergebnis', async ({ page }) => {
  await open(page); await upload(page, [await file('A'), await file('B')]); await combine(page)
  await page.getByRole('tab', { name: 'Konvertieren', exact: true }).click(); await page.getByRole('tab', { name: 'Kombinieren', exact: true }).click()
  await expect(page.locator('.merge-file-list li')).toHaveCount(2)
  await page.getByRole('button', { name: 'PDF 1 nach hinten', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Kombinierte PDF herunterladen', exact: true })).toHaveCount(0)
  await combine(page); await page.getByRole('button', { name: 'PDF 1 entfernen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'PDFs kombinieren', exact: true })).toBeDisabled()
  await expect(page.getByRole('figure', { name: 'Kombinierte PDF-Vorschau' })).toHaveCount(0)
  await page.getByLabel('PDFs zum Kombinieren', { exact: true }).setInputFiles(await file('C'))
  await expect(page.locator('.merge-file-list li')).toHaveCount(2); await combine(page)
})

test('Ungültiger Mehrfachupload ist atomar; Datei- und Seitengrenzen', async ({ page }) => {
  await open(page); await upload(page, [await file('A')])
  for (const bad of [{ name: 'falsch.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }, { name: 'defekt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('kaputt') }, await file('Zu lang', 500)]) {
    await page.getByLabel('PDFs zum Kombinieren', { exact: true }).setInputFiles([await file('B'), bad])
    await expect(page.getByRole('alert')).toBeVisible(); await expect(page.locator('.merge-file-list li')).toHaveCount(1)
  }
  await page.getByLabel('PDFs zum Kombinieren', { exact: true }).setInputFiles(Array.from({ length: 30 }, (_, i) => ({ name: i + '.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') })))
  await expect(page.getByRole('alert')).toContainText('30 PDFs'); await expect(page.locator('.merge-file-list li')).toHaveCount(1)
})

test('Editor-PDF mit unbestätigtem Textentwurf hinzufügen', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Testdokument laden' }).click()
  await page.getByRole('button', { name: /^Text bearbeiten:/ }).first().click()
  await page.getByRole('textbox', { name: 'Vorhandener Text', exact: true }).fill('Grüße vom Editor')
  await page.getByRole('tab', { name: 'Kombinieren', exact: true }).click()
  await page.getByRole('button', { name: 'Geöffnete PDF hinzufügen', exact: true }).click()
  await expect(page.locator('.merge-file-list li')).toHaveCount(1)
  await page.getByLabel('PDFs zum Kombinieren', { exact: true }).setInputFiles(await file('Anhang'))
  await expect(page.locator('.merge-file-list li')).toHaveCount(2); await combine(page)
  await expect(page.getByRole('figure', { name: 'Kombinierte PDF-Vorschau' }).locator('canvas')).toHaveAttribute('aria-label', /Grüße vom Editor/)
})

test('Lange Dateiliste scrollt im eigenen Bereich', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 }); await open(page)
  await upload(page, await Promise.all(Array.from({ length: 15 }, (_, i) => file('PDF ' + i))))
  await page.getByRole('button', { name: 'PDF 15 entfernen', exact: true }).click()
  await expect(page.locator('.merge-file-list li')).toHaveCount(14)
  expect(await page.locator('.merge-workspace').evaluate(e => e.scrollTop)).toBeGreaterThan(0)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(640)
})

test('Drag-and-drop, Abbrechen beim Prüfen und erneutes Hinzufügen', async ({ page }) => {
  await open(page)
  const a = await file('Abgelegt'), b = await file('Anhang')
  await page.locator('.merge-workspace').evaluate((el, data) => {
    const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(data)], 'Abgelegt.PDF', { type: 'application/pdf' }))
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, [...a.buffer])
  await expect(page.locator('.merge-file-list li')).toHaveCount(1)
  await page.evaluate(() => { const original = File.prototype.arrayBuffer; File.prototype.arrayBuffer = async function () { await new Promise(r => setTimeout(r, 600)); return original.call(this) } })
  await page.getByLabel('PDFs zum Kombinieren', { exact: true }).setInputFiles(b)
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click()
  await expect(page.locator('.conversion-progress')).toHaveCount(0)
  await expect(page.locator('.merge-file-list li')).toHaveCount(1)
  await page.getByLabel('PDFs zum Kombinieren', { exact: true }).setInputFiles(b)
  await expect(page.locator('.merge-file-list li')).toHaveCount(2); await combine(page)
})
