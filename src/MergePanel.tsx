import { useEffect, useRef, useState } from 'react'
import { animate, createScope } from 'animejs'
import { ArrowDown, ArrowDownToLine, ArrowUp, FileStack, FileText, LoaderCircle, Plus, Trash2, X } from 'lucide-react'
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { prepareMergeInputs, mergePdfs } from './merge-pdf'
import type { MergeInput } from './merge-pdf'
import { downloadBlob } from './conversion'
import { PdfPreview } from './PdfPreview'
import './ConversionPanel.css'
import './MergePanel.css'

type Props = { visible: boolean; onEditorFile?: () => Promise<File>; onOpenEditor: (file: File) => void }

export default function MergePanel({ visible, onEditorFile, onOpenEditor }: Props) {
  const root = useRef<HTMLDivElement>(null), inputRef = useRef<HTMLInputElement>(null), operation = useRef<AbortController | null>(null), mounted = useRef(true)
  const [inputs, setInputs] = useState<MergeInput[]>([]), [result, setResult] = useState<Uint8Array | null>(null)
  const [preview, setPreview] = useState<PDFDocumentProxy | null>(null), [name, setName] = useState('Kombiniert')
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; operation.current?.abort() } }, [])
  useEffect(() => {
    if (!result) { setPreview(null); return }
    let cancelled = false
    const loading = pdfjs.getDocument({ data: result.slice(), cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/' })
    void loading.promise.then(doc => { if (!cancelled) setPreview(doc) }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Vorschau konnte nicht geladen werden.') })
    return () => { cancelled = true; void loading.destroy() }
  }, [result])
  useEffect(() => {
    if (!visible) return
    const scope = createScope({ root, mediaQueries: { reduce: '(prefers-reduced-motion: reduce)' } }).add(self => {
      if (self && !self.matches.reduce) animate('.converter-heading, .converter-content', { opacity: [.3, 1], duration: 220, ease: 'outQuad' })
    })
    return () => scope.revert()
  }, [visible])
  async function run(label: string, action: (signal: AbortSignal) => Promise<void>) {
    if (operation.current) return
    const controller = new AbortController(); operation.current = controller; setBusy(label); setError(''); setProgress({ current: 0, total: 0 })
    try { await action(controller.signal) }
    catch (e) { if (mounted.current && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Die PDFs konnten nicht kombiniert werden.') }
    finally { if (operation.current === controller) operation.current = null; if (mounted.current) setBusy('') }
  }
  function addFiles(files: File[]) {
    if (files.length) void run('PDFs werden geprüft …', async signal => {
      const next = await prepareMergeInputs(files, inputs, signal)
      if (mounted.current) { setInputs(list => [...list, ...next]); setResult(null) }
    })
    if (inputRef.current) inputRef.current.value = ''
  }
  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= inputs.length) return
    const next = [...inputs]; [next[index], next[target]] = [next[target]!, next[index]!]
    setInputs(next); setResult(null)
  }
  const total = inputs.reduce((sum, p) => sum + p.pages, 0)
  const filename = (name.trim().replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'Kombiniert') + '.pdf'
  return <section className="converter merge-panel" aria-label="PDFs kombinieren" ref={root}>
    <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden aria-label="PDFs zum Kombinieren" onChange={e => addFiles(Array.from(e.target.files ?? []))} />
    <div className="converter-heading"><h1>PDFs kombinieren</h1><button className="button button-secondary" disabled={!!busy} onClick={() => inputRef.current?.click()}><Plus size={18} />PDFs hinzufügen</button></div>
    <div className="converter-content" aria-busy={!!busy}>
      <div className="conversion-layout"><div className={`conversion-workspace merge-workspace ${dragging ? 'conversion-dragging' : ''}`} onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true) }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }} onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) addFiles(Array.from(e.dataTransfer.files)) }}>
        {!inputs.length ? <div className="conversion-empty"><FileStack size={48} strokeWidth={1} /><h2>PDFs zusammenführen</h2><p>Dateien auswählen oder hier ablegen</p><button className="button button-primary" disabled={!!busy} onClick={() => inputRef.current?.click()}><Plus size={18} />PDFs auswählen</button><small>Max. 30 PDFs · 50 MB je PDF · 100 MB gesamt</small></div> : <><ol className="merge-file-list">{inputs.map((item, i) => <li key={item.id}><span className="merge-number">{i + 1}</span><FileText size={23} /><div className="merge-file-name"><strong title={item.file.name}>{item.file.name}</strong><span>{item.pages} {item.pages === 1 ? 'Seite' : 'Seiten'} · {(item.file.size / 1024 / 1024).toFixed(2).replace('.', ',')} MB</span></div><div className="merge-file-actions"><button aria-label={`PDF ${i + 1} nach vorne`} disabled={!i || !!busy} onClick={() => move(i, -1)}><ArrowUp size={19} /></button><button aria-label={`PDF ${i + 1} nach hinten`} disabled={i === inputs.length - 1 || !!busy} onClick={() => move(i, 1)}><ArrowDown size={19} /></button><button aria-label={`PDF ${i + 1} entfernen`} disabled={!!busy} onClick={() => { setInputs(list => list.filter(p => p.id !== item.id)); setResult(null) }}><Trash2 size={18} /></button></div></li>)}</ol>{result && preview && <figure className="photo-result merge-result" aria-label="Kombinierte PDF-Vorschau"><figcaption>Kombinierte PDF · {preview.numPages} Seiten</figcaption><PdfPreview pdf={preview} /></figure>}</>}
      </div><aside className="conversion-options"><h2>Zusammenführen</h2><div className="merge-summary" aria-live="polite"><strong>{inputs.length} PDFs</strong><span>{total} {total === 1 ? 'Seite' : 'Seiten'} insgesamt</span></div>
        {onEditorFile && <button className="button button-secondary" disabled={!!busy} onClick={() => void run('Editor-PDF wird übernommen …', async signal => { const file = await onEditorFile(); signal.throwIfAborted(); const next = await prepareMergeInputs([file], inputs, signal); if (mounted.current) { setInputs(list => [...list, ...next]); setResult(null) } })}><Plus size={18} />Geöffnete PDF hinzufügen</button>}
        <label>Dateiname<input aria-label="Dateiname der kombinierten PDF" value={name} onChange={e => setName(e.target.value)} disabled={!!busy} /><small>Die Dateien werden in der gezeigten Reihenfolge kombiniert.</small></label>
        <button className="button button-primary" disabled={inputs.length < 2 || !!busy} onClick={() => void run('PDFs werden kombiniert …', async signal => { const bytes = await mergePdfs(inputs, (current, total) => setProgress({ current, total }), signal); signal.throwIfAborted(); if (mounted.current) setResult(bytes) })}><FileStack size={19} />PDFs kombinieren</button>
        {result && <div className="conversion-result-actions"><button className="button button-primary" disabled={!!busy} onClick={() => downloadBlob(new Blob([result as BlobPart], { type: 'application/pdf' }), filename)}><ArrowDownToLine size={18} />Kombinierte PDF herunterladen</button><button className="button button-secondary" disabled={!!busy || result.byteLength > 50 * 1024 * 1024} title={result.byteLength > 50 * 1024 * 1024 ? 'Der Editor unterstützt PDFs bis 50 MB.' : undefined} onClick={() => onOpenEditor(new File([result as BlobPart], filename, { type: 'application/pdf' }))}>Im Editor öffnen</button></div>}
      </aside></div>
      {busy && <div className="conversion-progress" role="status"><LoaderCircle size={20} className="spin" /><div><strong>{busy}</strong>{progress.total > 0 && <span>{progress.current} / {progress.total} Seiten</span>}</div><button className="button button-secondary" onClick={() => operation.current?.abort()}>Abbrechen</button></div>}
      {error && <div className="conversion-message conversion-error" role="alert"><span>{error}</span><button aria-label="Kombinierungsfehler schließen" onClick={() => setError('')}><X size={18} /></button></div>}
    </div>
  </section>
}
