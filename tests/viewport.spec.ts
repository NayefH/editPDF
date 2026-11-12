import { test, expect } from '@playwright/test'

async function fits(page: import('@playwright/test').Page) {
  const bounds = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, main: document.querySelector('main')!.getBoundingClientRect().bottom }))
  expect(bounds.sw).toBeLessThanOrEqual(bounds.w + 1)
  expect(bounds.sh).toBeLessThanOrEqual(bounds.h + 1)
  expect(bounds.main).toBeLessThanOrEqual(bounds.h + 1)
}
for (const [width, height] of [[360, 640], [390, 844], [768, 1024], [1280, 720], [1440, 900], [844, 390]]) {
  test(`Viewport ${width}×${height}: Startseite und Werkzeuge bleiben erreichbar`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! }); await page.goto('/')
    await fits(page)
    await expect(page.getByRole('button', { name: 'PDF auswählen', exact: true })).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Testdokument laden' })).toBeInViewport()
    await page.getByRole('button', { name: 'Testdokument laden' }).click()
    await expect(page.locator('.pdf-surface canvas')).toBeVisible(); await fits(page)
    await expect(page.getByRole('button', { name: 'Herunterladen', exact: true })).toBeInViewport()
    await expect(page.locator('.page-scroll')).toBeInViewport()
    await page.getByRole('tab', { name: 'Konvertieren', exact: true }).click()
    await expect(page.locator('.converter-heading h1')).toHaveText('Konvertieren'); await fits(page)
    await page.getByRole('tab', { name: 'Fotos → PDF', exact: true }).click(); await fits(page)
    await page.getByRole('tab', { name: 'Kombinieren', exact: true }).click()
    await expect(page.getByRole('button', { name: 'PDFs auswählen', exact: true })).toBeVisible(); await fits(page)
    const options = page.getByRole('navigation', { name: 'Kombinationsansicht' }).getByRole('button', { name: 'Einstellungen', exact: true })
    if (await options.isVisible()) await options.click()
    await page.getByRole('textbox', { name: 'Dateiname der kombinierten PDF' }).fill('Prüfung')
    await expect(page.getByRole('textbox', { name: 'Dateiname der kombinierten PDF' })).toBeInViewport()
    await fits(page)
  })
}

test('Bereichsnavigation mit Pfeiltasten durch alle drei Bereiche', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Bearbeiten', exact: true }).focus()
  for (const name of ['Konvertieren', 'Kombinieren', 'Bearbeiten']) {
    await page.keyboard.press('ArrowRight'); await expect(page.getByRole('tab', { name, exact: true })).toBeFocused()
    await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
  }
  await page.keyboard.press('ArrowLeft'); await expect(page.getByRole('tab', { name: 'Kombinieren', exact: true })).toBeFocused()
})
