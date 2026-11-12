import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { PDFCanvas } from './PDFCanvas'

export function PdfPreview({ pdf }: { pdf: PDFDocumentProxy }) {
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320), [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [pdf])
  useEffect(() => {
    const el = container.current!
    const resize = new ResizeObserver(() => { if (el.clientWidth) setWidth(Math.min(450, Math.max(120, el.clientWidth - 40))) })
    resize.observe(el)
    return () => resize.disconnect()
  }, [])
  const current = Math.min(page, pdf.numPages - 1)
  return <div className="conversion-preview" ref={container}><div className="conversion-preview-nav"><button aria-label="Vorschau: vorherige Seite" disabled={current === 0} onClick={() => setPage(p => p - 1)}>‹</button><span>Seite {current + 1} / {pdf.numPages}</span><button aria-label="Vorschau: nächste Seite" disabled={current === pdf.numPages - 1} onClick={() => setPage(p => p + 1)}>›</button></div><div className="conversion-preview-page"><PDFCanvas pdf={pdf} page={current} width={width} describe /></div></div>
}

