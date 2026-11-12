import { PDFDocument } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'

export type Photo = { id: string; file: File; url: string; width: number; height: number; rotation: number }
export type PhotoSettings = { format: 'a4' | 'image'; orientation: 'auto' | 'portrait' | 'landscape'; margin: number }
export type PdfTarget = 'png' | 'jpg' | 'txt'
export const photoAccept = 'image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif'

function check(signal?: AbortSignal) { signal?.throwIfAborted() }
export function filenameBase(name: string) { return name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'Datei' }
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
export async function decodePhoto(url: string) {
  const image = new Image(); image.src = url
  await image.decode()
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('Das Foto hat keine gültige Größe.')
  return image
}
export async function preparePhotos(files: File[], existing: Photo[], signal?: AbortSignal): Promise<Photo[]> {
  if (files.length + existing.length > 50) throw new Error('Bitte höchstens 50 Fotos auswählen.')
  if ([...existing.map(p => p.file), ...files].reduce((sum, f) => sum + f.size, 0) > 100 * 1024 * 1024) throw new Error('Die Fotos dürfen zusammen höchstens 100 MB groß sein.')
  const result: Photo[] = []
  try {
    for (const file of files) {
      check(signal)
      if (!/\.(jpe?g|png|webp|avif)$/i.test(file.name) || (file.type && !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type))) throw new Error(`${file.name}: Bitte JPG, PNG, WebP oder AVIF auswählen.`)
      if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: Ein Foto darf höchstens 20 MB groß sein.`)
      const photo: Photo = { id: crypto.randomUUID(), file, url: URL.createObjectURL(file), width: 0, height: 0, rotation: 0 }
      result.push(photo)
      try { const image = await decodePhoto(photo.url); photo.width = image.naturalWidth; photo.height = image.naturalHeight }
      catch { throw new Error(`${file.name}: Das Foto konnte nicht gelesen werden.`) }
    }
    check(signal)
    return result
  } catch (error) { result.forEach(p => URL.revokeObjectURL(p.url)); throw error }
}
function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Das Bild konnte nicht erstellt werden.')), type, quality))
}

export async function photosToPdf(photos: Photo[], settings: PhotoSettings, progress: (current: number, total: number) => void, signal?: AbortSignal) {
  if (!photos.length) throw new Error('Bitte zuerst Fotos auswählen.')
  const doc = await PDFDocument.create()
  for (let index = 0; index < photos.length; index++) {
    check(signal)
    const photo = photos[index]!, image = await decodePhoto(photo.url)
    check(signal)
    const factor = Math.min(1, 6000 / Math.max(image.naturalWidth, image.naturalHeight), Math.sqrt(16_000_000 / (image.naturalWidth * image.naturalHeight)))
    const w = Math.max(1, Math.round(image.naturalWidth * factor)), h = Math.max(1, Math.round(image.naturalHeight * factor))
    const sideways = photo.rotation % 180 !== 0, canvas = document.createElement('canvas')
    canvas.width = sideways ? h : w; canvas.height = sideways ? w : h
    try {
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(photo.rotation * Math.PI / 180)
      ctx.drawImage(image, -w / 2, -h / 2, w, h)
      const usePng = /\.png$/i.test(photo.file.name), blob = await canvasBlob(canvas, usePng ? 'image/png' : 'image/jpeg', .94)
      check(signal)
      const embedded = usePng ? await doc.embedPng(await blob.arrayBuffer()) : await doc.embedJpg(await blob.arrayBuffer())
      const margin = settings.margin * 72 / 25.4
      let pageW: number, pageH: number
      if (settings.format === 'image') { pageW = canvas.width * 72 / 150 + margin * 2; pageH = canvas.height * 72 / 150 + margin * 2 }
      else {
        const landscape = settings.orientation === 'landscape' || (settings.orientation === 'auto' && canvas.width > canvas.height)
        pageW = landscape ? 841.89 : 595.28; pageH = landscape ? 595.28 : 841.89
      }
      const fit = Math.min((pageW - margin * 2) / canvas.width, (pageH - margin * 2) / canvas.height)
      const drawW = canvas.width * fit, drawH = canvas.height * fit
      doc.addPage([pageW, pageH]).drawImage(embedded, { x: (pageW - drawW) / 2, y: (pageH - drawH) / 2, width: drawW, height: drawH })
      progress(index + 1, photos.length)
    } finally { canvas.width = 0; canvas.height = 0 }
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
  check(signal)
  doc.setCreator('EDIT//PDF'); doc.setLanguage('de-DE')
  return doc.save()
}

export function selectedPages(input: string, total: number): number[] {
  const selected = new Set<number>()
  const text = input.trim()
  if (!text) {
    if (total > 100) throw new Error('Bitte einen Bereich mit höchstens 100 Seiten auswählen.')
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  for (const part of text.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/)
    if (!match) throw new Error('Ungültiger Seitenbereich. Beispiel: 1-3, 5')
    const first = Number(match[1]), last = Number(match[2] ?? first)
    if (first < 1 || last > total || first > last || !Number.isSafeInteger(first) || !Number.isSafeInteger(last)) throw new Error(`Bitte Seiten zwischen 1 und ${total} auswählen.`)
    if (last - first + 1 > 100) throw new Error('Bitte höchstens 100 Seiten pro Export auswählen.')
    for (let p = first; p <= last; p++) selected.add(p)
    if (selected.size > 100) throw new Error('Bitte höchstens 100 Seiten pro Export auswählen.')
  }
  return [...selected].sort((a, b) => a - b)
}

export async function pdfToFiles(pdf: PDFDocumentProxy, name: string, target: PdfTarget, dpi: number, range: string, progress: (current: number, total: number) => void, signal?: AbortSignal): Promise<{ blob: Blob; name: string }> {
  const pages = selectedPages(range, pdf.numPages), base = filenameBase(name)
  const images: Record<string, Uint8Array> = {}, text: string[] = []
  let totalBytes = 0
  for (let i = 0; i < pages.length; i++) {
    check(signal)
    const page = await pdf.getPage(pages[i]!)
    if (target === 'txt') {
      const content = await page.getTextContent()
      const lines = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim().normalize('NFC')
      text.push(lines)
    } else {
      check(signal)
      const viewport = page.getViewport({ scale: dpi / 72 })
      if (viewport.width * viewport.height > 24_000_000 || viewport.width > 16384 || viewport.height > 16384) throw new Error('Diese Seite ist für die Auflösung zu groß. Bitte eine niedrigere DPI-Zahl wählen.')
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
      const render = page.render({ canvas, viewport, background: '#ffffff' })
      const abort = () => render.cancel()
      signal?.addEventListener('abort', abort, { once: true })
      try {
        if (signal?.aborted) render.cancel()
        await render.promise; check(signal)
        const blob = await canvasBlob(canvas, target === 'png' ? 'image/png' : 'image/jpeg', .92)
        totalBytes += blob.size
        if (totalBytes > 200 * 1024 * 1024) throw new Error('Der Export ist zu groß. Bitte weniger Seiten oder eine niedrigere Auflösung wählen.')
        images[`${base}-Seite-${String(pages[i]).padStart(3, '0')}.${target}`] = new Uint8Array(await blob.arrayBuffer())
      } finally { signal?.removeEventListener('abort', abort); canvas.width = 0; canvas.height = 0 }
    }
    progress(i + 1, pages.length)
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
  check(signal)
  if (target === 'txt') {
    if (!text.some(t => t.trim())) throw new Error('Kein Text gefunden. Gescannte PDFs benötigen zuerst OCR.')
    return { blob: new Blob([text.map((t, i) => `--- Seite ${pages[i]} ---\n${t}`).join('\n\n')], { type: 'text/plain;charset=utf-8' }), name: `${base}.txt` }
  }
  const entries = Object.entries(images)
  if (entries.length === 1) return { blob: new Blob([entries[0]![1] as BlobPart], { type: target === 'png' ? 'image/png' : 'image/jpeg' }), name: entries[0]![0] }
  const { zipSync } = await import('fflate')
  check(signal)
  return { blob: new Blob([zipSync(images, { level: 0 }) as BlobPart], { type: 'application/zip' }), name: `${base}-${target.toUpperCase()}.zip` }
}
