import { MobilePaneNav } from './MobilePaneNav'
import { useEffect, useRef, useState } from 'react'
import { animate, createScope } from 'animejs'
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowRightLeft, FileText, ImagePlus, LoaderCircle, Plus, RotateCw, Trash2, Upload, X } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { PdfPreview } from './PdfPreview'
import { downloadBlob, pdfToFiles, photoAccept, photosToPdf, preparePhotos } from './conversion'
import type { PdfTarget, Photo, PhotoSettings } from './conversion'
import './ConversionPanel.css'

type Props = { visible: boolean; onEditorFile?: () => Promise<File>; onOpenEditor: (file: File) => void }
const pdfOptions = { cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/' }

export default function ConversionPanel({ visible, onEditorFile, onOpenEditor }: Props) {
  const [mobilePane, setMobilePane] = useState<'files' | 'options'>('files')
  const root = useRef<HTMLDivElement>(null), pdfInput = useRef<HTMLInputElement>(null), photoInput = useRef<HTMLInputElement>(null)
  const operation = useRef<AbortController | null>(null), mounted = useRef(true)
  const [mode, setMode] = useState<'pdf' | 'photos'>('pdf')
  const [pdfSource, setPdfSource] = useState<{ name: string; doc: PDFDocumentProxy } | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([]), photosRef = useRef(photos)
  photosRef.current = photos
  const [settings, setSettings] = useState<PhotoSettings>({ format: 'a4', orientation: 'auto', margin: 10 })
  const [target, setTarget] = useState<PdfTarget>('png'), [dpi, setDpi] = useState(150), [range, setRange] = useState('')
  const [outputName, setOutputName] = useState('Fotos'), [photoResult, setPhotoResult] = useState<Uint8Array | null>(null)
  const [resultDoc, setResultDoc] = useState<PDFDocumentProxy | null>(null)
  const [busy, setBusy] = useState(''), [progress, setProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [dragging, setDragging] = useState(false)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; operation.current?.abort(); photosRef.current.forEach(p => URL.revokeObjectURL(p.url)) }
  }, [])
  useEffect(() => () => { void pdfSource?.doc.loadingTask.destroy() }, [pdfSource?.doc])
  useEffect(() => {
    if (!photoResult) { setResultDoc(null); return }
    let cancelled = false
    const loading = pdfjs.getDocument({ data: photoResult.slice(), ...pdfOptions })
    void loading.promise.then(doc => { if (!cancelled) setResultDoc(doc) }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Vorschau konnte nicht geladen werden.') })
    return () => { cancelled = true; void loading.destroy() }
  }, [photoResult])
  useEffect(() => {
    if (!visible) return
    const scope = createScope({ root, mediaQueries: { reduceMotion: '(prefers-reduced-motion: reduce)' } }).add(self => {
      if (self && !self.matches.reduceMotion) animate('.converter-heading, .converter-content', { opacity: [.3, 1], duration: 220, ease: 'outQuad' })
    })
    return () => scope.revert()
  }, [visible, mode])

  async function run(label: string, action: (signal: AbortSignal) => Promise<void>) {
    if (operation.current) return
    const controller = new AbortController(); operation.current = controller
    setBusy(label); setError(''); setNotice(''); setProgress({ current: 0, total: 0 })
    try { await action(controller.signal) }
    catch (e) { if (mounted.current && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Die Konvertierung ist fehlgeschlagen.') }
    finally { if (operation.current === controller) operation.current = null; if (mounted.current) setBusy('') }
  }
  async function readPdf(file: File, signal: AbortSignal) {
    if (!/\.pdf$/i.test(file.name)) throw new Error('Bitte eine PDF-Datei auswählen.')
    if (file.size > 50 * 1024 * 1024) throw new Error('Die PDF darf höchstens 50 MB groß sein.')
    let doc: PDFDocumentProxy | null = null
    try {
      const data = new Uint8Array(await file.arrayBuffer())
      await PDFDocument.load(data)
      signal.throwIfAborted()
      const loading = pdfjs.getDocument({ data: data.slice(), ...pdfOptions })
      const abort = () => { void loading.destroy() }; signal.addEventListener('abort', abort, { once: true })
      try { doc = await loading.promise } finally { signal.removeEventListener('abort', abort) }
      signal.throwIfAborted()
      if (!mounted.current) { void doc.loadingTask.destroy(); return }
      setPdfSource({ name: file.name, doc }); setRange('')
    } catch (e) {
      if (doc) void doc.loadingTask.destroy()
      if (signal.aborted) throw e
      throw new Error(e instanceof Error && /encrypt|password/i.test(e.message) ? 'Die PDF ist passwortgeschützt. Bitte zuerst entsperren.' : 'Die PDF konnte nicht geöffnet werden. Bitte eine gültige PDF auswählen.')
    }
  }
  function choosePdf(file?: File) { if (file) void run('PDF wird geladen …', signal => readPdf(file, signal)); if (pdfInput.current) pdfInput.current.value = '' }
  function addPhotos(files: File[]) {
    if (!files.length) return
    void run('Fotos werden geladen …', async signal => {
      const next = await preparePhotos(files, photosRef.current, signal)
      if (!mounted.current) { next.forEach(p => URL.revokeObjectURL(p.url)); return }
      setPhotos(prev => [...prev, ...next]); setPhotoResult(null)
    })
    if (photoInput.current) photoInput.current.value = ''
  }
  function movePhoto(index: number, delta: number) {
    const next = [...photos], target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    setPhotos(next); setPhotoResult(null)
  }
  function changeSettings(next: Partial<PhotoSettings>) { setSettings(s => ({ ...s, ...next })); setPhotoResult(null) }
  const resultName = (outputName.trim().replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'Fotos') + '.pdf'

  return <section data-mobile-pane={mobilePane} className="converter" ref={root} aria-label="Dateien konvertieren">
    <input ref={pdfInput} type="file" accept="application/pdf,.pdf" hidden aria-label="PDF für Konvertierung" onChange={e => choosePdf(e.target.files?.[0])} />
    <input ref={photoInput} type="file" accept={photoAccept} multiple hidden aria-label="Fotos für PDF" onChange={e => addPhotos(Array.from(e.target.files ?? []))} />
    <div className="converter-heading"><h1>Konvertieren</h1><div className="conversion-types" role="tablist" aria-label="Konvertierungsart"><button role="tab" aria-selected={mode === 'pdf'} disabled={!!busy} onClick={() => { setMode('pdf'); setMobilePane('files'); setError(''); setNotice('') }}><FileText size={19} />PDF → Bilder / Text</button><button role="tab" aria-selected={mode === 'photos'} disabled={!!busy} onClick={() => { setMode('photos'); setMobilePane('files'); setError(''); setNotice('') }}><ImagePlus size={19} />Fotos → PDF</button></div></div>
    <MobilePaneNav label="Konverteransicht" value={mobilePane} onChange={setMobilePane} items={[{ id: 'files', label: 'Dateien & Vorschau' }, { id: 'options', label: 'Einstellungen' }]} />
    <div className="converter-content" aria-busy={!!busy}>
      {mode === 'pdf' ? <div className="conversion-layout"><div className={`conversion-workspace ${dragging ? 'conversion-dragging' : ''}`} onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true) }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }} onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) choosePdf(e.dataTransfer.files[0]) }}>
        {pdfSource ? <><div className="conversion-filebar"><span><FileText size={17} />{pdfSource.name}</span><button className="button button-secondary" disabled={!!busy} onClick={() => pdfInput.current?.click()}><Upload size={17} />PDF wechseln</button></div><PdfPreview pdf={pdfSource.doc} /></> : <div className="conversion-empty"><FileText size={48} strokeWidth={1} /><h2>PDF auswählen</h2><p>Hier ablegen oder Datei öffnen</p><button className="button button-primary" disabled={!!busy} onClick={() => pdfInput.current?.click()}><Plus size={18} />PDF zum Konvertieren auswählen</button><small>Max. 50 MB</small></div>}
      </div><aside className="conversion-options"><h2>Export</h2>{onEditorFile && <button className="button button-secondary import-editor" disabled={!!busy} onClick={() => void run('Editor-PDF wird übernommen …', async signal => { const file = await onEditorFile(); signal.throwIfAborted(); await readPdf(file, signal) })}><ArrowRightLeft size={17} />Geöffnete PDF übernehmen</button>}
        <label>Zielformat<select aria-label="Zielformat" value={target} disabled={!!busy} onChange={e => setTarget(e.target.value as PdfTarget)}><option value="png">PNG-Bilder</option><option value="jpg">JPG-Bilder</option><option value="txt">Textdatei (TXT)</option></select></label>
        {target !== 'txt' && <label>Auflösung<select aria-label="Auflösung" value={dpi} disabled={!!busy} onChange={e => setDpi(Number(e.target.value))}><option value={72}>72 dpi</option><option value={150}>150 dpi</option><option value={300}>300 dpi</option></select></label>}
        <label>Seiten<input aria-label="Seiten für Export" value={range} disabled={!!busy} onChange={e => setRange(e.target.value)} placeholder="Alle Seiten" inputMode="text" /><small>Zum Beispiel 1-3, 5. Max. 100 Seiten.</small></label>
        <p className="conversion-hint">{target === 'txt' ? 'Exportiert die vorhandene Textebene. Bildscans benötigen OCR.' : 'Mehrere Seiten werden gemeinsam als ZIP gespeichert.'}</p>
        <button className="button button-primary conversion-submit" disabled={!pdfSource || !!busy} onClick={() => void run('PDF wird konvertiert …', async signal => { const result = await pdfToFiles(pdfSource!.doc, pdfSource!.name, target, dpi, range, (current, total) => setProgress({ current, total }), signal); signal.throwIfAborted(); downloadBlob(result.blob, result.name); setNotice(`${result.name} wurde heruntergeladen.`) })}><ArrowDownToLine size={18} />Konvertieren & herunterladen</button>
      </aside></div> : <div className="conversion-layout"><div className={`conversion-workspace photos-workspace ${dragging ? 'conversion-dragging' : ''}`} onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true) }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }} onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) addPhotos(Array.from(e.dataTransfer.files)) }}>
        <div className="conversion-filebar"><span><ImagePlus size={18} />{photos.length} {photos.length === 1 ? 'Foto' : 'Fotos'}</span><button className="button button-secondary" disabled={!!busy} onClick={() => photoInput.current?.click()}><Plus size={17} />Fotos hinzufügen</button></div>
        {!photos.length ? <div className="conversion-empty"><ImagePlus size={48} strokeWidth={1} /><h2>Fotos auswählen</h2><p>JPG, PNG, WebP oder AVIF</p><button className="button button-primary" disabled={!!busy} onClick={() => photoInput.current?.click()}><Plus size={18} />Fotos für PDF auswählen</button><small>Max. 50 Fotos · 20 MB je Foto · 100 MB gesamt</small></div> : <><ol className="photo-grid">{photos.map((photo, i) => <li key={photo.id} className="photo-card"><div className="photo-preview"><img src={photo.url} alt={photo.file.name} style={{ transform: `rotate(${photo.rotation}deg)` }} /></div><div className="photo-name"><span>{i + 1}</span><strong title={photo.file.name}>{photo.file.name}</strong></div><div className="photo-controls"><button aria-label={`Foto ${i + 1} nach vorne`} disabled={i === 0 || !!busy} onClick={() => movePhoto(i, -1)}><ArrowUp size={18} /></button><button aria-label={`Foto ${i + 1} nach hinten`} disabled={i === photos.length - 1 || !!busy} onClick={() => movePhoto(i, 1)}><ArrowDown size={18} /></button><button aria-label={`Foto ${i + 1} drehen`} disabled={!!busy} onClick={() => { setPhotos(list => list.map(p => p.id === photo.id ? { ...p, rotation: (p.rotation + 90) % 360 } : p)); setPhotoResult(null) }}><RotateCw size={18} /></button><button aria-label={`Foto ${i + 1} entfernen`} disabled={!!busy} onClick={() => { URL.revokeObjectURL(photo.url); setPhotos(list => list.filter(p => p.id !== photo.id)); setPhotoResult(null) }}><Trash2 size={17} /></button></div></li>)}</ol>{photoResult && resultDoc && <figure className="photo-result" aria-label="Ergebnisvorschau"><figcaption>PDF-Vorschau · {resultDoc.numPages} {resultDoc.numPages === 1 ? 'Seite' : 'Seiten'}</figcaption><PdfPreview pdf={resultDoc} /></figure>}</>}
      </div><aside className="conversion-options"><h2>PDF-Einstellungen</h2>
        <label>Seitenformat<select aria-label="Seitenformat" value={settings.format} disabled={!!busy} onChange={e => changeSettings({ format: e.target.value as PhotoSettings['format'] })}><option value="a4">A4</option><option value="image">Bildformat (150 dpi)</option></select></label>
        <label>Ausrichtung<select aria-label="Ausrichtung" value={settings.orientation} disabled={!!busy || settings.format === 'image'} onChange={e => changeSettings({ orientation: e.target.value as PhotoSettings['orientation'] })}><option value="auto">Automatisch</option><option value="portrait">Hochformat</option><option value="landscape">Querformat</option></select></label>
        <label>Rand<select aria-label="Rand" value={settings.margin} disabled={!!busy} onChange={e => changeSettings({ margin: Number(e.target.value) })}><option value={0}>Kein Rand</option><option value={10}>10 mm</option><option value={20}>20 mm</option></select></label>
        <label>Dateiname<input aria-label="PDF-Dateiname" value={outputName} disabled={!!busy} onChange={e => setOutputName(e.target.value)} placeholder="Fotos" /><small>.pdf wird automatisch ergänzt.</small></label>
        <button className="button button-primary conversion-submit" disabled={!photos.length || !!busy} onClick={() => void run('PDF wird erstellt …', async signal => { const data = await photosToPdf(photos, settings, (current, total) => setProgress({ current, total }), signal); signal.throwIfAborted(); setPhotoResult(data) })}><FileText size={18} />PDF erstellen</button>
        {photoResult && <div className="conversion-result-actions"><button className="button button-primary" disabled={!!busy} onClick={() => downloadBlob(new Blob([photoResult as BlobPart], { type: 'application/pdf' }), resultName)}><ArrowDownToLine size={18} />PDF herunterladen</button><button className="button button-secondary" disabled={!!busy} onClick={() => onOpenEditor(new File([photoResult as BlobPart], resultName, { type: 'application/pdf' }))}>Im Editor öffnen</button></div>}
      </aside></div>}
      {busy && <div className="conversion-progress" role="status"><LoaderCircle size={20} className="spin" /><div><strong>{busy}</strong>{progress.total > 0 && <><progress value={progress.current} max={progress.total} aria-label="Konvertierungsfortschritt" /><span>{progress.current} / {progress.total}</span></>}</div><button className="button button-secondary" onClick={() => operation.current?.abort()}>Abbrechen</button></div>}
      {error && <div className="conversion-message conversion-error" role="alert"><span>{error}</span><button aria-label="Konvertierungsfehler schließen" onClick={() => setError('')}><X size={18} /></button></div>}
      {notice && <div className="conversion-message" role="status"><span>{notice}</span><button aria-label="Hinweis schließen" onClick={() => setNotice('')}><X size={18} /></button></div>}
    </div>
  </section>
}
