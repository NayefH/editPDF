import { test, expect } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { readFile } from 'node:fs/promises'

test('Production website loads assets and exports PDFs under its deployment path', async ({ page, baseURL }) => {
  const runtimeErrors: string[] = [], failedRequests: string[] = [], assetPaths = new Set<string>()
  const site = new URL(baseURL!)
  page.on('pageerror', error => runtimeErrors.push(error.message))
  page.on('response', response => {
    const url = new URL(response.url())
    if (url.origin !== site.origin) return
    if (response.status() >= 400) failedRequests.push(`${response.status()} ${url.pathname}`)
    assetPaths.add(url.pathname)
  })
  await page.goto(site.href)
  await expect(page.getByRole('heading', { name: 'PDF öffnen', exact: true })).toBeVisible()
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', `${site.pathname}favicon.svg`)

  // Check binary content too: an HTML fallback must not count as a working asset.
  for (const path of [
    'fonts/NotoSans-Regular.ttf',
    'fonts/NotoSans-Bold.ttf',
    'pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap',
    'pdfjs/standard_fonts/LiberationSans-Regular.ttf',
    'pdfjs/wasm/openjpeg.wasm',
  ]) {
    const response = await page.request.get(new URL(path, site).href)
    expect(response.ok(), path).toBeTruthy()
    expect(await response.body(), path).toEqual(await readFile(new URL(`../public/${path}`, import.meta.url)))
  }

  await page.getByRole('button', { name: /Testdokument laden/ }).click()
  await expect(page.locator('.pdf-surface canvas')).toBeVisible()
  await page.getByRole('button', { name: /^Text bearbeiten:/ }).first().click()
  await page.getByRole('textbox', { name: 'Vorhandener Text', exact: true }).fill('Pages: Grüße aus München')
  await page.getByRole('button', { name: 'Übernehmen', exact: true }).click()
  await expect(page.locator('.busy-overlay')).toHaveCount(0, { timeout: 20000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Herunterladen', exact: true }).click()
  const download = await downloading
  const pdf = await PDFDocument.load(await readFile((await download.path())!))
  expect(pdf.getPageCount()).toBe(2)

  expect([...assetPaths].some(path => path.endsWith('.wasm'))).toBeTruthy()
  expect([...assetPaths].some(path => path.includes('pdf.worker'))).toBeTruthy()
  expect([...assetPaths].filter(path => !path.startsWith(site.pathname))).toEqual([])
  expect(failedRequests).toEqual([])
  expect(runtimeErrors).toEqual([])
})
