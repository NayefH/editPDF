import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, CSSProperties } from 'react'
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpRight, Check, CheckCheck, ChevronDown, CircleHelp, FilePlus2, FileText, Highlighter, ImagePlus, LayoutGrid, LoaderCircle, Maximize, Minus, MousePointer2, Pencil, Plus, Redo2, Square, TextCursorInput, Trash2, Type, Undo2, Upload, X } from 'lucide-react'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { NativeText, TextEdit, PageTextEdits } from './native-pdf'
import { embedTextFont } from './text-font'
import { useEditorMotion } from './useEditorMotion'
import { PDFCanvas } from './PDFCanvas'
import { downloadBlob } from './conversion'
import './App.css'
const ConversionPanel = lazy(() => import('./ConversionPanel'))

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
type Tool = 'edit' | 'select' | 'text' | 'highlight' | 'draw' | 'rectangle' | 'image'
type Point = { x: number; y: number }
type Mark = { id: string; type: Tool; x: number; y: number; w: number; h: number; color: string; size: number; text?: string; points?: Point[]; image?: string }
type PageState = { id: string; source: number; marks: Mark[]; replacements: Record<string, TextEdit> }
type TextBox = NativeText & { x: number; y: number; w: number; h: number }
type Snapshot = PageState[]
const tools = [
  { id: 'edit', name: 'Text bearbeiten', icon: TextCursorInput, hint: 'Klicke auf vorhandenen Text, ändere ihn rechts und bestätige mit Übernehmen.' },
  { id: 'select', name: 'Auswählen', icon: MousePointer2, hint: 'Klicke auf ein Element, um es auszuwählen oder zu verschieben.' },
  { id: 'text', name: 'Text hinzufügen', icon: Type, hint: 'Klicke auf eine freie Stelle, um Text hinzuzufügen.' },
  { id: 'highlight', name: 'Markieren', icon: Highlighter, hint: 'Ziehe über einen Bereich, um ihn farbig hervorzuheben.' },
  { id: 'draw', name: 'Zeichnen', icon: Pencil, hint: 'Zeichne mit der Maus oder deinem Stift direkt auf dem Dokument.' },
  { id: 'rectangle', name: 'Formen', icon: Square, hint: 'Ziehe auf der Seite, um ein Rechteck zu zeichnen.' },
  { id: 'image', name: 'Bild', icon: ImagePlus, hint: 'Wähle ein Bild und klicke auf die gewünschte Position im Dokument.' },
] as const
const colors = ['#111111', '#bcff00', '#00bcff', '#00b980', '#f0bf00', '#ff4b8b']
const uid = () => crypto.randomUUID()


