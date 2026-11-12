import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'

export function PDFCanvas({ pdf, page, width, describe = false }: { pdf: PDFDocumentProxy; page: number; width: number; describe?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState(false)
  const [renderedText, setRenderedText] = useState('')
  useEffect(() => {
    let cancelled = false
    let render: ReturnType<pdfjs.PDFPageProxy['render']> | undefined
    setError(false); setRenderedText('')
    void pdf.getPage(page + 1).then(async p => {
      if (cancelled || !canvasRef.current) return
      const base = p.getViewport({ scale: 1 })
      const viewport = p.getViewport({ scale: width / base.width })
      const canvas = canvasRef.current
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio)
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`
      render = p.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
      await render.promise
      if (describe && !cancelled) {
        const content = await p.getTextContent()
        if (!cancelled) setRenderedText(content.items.map(item => 'str' in item ? item.str : '').join(' '))
      }
    }).catch((e: Error) => { if (!cancelled && e.name !== 'RenderingCancelledException') setError(true) })
    return () => { cancelled = true; render?.cancel() }
  }, [pdf, page, width, describe])
  return <><canvas ref={canvasRef} role={describe ? 'img' : undefined} aria-label={describe ? `PDF-Vorschau: ${renderedText}` : undefined} />{error && <span className="render-error">Vorschau nicht verfügbar</span>}</>
}