function App() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [workspace, setWorkspace] = useState<'edit' | 'convert'>('edit')
  const [converterVisited, setConverterVisited] = useState(false)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [pages, setPages] = useState<PageState[]>([])
  const [activePage, setActivePage] = useState(0)
  const [tool, setTool] = useState<Tool>('edit')
  const [color, setColor] = useState(colors[0]!)
  const [size, setSize] = useState(18)
  const [selected, setSelected] = useState<string | null>(null)
  const [zoom, setZoom] = useState(85)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [help, setHelp] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [imageRatio, setImageRatio] = useState(1.5)
  const [draft, setDraft] = useState<Mark | null>(null)
  const [pageDims, setPageDims] = useState({ width: 595, height: 842 })
  const [nativeTexts, setNativeTexts] = useState<TextBox[]>([])
  const [nativeLoading, setNativeLoading] = useState(false)
  const [nativeForm, setNativeForm] = useState<TextEdit | null>(null)
  const [markTextDraft, setMarkTextDraft] = useState<{ id: string; text: string } | null>(null)
  const [previewUpdating, setPreviewUpdating] = useState(false)
  const [previewVersion, setPreviewVersion] = useState('')
  const [previewPdf, setPreviewPdf] = useState<PDFDocumentProxy | null>(null)
  const nativeCache = useRef(new Map<number, NativeText[]>())
  const previewRef = useRef<PDFDocumentProxy | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ start: Point; mark: Mark; moving?: boolean } | null>(null)
  const draftRef = useRef<Mark | null>(null)
  const pdfRef = useRef(pdf)
  pdfRef.current = pdf
  const current = pages[activePage]
  const selectedMark = current?.marks.find(m => m.id === selected)
  const activeTool = tools.find(t => t.id === tool)!
  const originalNative = nativeForm && nativeTexts.find(t => t.id === nativeForm.id)
  const savedNative = nativeForm && (current?.replacements[nativeForm.id] ?? originalNative)
  const nativeDirty = !!(nativeForm && savedNative && (nativeForm.text !== savedNative.text || nativeForm.color !== savedNative.color || nativeForm.size !== savedNative.size))
  const markDirty = !!(markTextDraft && selectedMark?.id === markTextDraft.id && markTextDraft.text !== selectedMark.text)
  const edited = history.length > 0 || nativeDirty || markDirty
  const livePages = pages.map((p, i) => i === activePage ? {
    ...p,
    replacements: nativeForm && nativeDirty ? { ...p.replacements, [nativeForm.id]: nativeForm } : p.replacements,
    marks: markDirty ? p.marks.map(m => m.id === markTextDraft!.id ? { ...m, text: markTextDraft!.text } : m) : p.marks,
  } : p)
  const displayWidth = pageDims.width * zoom / 100
  const displayHeight = pageDims.height * zoom / 100
  const textEdits: PageTextEdits[] = livePages.filter(p => Object.keys(p.replacements).length).map(p => ({ source: p.source, edits: Object.values(p.replacements) }))
  const textEditsKey = JSON.stringify(textEdits)
  const viewPdf = previewPdf ?? pdf
  useEditorMotion(rootRef, { tool, documentKey: pdf?.fingerprints[0] ?? '', page: activePage, dialog: help ? 'help' : pendingFile ? 'replace' : '', notice: notice || error, dragOver, previewVersion })

  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer) }, [notice])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (edited) event.preventDefault() }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [edited])
  useEffect(() => () => { void pdfRef.current?.loadingTask.destroy(); void previewRef.current?.loadingTask.destroy() }, [])
  useEffect(() => { setSelected(null); setNativeForm(null); setMarkTextDraft(null); setDraft(null); draftRef.current = null; gesture.current = null }, [activePage])
  useEffect(() => {
    if (!pdf || !current) return
    let cancelled = false
    void pdf.getPage(current.source + 1).then(p => { const v = p.getViewport({ scale: 1 }); if (!cancelled) setPageDims({ width: v.width, height: v.height }) })
    return () => { cancelled = true }
  }, [pdf, current?.source])

  useEffect(() => {
    if (!bytes || !pdf || !current) { setNativeTexts([]); return }
    let cancelled = false
    setNativeTexts([]); setNativeLoading(true)
    const source = current.source
    void (async () => {
      const { readPageTexts } = await import('./native-pdf')
      const texts = nativeCache.current.get(source) ?? await readPageTexts(bytes, source)
      const originalPage = await pdf.getPage(source + 1), viewport = originalPage.getViewport({ scale: 1 })
      if (cancelled) return
      nativeCache.current.set(source, texts)
      setNativeTexts(texts.map(t => {
        const m = viewport.transform, [left, bottom, right, top] = t.bounds
        const x1 = m[0]! * left + m[2]! * bottom + m[4]!, y1 = m[1]! * left + m[3]! * bottom + m[5]!
        const x2 = m[0]! * right + m[2]! * top + m[4]!, y2 = m[1]! * right + m[3]! * top + m[5]!
        return { ...t, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
      }))
    })().catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Text konnte nicht erkannt werden.') }).finally(() => { if (!cancelled) setNativeLoading(false) })
    return () => { cancelled = true }
  }, [bytes, pdf, current?.source])

  useEffect(() => {
    let cancelled = false
    let loadingTask: pdfjs.PDFDocumentLoadingTask | undefined
    const edits = JSON.parse(textEditsKey) as PageTextEdits[]
    if (!bytes || !edits.length) {
      setPreviewPdf(null); void previewRef.current?.loadingTask.destroy(); previewRef.current = null
      setPreviewUpdating(false); setPreviewVersion(textEditsKey)
      return
    }
    setPreviewUpdating(true)
    const timer = setTimeout(() => { void (async () => {
      const { replacePdfTexts } = await import('./native-pdf')
      const data = await replacePdfTexts(bytes, edits)
      if (cancelled) return
      loadingTask = pdfjs.getDocument({ data: data.slice(), cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/' })
      const loaded = await loadingTask.promise
      if (cancelled) { void loaded.loadingTask.destroy(); return }
      const old = previewRef.current; previewRef.current = loaded; setPreviewPdf(loaded); void old?.loadingTask.destroy()
      setPreviewVersion(textEditsKey)
    })().catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Vorschau konnte nicht aktualisiert werden.') }).finally(() => { if (!cancelled) setPreviewUpdating(false) }) }, 300)
    return () => { cancelled = true; clearTimeout(timer); if (loadingTask && previewRef.current?.loadingTask !== loadingTask) void loadingTask.destroy() }
  }, [bytes, textEditsKey])

  function commit(next: Snapshot) { setHistory(h => [...h.slice(-39), pages]); setFuture([]); setPages(next) }
  function undo() {
    if (nativeDirty || markDirty) { setNativeForm(null); setMarkTextDraft(null); return }
    if (!history.length) return
    setFuture(f => [pages, ...f]); setPages(history[history.length - 1]!); setHistory(h => h.slice(0, -1)); setSelected(null); setNativeForm(null)
    setActivePage(p => Math.min(p, history[history.length - 1]!.length - 1))
  }
  function redo() {
    if (!future.length) return
    const next = future[0]!
    setHistory(h => [...h, pages]); setPages(next); setFuture(f => f.slice(1)); setSelected(null); setNativeForm(null)
    setActivePage(p => Math.min(p, next.length - 1))
  }
  function applyNativeText(replacement = nativeForm) {
    if (!replacement) return
    setError('')
    if (nativeDirty || replacement.text === '') commit(pages.map((p, i) => i === activePage ? { ...p, replacements: { ...p.replacements, [replacement.id]: { ...replacement } } } : p))
    setNativeForm(null)
  }
  function finishMarkText() {
    if (markTextDraft && markDirty) updateMark(markTextDraft.id, { text: markTextDraft.text })
    setMarkTextDraft(null)
  }
  function updateMark(id: string, patch: Partial<Mark>) { commit(pages.map((p, i) => i === activePage ? { ...p, marks: p.marks.map(m => m.id === id ? { ...m, ...patch } : m) } : p)) }
  function removeMark() { if (!selected) return; commit(pages.map((p, i) => i === activePage ? { ...p, marks: p.marks.filter(m => m.id !== selected) } : p)); setSelected(null) }
  async function loadFile(file: File, confirmed = false) {
    if (!file.name.toLowerCase().endsWith('.pdf')) { setError('Bitte wähle eine PDF-Datei aus.'); return }
    if (file.size > 50 * 1024 * 1024) { setError('Die PDF darf maximal 50 MB groß sein.'); return }
    if (edited && !confirmed) { setPendingFile(file); return }
    setBusy('Deine PDF wird geöffnet …'); setError('')
    let loaded: PDFDocumentProxy | null = null
    try {
      const data = new Uint8Array(await file.arrayBuffer())
      await PDFDocument.load(data)
      loaded = await pdfjs.getDocument({ data: data.slice(), cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/' }).promise
      if (!loaded.numPages) throw new Error('empty')
      const first = await loaded.getPage(1); const viewport = first.getViewport({ scale: 1 })
      void pdf?.loadingTask.destroy()
      setPdf(loaded); setBytes(data); setFileName(file.name); setFileSize(file.size)
      nativeCache.current.clear(); setNativeForm(null); setNativeTexts([]); setMarkTextDraft(null)
      setPages(Array.from({ length: loaded.numPages }, (_, i) => ({ id: uid(), source: i, marks: [], replacements: {} })))
      setPageDims({ width: viewport.width, height: viewport.height }); setActivePage(0); setHistory([]); setFuture([]); setSelected(null)
      setZoom(window.innerWidth < 700 ? Math.max(25, Math.floor((window.innerWidth - 80) / viewport.width * 100)) : 85)
    } catch (e) {
      if (loaded) void loaded.loadingTask.destroy()
      setError(e instanceof Error && /encrypt|password/i.test(e.message) ? 'Diese PDF ist passwortgeschützt. Bitte entferne zuerst den Passwortschutz.' : 'Diese PDF konnte nicht geöffnet werden. Bitte prüfe, ob die Datei vollständig und gültig ist.')
    } finally { setBusy(''); if (fileRef.current) fileRef.current.value = '' }
  }
  async function loadDemo() {
    const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica); const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    for (let i = 0; i < 2; i++) {
      const page = doc.addPage([595.28, 841.89])
      page.drawText('BEISPIELDOKUMENT', { x: 55, y: 775, size: 11, font: bold, color: rgb(.3, .3, .3) })
      page.drawText(i === 0 ? 'Projektübersicht' : 'Notizen', { x: 55, y: 680, size: 32, font: bold, color: rgb(.18, .16, .23) })
      page.drawText(i === 0 ? 'Projekt: Website' : 'Besprechung', { x: 55, y: 575, size: 14, font })
      page.drawRectangle({ x: 55, y: 470, width: 485, height: 65, color: rgb(.95, .93, .98) })
      page.drawText(i === 0 ? 'Aufgaben' : 'Ergebnisse', { x: 75, y: 495, size: 16, font: bold, color: rgb(.3, .3, .3) })
      const lines = i === 0 ? ['01    Anforderungen abstimmen', '02    Entwurf erstellen', '03    Umsetzung prüfen', '04    Freigabe einholen'] : ['Teilnehmende:', '', 'Entscheidungen:', '', 'Nächste Schritte:']
      lines.forEach((line, n) => page.drawText(line, { x: 55, y: 410 - n * 38, size: 12, font, color: rgb(.4, .38, .44) }))
      page.drawLine({ start: { x: 55, y: 78 }, end: { x: 540, y: 78 }, thickness: .5, color: rgb(.85, .83, .88) })
      page.drawText(`Seite ${i + 1}`, { x: 55, y: 55, size: 9, font, color: rgb(.5, .48, .55) })
    }
    const data = await doc.save(); await loadFile(new File([data as BlobPart], 'Beispieldokument.pdf', { type: 'application/pdf' }))
  }
  function point(event: ReactPointerEvent): Point { const rect = surfaceRef.current!.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) } }
  function setLive(mark: Mark | null) { draftRef.current = mark; setDraft(mark) }
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!current || event.button !== 0) return
    const pos = point(event)
    if (tool === 'select' || tool === 'edit') { setSelected(null); setNativeForm(null); return }
    if (tool === 'image' && !image) { imageRef.current?.click(); return }
    const mark: Mark = { id: uid(), type: tool, ...pos, w: tool === 'image' ? .3 : .001, h: tool === 'image' ? .2 : .001, color, size, text: tool === 'text' ? 'Dein Text' : undefined, points: tool === 'draw' ? [pos] : undefined, image: tool === 'image' ? image! : undefined }
    if (tool === 'text' || tool === 'image') {
      if (tool === 'image') {
        mark.w = Math.min(.3, 1 - pos.x)
        mark.h = mark.w * pageDims.width / imageRatio / pageDims.height
        if (mark.h > 1 - pos.y) { mark.h = 1 - pos.y; mark.w = mark.h * pageDims.height * imageRatio / pageDims.width }
      }
      commit(pages.map((p, i) => i === activePage ? { ...p, marks: [...p.marks, mark] } : p)); setSelected(mark.id); setTool('select'); return
    }
    event.currentTarget.setPointerCapture(event.pointerId); gesture.current = { start: pos, mark }; setSelected(null); setLive(mark)
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!gesture.current) return
    const pos = point(event), { start, mark, moving } = gesture.current
    if (moving) setLive({ ...mark, x: Math.max(0, Math.min(1 - mark.w, mark.x + pos.x - start.x)), y: Math.max(0, Math.min(1 - mark.h, mark.y + pos.y - start.y)), points: mark.points?.map(p => ({ x: p.x + pos.x - start.x, y: p.y + pos.y - start.y })) })
    else if (mark.type === 'draw') setLive({ ...mark, points: [...(draftRef.current?.points ?? [start]), pos] })
    else setLive({ ...mark, x: Math.min(start.x, pos.x), y: Math.min(start.y, pos.y), w: Math.abs(pos.x - start.x), h: Math.abs(pos.y - start.y) })
  }
  function pointerUp() {
    const next = draftRef.current
    if (!next || !gesture.current) { gesture.current = null; setLive(null); return }
    const moving = gesture.current.moving
    if (moving || next.type === 'draw' || (next.w > .004 && next.h > .004)) { commit(pages.map((p, i) => i === activePage ? { ...p, marks: moving ? p.marks.map(m => m.id === next.id ? next : m) : [...p.marks, next] } : p)); setSelected(next.id) }
    gesture.current = null; setLive(null)
  }
  function selectMark(event: ReactPointerEvent<SVGElement>, mark: Mark) {
    if (tool !== 'select') return
    event.stopPropagation(); setSelected(mark.id); setNativeForm(null); surfaceRef.current?.setPointerCapture(event.pointerId); gesture.current = { start: point(event), mark, moving: true }
  }
  async function readImage(file?: File) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Bitte wähle ein PNG-, JPG- oder WebP-Bild.'); return }
    if (file.size > 10 * 1024 * 1024) { setError('Das Bild darf maximal 10 MB groß sein.'); return }
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const src = reader.result as string, img = new Image(); img.src = src; await img.decode()
        setImageRatio(img.naturalWidth / img.naturalHeight); setImage(src); setTool('image'); setNotice('Klicke auf die Seite, um dein Bild einzufügen.')
      } catch { setError('Das Bild konnte nicht geöffnet werden. Bitte wähle eine andere Datei.') }
    }
    reader.onerror = () => setError('Das Bild konnte nicht gelesen werden.')
    reader.readAsDataURL(file)
    if (imageRef.current) imageRef.current.value = ''
  }
  async function createEditorFile(): Promise<File> {
    if (!bytes || !pdf) throw new Error('Bitte zuerst eine PDF öffnen.')
      const { replacePdfTexts } = await import('./native-pdf')
      const editedBytes = await replacePdfTexts(bytes, textEdits)
      const source = await PDFDocument.load(editedBytes), output = await PDFDocument.create()
      const textFont = livePages.some(p => p.marks.some(m => m.type === 'text')) ? await embedTextFont(output) : null
      const textCharacters = new Set(textFont?.getCharacterSet() ?? [])
      for (const state of livePages) {
        const [copy] = await output.copyPages(source, [state.source]); output.addPage(copy!)
        if (!state.marks.length) continue
        const original = await pdf.getPage(state.source + 1), viewport = original.getViewport({ scale: 1 })
        const canvas = document.createElement('canvas'), factor = 2
        canvas.width = Math.ceil(viewport.width * factor); canvas.height = Math.ceil(viewport.height * factor)
        const ctx = canvas.getContext('2d')!; ctx.scale(factor, factor)
        let hasOverlay = false
        const flushOverlay = async () => {
          if (!hasOverlay) return
          const overlay = await output.embedPng(canvas.toDataURL('image/png')), [x, y] = viewport.convertToPdfPoint(0, viewport.height)
          copy!.drawImage(overlay, { x, y, width: viewport.width, height: viewport.height, rotate: degrees(original.rotate) })
          ctx.clearRect(0, 0, viewport.width, viewport.height); hasOverlay = false
        }
        for (const mark of state.marks) {
          const x = mark.x * viewport.width, y = mark.y * viewport.height, w = mark.w * viewport.width, h = mark.h * viewport.height
          if (mark.type === 'text' && textFont) {
            await flushOverlay()
            const channels = mark.color.match(/[a-f\d]{2}/gi)!.map(hex => parseInt(hex, 16) / 255)
            const ascent = textFont.heightAtSize(mark.size, { descender: false })
            const lines = (mark.text ?? '').normalize('NFC').split(/\r?\n/)
            for (let index = 0; index < lines.length; index++) {
              const line = lines[index]!, baseline = y + ascent + index * mark.size * 1.3
              if (![...line].every(char => textCharacters.has(char.codePointAt(0)!))) {
                // Keep symbols outside Noto Sans visible through the browser's font fallback.
                await document.fonts.load(`${mark.size}px "Noto Sans PDF"`)
                ctx.save(); ctx.font = `${mark.size}px "Noto Sans PDF", Arial, sans-serif`; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = mark.color; ctx.fillText(line, x, baseline); ctx.restore()
                hasOverlay = true
                continue
              }
              await flushOverlay()
              const [tx, ty] = viewport.convertToPdfPoint(x, baseline)
              copy!.drawText(line, { x: tx, y: ty, size: mark.size, font: textFont, color: rgb(channels[0]!, channels[1]!, channels[2]!), rotate: degrees(original.rotate) })
            }
            continue
          }
          hasOverlay = true
          ctx.save(); ctx.fillStyle = mark.color; ctx.strokeStyle = mark.color; ctx.lineWidth = mark.type === 'draw' ? Math.max(1, mark.size / 6) : 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
          if (mark.type === 'highlight') { ctx.globalAlpha = .3; ctx.fillRect(x, y, w, h) }
          if (mark.type === 'rectangle') ctx.strokeRect(x, y, w, h)
          if (mark.type === 'draw' && mark.points) { ctx.beginPath(); mark.points.forEach((p, i) => { if (!i) ctx.moveTo(p.x * viewport.width, p.y * viewport.height); else ctx.lineTo(p.x * viewport.width, p.y * viewport.height) }); ctx.stroke() }
          if (mark.type === 'image' && mark.image) { const img = new Image(); img.src = mark.image; await img.decode(); ctx.drawImage(img, x, y, w, h) }
          ctx.restore()
        }
        await flushOverlay()
      }
      output.setTitle(fileName.replace(/\.pdf$/i, '')); output.setCreator('EDIT//PDF'); output.setLanguage('de-DE')
      return new File([await output.save() as BlobPart], fileName.replace(/\.pdf$/i, '') + '-bearbeitet.pdf', { type: 'application/pdf' })
  }
  async function download() {
    if (!bytes || !pdf) return
    setBusy('Deine PDF wird vorbereitet …'); setError('')
    try { const file = await createEditorFile(); downloadBlob(file, file.name); setNotice('Die bearbeitete PDF wurde heruntergeladen.') }
    catch (error) { setError(error instanceof Error ? error.message : 'Die PDF konnte nicht exportiert werden.') }
    finally { setBusy('') }
  }

  function movePage(direction: number) { const target = activePage + direction; if (target < 0 || target >= pages.length) return; const next = [...pages]; [next[activePage], next[target]] = [next[target]!, next[activePage]!]; commit(next); setActivePage(target) }
  function chooseTool(next: Tool) { setTool(next); setSelected(null); setNativeForm(null); if (next === 'highlight') setColor('#bcff00'); if (next === 'image' && pdf) imageRef.current?.click() }
  const marks = [...(livePages[activePage]?.marks.filter(m => m.id !== draft?.id) ?? []), ...(draft ? [draft] : [])]

  return <div className="app-shell" ref={rootRef}>
    <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void loadFile(file) }} />
    <input ref={imageRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => void readImage(e.target.files?.[0])} />
    <header className="site-header">
      <a className="brand" href="./" aria-label="EDIT PDF Startseite"><span className="brand-icon"><FileText size={23} strokeWidth={1.8} /></span>EDIT<span className="brand-dot">//</span>PDF</a>
      <nav className="header-nav"><div className="workspace-tabs" role="tablist" aria-label="Bereich" onKeyDown={e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault(); const next = workspace === 'edit' ? 'convert' : 'edit'; setWorkspace(next); setConverterVisited(true); document.getElementById(next + '-tab')?.focus()
      }}><button id="edit-tab" role="tab" aria-selected={workspace === 'edit'} aria-controls="pdf-editor-panel" tabIndex={workspace === 'edit' ? 0 : -1} onClick={() => setWorkspace('edit')}>Bearbeiten</button><button id="convert-tab" role="tab" aria-selected={workspace === 'convert'} aria-controls="converter-panel" tabIndex={workspace === 'convert' ? 0 : -1} onClick={() => { setConverterVisited(true); setWorkspace('convert') }}>Konvertieren</button></div><button className="help-button" onClick={() => setHelp(true)}><CircleHelp size={17} /> Hilfe</button></nav>
    </header>
    <main>
      <div id="pdf-editor-panel" role="tabpanel" aria-labelledby="edit-tab" hidden={workspace !== 'edit'}><section className={`editor ${pdf ? 'has-document' : ''}`} aria-label="PDF-Editor">
        <div className="editor-topbar">
          <div className="document-name"><span className="file-icon"><FileText size={18} /></span><div><strong>{fileName || 'Keine PDF geöffnet'}</strong>{pdf && <span>{pages.length} {pages.length === 1 ? 'Seite' : 'Seiten'} · {(fileSize / 1024 / 1024).toFixed(2).replace('.', ',')} MB</span>}</div></div>
          <div className="document-actions"><button className="button button-secondary" aria-label={pdf ? 'PDF wechseln' : 'PDF öffnen'} onClick={() => fileRef.current?.click()} disabled={!!busy}><Upload size={15} /><span>{pdf ? 'PDF wechseln' : 'PDF öffnen'}</span></button><button className="button button-primary download-button" onClick={() => void download()} disabled={!pdf || !!busy}><ArrowDownToLine size={16} /><span>Herunterladen</span></button></div>
        </div>
        <div className="editor-toolbar"><div className="tool-group">{tools.map(t => <button key={t.id} title={t.name} className={`tool-button ${tool === t.id ? 'active' : ''}`} aria-label={t.name} aria-pressed={tool === t.id} onClick={() => chooseTool(t.id)} disabled={!!busy}><t.icon size={18} strokeWidth={1.7} /><span>{t.name}</span></button>)}</div><div className="history-buttons"><button title="Rückgängig" aria-label="Rückgängig" onClick={undo} disabled={(!history.length && !nativeDirty && !markDirty) || !!busy}><Undo2 size={18} /></button><button title="Wiederholen" aria-label="Wiederholen" onClick={redo} disabled={!future.length || nativeDirty || markDirty || !!busy}><Redo2 size={18} /></button></div></div>
        <div className="editor-body">
          {pdf && <aside className="pages-sidebar"><div className="sidebar-title"><LayoutGrid size={14} /> Seiten <span>{pages.length}</span></div><div className="thumbnails">{pages.map((p, i) => <button className={`thumbnail ${activePage === i ? 'selected' : ''}`} key={p.id} onClick={() => setActivePage(i)} aria-label={`Seite ${i + 1}`} disabled={!!busy}><div><PDFCanvas pdf={viewPdf!} page={p.source} width={100} />{(p.marks.length > 0 || Object.keys(p.replacements).length > 0) && <span className="edited-dot" />}</div><span>{i + 1}</span></button>)}</div><div className="page-actions"><button title="Seite nach vorne" aria-label="Seite nach vorne" onClick={() => movePage(-1)} disabled={activePage === 0 || !!busy}><ArrowUp size={16} /></button><button title="Seite nach hinten" aria-label="Seite nach hinten" onClick={() => movePage(1)} disabled={activePage === pages.length - 1 || !!busy}><ArrowDown size={16} /></button><button title="Seite löschen" aria-label="Seite löschen" disabled={pages.length <= 1 || !!busy} onClick={() => { commit(pages.filter((_, i) => i !== activePage)); setActivePage(Math.max(0, activePage - 1)) }}><Trash2 size={15} /></button></div></aside>}
          <div className={`workspace ${dragOver ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); if (!busy) setDragOver(true) }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }} onDrop={e => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file && !busy) void loadFile(file) }}>
            {!pdf ? <div className="upload-view"><div className="upload-zone"><FileText className="upload-file-icon" size={45} strokeWidth={1} /><h1>PDF öffnen</h1><p>Datei hier ablegen</p><button className="button button-primary upload-button" disabled={!!busy} onClick={() => fileRef.current?.click()}><Plus size={18} /> PDF auswählen <ArrowUpRight size={16} /></button><span className="upload-limit">Max. 50 MB</span></div><button className="demo-button" disabled={!!busy} onClick={() => void loadDemo()}><FileText size={14} />Testdokument laden</button></div> : <div className="page-scroll">
              <div className="preview-heading"><span className="live-indicator" role="status" aria-label={previewUpdating ? "Vorschau wird aktualisiert" : previewVersion === textEditsKey ? "Live-Vorschau aktuell" : "Vorschau nicht aktuell"}>{previewUpdating ? <LoaderCircle size={12} className="spin" /> : <span className={previewVersion === textEditsKey ? undefined : "live-stale"} />}Live-Vorschau</span><div className="page-label"><button aria-label="Vorherige Seite" disabled={activePage === 0 || !!busy} onClick={() => setActivePage(p => p - 1)}>‹</button> SEITE {activePage + 1} <span>/{pages.length}</span> <button aria-label="Nächste Seite" disabled={activePage === pages.length - 1 || !!busy} onClick={() => setActivePage(p => p + 1)}>›</button></div></div>
              <div className={`pdf-surface cursor-${tool}`} ref={surfaceRef} data-preview-version={previewVersion} aria-busy={previewUpdating} style={{ width: displayWidth, height: displayHeight }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { gesture.current = null; setLive(null) }}>
                <PDFCanvas pdf={viewPdf!} page={current!.source} width={displayWidth} describe />
                <svg className="annotation-layer" viewBox={`0 0 ${pageDims.width} ${pageDims.height}`} aria-label="PDF-Bearbeitungen">
                  {(tool === 'edit' || tool === 'select') && nativeTexts.filter(t => current!.replacements[t.id]?.text !== '').map(t => <rect key={`native-${t.id}`} className={`existing-text-box ${nativeForm?.id === t.id ? 'is-selected' : ''}`} x={t.x - 2} y={t.y - 2} width={Math.max(4, t.w + 4)} height={Math.max(8, t.h + 4)} fill="transparent" role="button" tabIndex={0} aria-label={`Text bearbeiten: ${current!.replacements[t.id]?.text ?? t.text}`} onPointerDown={e => { e.stopPropagation(); setSelected(null); setNativeForm(current!.replacements[t.id] ?? { id: t.id, text: t.text, size: t.size, color: t.color }) }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(null); setNativeForm(current!.replacements[t.id] ?? { id: t.id, text: t.text, size: t.size, color: t.color }) } }} />)}
                  {marks.map(m => {
                    const x = m.x * pageDims.width, y = m.y * pageDims.height, w = m.w * pageDims.width, h = m.h * pageDims.height
                    const common = { onPointerDown: (e: ReactPointerEvent<SVGElement>) => selectMark(e, m), style: { pointerEvents: tool === 'select' ? 'auto' as const : 'none' as const, cursor: 'move' } }
                    return <g key={m.id}>{m.type === 'text' && <text {...common} x={x} y={y} fill={m.color} fontSize={m.size} fontFamily="Noto Sans PDF, Arial, sans-serif" dominantBaseline="text-before-edge">{(m.text ?? '').split('\n').map((line, i) => <tspan key={i} x={x} dy={i ? m.size * 1.3 : 0}>{line || ' '}</tspan>)}</text>}{m.type === 'highlight' && <rect {...common} x={x} y={y} width={w} height={h} fill={m.color} fillOpacity={.3} />}{m.type === 'rectangle' && <rect {...common} x={x} y={y} width={w} height={h} fill="transparent" stroke={m.color} strokeWidth={1.5} />}{m.type === 'draw' && <polyline {...common} points={m.points?.map(p => `${p.x * pageDims.width},${p.y * pageDims.height}`).join(' ')} fill="none" stroke={m.color} strokeWidth={Math.max(1, m.size / 6)} strokeLinecap="round" strokeLinejoin="round" />}{m.type === 'image' && <image {...common} x={x} y={y} width={w} height={h} href={m.image} preserveAspectRatio="none" />}{selected === m.id && m.type !== 'draw' && <rect x={x - 3} y={y - 3} width={m.type === 'text' ? Math.max(...(m.text ?? '').split('\n').map(l => l.length), 3) * m.size * .58 + 6 : w + 6} height={m.type === 'text' ? (m.text ?? '').split('\n').length * m.size * 1.3 + 6 : h + 6} fill="none" stroke="#659000" strokeWidth={1} strokeDasharray="4 3" pointerEvents="none" />}</g>
                  })}
                </svg>
              </div>
            </div>}
            {busy && <div className="busy-overlay" role="status"><LoaderCircle size={28} className="spin" /><strong>{busy}</strong></div>}{dragOver && <div className="drop-overlay"><Upload size={32} /><strong>PDF hier ablegen</strong></div>}
          </div>
          <aside className="properties-sidebar"><div className="sidebar-title">Eigenschaften</div><div className="properties-content">
            <div className="property-tool"><span><activeTool.icon size={20} /></span><h3>{nativeForm ? 'Vorhandener Text' : selectedMark ? 'Element bearbeiten' : activeTool.name}</h3></div>
            {nativeForm && <div className="native-edit-form"><label className="property-field">Vorhandener Text<textarea value={nativeForm.text} onChange={e => { setNativeForm({ ...nativeForm, text: e.target.value }); setError('') }} rows={5} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); applyNativeText() } }} /></label><div className="draft-actions"><button className="button button-primary apply-text" disabled={!!busy || !nativeDirty} onClick={() => applyNativeText()}><Check size={15} />Übernehmen</button><button className="button button-secondary" disabled={!!busy} onClick={() => setNativeForm(null)}>Abbrechen</button></div></div>}
            {selectedMark?.type === 'text' && <label className="property-field">Dein Text<textarea key={selectedMark.id} value={markTextDraft?.id === selectedMark.id ? markTextDraft.text : selectedMark.text ?? ''} onChange={e => setMarkTextDraft({ id: selectedMark.id, text: e.target.value })} onBlur={finishMarkText} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.blur() }} placeholder="Text" rows={3} /></label>}
            {(nativeForm || selectedMark?.type !== 'image') && (tool !== 'edit' || nativeForm) && <div className="property-field"><label>Farbe</label><div className="color-options">{colors.map(c => <button key={c} style={{ '--swatch': c } as CSSProperties} className={`color-swatch ${(nativeForm?.color ?? selectedMark?.color ?? color) === c ? 'chosen' : ''}`} aria-label={`Farbe ${c}`} aria-pressed={(nativeForm?.color ?? selectedMark?.color ?? color) === c} onClick={() => { if (nativeForm) setNativeForm({ ...nativeForm, color: c }); else { setColor(c); if (selectedMark) updateMark(selectedMark.id, { color: c }) } }}>{(nativeForm?.color ?? selectedMark?.color ?? color) === c && <Check size={12} />}</button>)}<label className="custom-color" title="Eigene Farbe"><Plus size={13} /><input type="color" value={nativeForm?.color ?? selectedMark?.color ?? color} aria-label="Eigene Farbe" onChange={e => { if (nativeForm) setNativeForm({ ...nativeForm, color: e.target.value }); else { setColor(e.target.value); if (selectedMark) updateMark(selectedMark.id, { color: e.target.value }) } }} /></label></div></div>}
            {(nativeForm || selectedMark?.type === 'text' || selectedMark?.type === 'draw' || tool === 'text' || tool === 'draw') && <div className="property-field"><label htmlFor="text-size">{tool === 'draw' || selectedMark?.type === 'draw' ? 'Strichstärke' : 'Schriftgröße'}</label><div className="size-control"><Type size={15} /><select id="text-size" value={nativeForm?.size ?? selectedMark?.size ?? size} onChange={e => { if (nativeForm) setNativeForm({ ...nativeForm, size: Number(e.target.value) }); else { setSize(Number(e.target.value)); if (selectedMark) updateMark(selectedMark.id, { size: Number(e.target.value) }) } }}>{[...new Set([10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, nativeForm?.size ?? selectedMark?.size ?? size])].sort((a, b) => a - b).map(n => <option key={n} value={n}>{Math.round(n * 100) / 100}</option>)}</select><span>pt</span><ChevronDown size={13} /></div></div>}
            {selectedMark?.type === 'image' && <div className="property-field"><label>Bildbreite</label><input type="range" min="5" max="90" value={selectedMark.w * 100} aria-label="Bildbreite" onChange={e => { const w = Number(e.target.value) / 100; updateMark(selectedMark.id, { w, h: selectedMark.h * w / selectedMark.w }) }} /></div>}
            {selectedMark && <button className="remove-element" onClick={removeMark}><Trash2 size={14} />Element entfernen</button>}
            {nativeForm && <button className="remove-element" disabled={!!busy} onClick={() => applyNativeText({ ...nativeForm, text: '' })}><Trash2 size={14} />Text löschen</button>}
            {!nativeForm && <p className="tool-instruction">{!pdf ? 'PDF öffnen, um zu bearbeiten.' : tool === 'edit' && nativeLoading ? 'Text wird erkannt …' : tool === 'edit' && !nativeTexts.length ? 'Kein bearbeitbarer Text erkannt. Für gescannte Seiten ist OCR nötig.' : activeTool.hint}</p>}
          </div></aside>
        </div>
        <div className="editor-statusbar"><span>{pdf ? `${pages.length} ${pages.length === 1 ? 'Seite' : 'Seiten'}` : 'Keine Datei'}</span><div className="zoom-controls"><button aria-label="Verkleinern" onClick={() => setZoom(z => Math.max(25, z - 10))} disabled={!pdf || zoom <= 25}><Minus size={14} /></button><span>{pdf ? `${zoom} %` : '100 %'}</span><button aria-label="Vergrößern" onClick={() => setZoom(z => Math.min(200, z + 10))} disabled={!pdf || zoom >= 200}><Plus size={14} /></button><span className="zoom-divider" /><button aria-label="Seite einpassen" title="Seite einpassen" disabled={!pdf} onClick={() => { const container = surfaceRef.current?.parentElement?.parentElement; if (container) setZoom(Math.max(25, Math.min(200, Math.floor((container.clientWidth - 72) / pageDims.width * 100)))) }}><Maximize size={14} /></button></div></div>
      </section></div>
      <div id="converter-panel" role="tabpanel" aria-labelledby="convert-tab" hidden={workspace !== 'convert'}>{converterVisited && <Suspense fallback={<div className="converter-loading" role="status">Konverter wird geladen …</div>}><ConversionPanel visible={workspace === 'convert'} onEditorFile={pdf ? createEditorFile : undefined} onOpenEditor={file => { setWorkspace('edit'); void loadFile(file) }} /></Suspense>}</div>
    </main>
    {notice && <div className="toast" role="status"><CheckCheck size={17} />{notice}<button aria-label="Meldung schließen" onClick={() => setNotice('')}><X size={15} /></button></div>}
    {error && <div className="error-toast" role="alert"><CircleHelp size={18} /><span>{error}</span><button aria-label="Fehler schließen" onClick={() => setError('')}><X size={16} /></button></div>}
    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-heading" onClick={e => e.stopPropagation()}><button className="modal-close" aria-label="Schließen" onClick={() => setHelp(false)}><X size={20} /></button><h2 id="help-heading">Hilfe</h2><ol><li><strong>Text bearbeiten</strong><span>Vorhandenen Text anklicken und rechts ändern. Die Vorschau folgt beim Tippen. „Übernehmen“ bestätigt, „Abbrechen“ verwirft den Entwurf. Bei gescannten PDFs ist zuvor OCR erforderlich.</span></li><li><strong>Elemente ergänzen</strong><span>Werkzeug auswählen und auf der Seite klicken oder ziehen. Eigene Elemente lassen sich mit „Auswählen“ verschieben.</span></li><li><strong>Speichern</strong><span>„Herunterladen“ speichert die bearbeitete PDF. Ohne Download gehen Änderungen beim Schließen verloren.</span></li></ol><button className="button button-primary" onClick={() => setHelp(false)}>Schließen</button></section></div>}
    {pendingFile && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="replace-heading"><FilePlus2 size={25} /><h2 id="replace-heading">PDF wechseln?</h2><p>Nicht heruntergeladene Änderungen werden verworfen.</p><div className="modal-actions"><button className="button button-secondary" onClick={() => setPendingFile(null)}>Abbrechen</button><button className="button button-primary" onClick={() => { const next = pendingFile; setPendingFile(null); void loadFile(next, true) }}>PDF wechseln</button></div></section></div>}
  </div>
}
export default App
