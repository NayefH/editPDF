import { init } from '@embedpdf/pdfium'
import type { WrappedPdfiumModule } from '@embedpdf/pdfium'
import wasmUrl from '@embedpdf/pdfium/pdfium.wasm?url'

type Matrix = [number, number, number, number, number, number]
export type NativeText = {
  id: string
  text: string
  bounds: [number, number, number, number]
  size: number
  color: string
}
export type TextEdit = { id: string; text: string; size: number; color: string }
export type PageTextEdits = { source: number; edits: TextEdit[] }
const identity: Matrix = [1, 0, 0, 1, 0, 0]
let enginePromise: Promise<WrappedPdfiumModule> | undefined
let fontsPromise: Promise<ArrayBuffer[]> | undefined

async function engine() {
  enginePromise ??= fetch(wasmUrl).then(async response => {
    if (!response.ok) throw new Error('PDF-Engine konnte nicht geladen werden.')
    const instance = await init({ wasmBinary: await response.arrayBuffer() })
    instance.PDFiumExt_Init()
    return instance
  }).catch(error => { enginePromise = undefined; throw error })
  return enginePromise
}
function allocate(api: WrappedPdfiumModule, bytes: Uint8Array) {
  const ptr = api.pdfium.wasmExports.malloc(bytes.length)
  if (!ptr) throw new Error('Nicht genug Speicher für diese PDF.')
  heap(api).set(bytes, ptr)
  return ptr
}
function heap(api: WrappedPdfiumModule) { return (api.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8 }
function open(api: WrappedPdfiumModule, bytes: Uint8Array) {
  const ptr = allocate(api, bytes)
  const document = api.FPDF_LoadMemDocument(ptr, bytes.length, '')
  if (!document) { api.pdfium.wasmExports.free(ptr); throw new Error('PDF konnte nicht zum Bearbeiten geöffnet werden.') }
  return { document, close() { api.FPDF_CloseDocument(document); api.pdfium.wasmExports.free(ptr) } }
}
function scratch<T>(api: WrappedPdfiumModule, size: number, callback: (ptr: number) => T): T {
  const ptr = api.pdfium.wasmExports.malloc(size)
  if (!ptr) throw new Error('Nicht genug Speicher.')
  try { return callback(ptr) } finally { api.pdfium.wasmExports.free(ptr) }
}
function objectText(api: WrappedPdfiumModule, object: number, textPage: number) {
  const length = api.FPDFTextObj_GetText(object, textPage, 0, 0)
  if (length <= 2) return ''
  return scratch(api, length, ptr => { api.FPDFTextObj_GetText(object, textPage, ptr, length); return api.pdfium.UTF16ToString(ptr) })
}
function objectMatrix(api: WrappedPdfiumModule, object: number): Matrix {
  return scratch(api, 24, ptr => {
    if (!api.FPDFPageObj_GetMatrix(object, ptr)) throw new Error('Textposition konnte nicht gelesen werden.')
    return Array.from({ length: 6 }, (_, i) => api.pdfium.getValue(ptr + i * 4, 'float')) as Matrix
  })
}
function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]
}
function transform(m: Matrix, x: number, y: number) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] }
function objectSize(api: WrappedPdfiumModule, object: number) {
  return scratch(api, 4, ptr => api.FPDFTextObj_GetFontSize(object, ptr) ? api.pdfium.getValue(ptr, 'float') : 12)
}
function objectColor(api: WrappedPdfiumModule, object: number): [number, number, number, number] {
  return scratch(api, 16, ptr => {
    if (!api.FPDFPageObj_GetFillColor(object, ptr, ptr + 4, ptr + 8, ptr + 12)) return [0, 0, 0, 255]
    return Array.from({ length: 4 }, (_, i) => api.pdfium.getValue(ptr + i * 4, 'i32')) as [number, number, number, number]
  })
}
function walk(api: WrappedPdfiumModule, page: number, visit: (object: number, id: string, parent: number, world: Matrix, topIndex: number) => void) {
  function traverse(parent: number, path: number[], world: Matrix, depth: number) {
    if (depth > 24) return
    const count = path.length ? api.FPDFFormObj_CountObjects(parent) : api.FPDFPage_CountObjects(page)
    for (let i = 0; i < count; i++) {
      const object = path.length ? api.FPDFFormObj_GetObject(parent, i) : api.FPDFPage_GetObject(page, i)
      const next = [...path, i], type = api.FPDFPageObj_GetType(object)
      if (type === 1) visit(object, next.join('/'), path.length ? parent : 0, world, next[0]!)
      if (type === 5) traverse(object, next, multiply(world, objectMatrix(api, object)), depth + 1)
    }
  }
  traverse(page, [], identity, 0)
}

export async function readPageTexts(bytes: Uint8Array, index: number): Promise<NativeText[]> {
  const api = await engine(), doc = open(api, bytes), page = api.FPDF_LoadPage(doc.document, index)
  if (!page) { doc.close(); throw new Error('Seite konnte nicht gelesen werden.') }
  const textPage = api.FPDFText_LoadPage(page)
  try {
    const result: NativeText[] = []
    walk(api, page, (object, id, _parent, world) => {
      const text = objectText(api, object, textPage)
      if (!text.trim()) return
      scratch(api, 16, ptr => {
        if (!api.FPDFPageObj_GetBounds(object, ptr, ptr + 4, ptr + 8, ptr + 12)) return
        const [l, b, r, t] = Array.from({ length: 4 }, (_, i) => api.pdfium.getValue(ptr + i * 4, 'float')) as [number, number, number, number]
        const corners = [[l, b], [l, t], [r, b], [r, t]].map(([x, y]) => transform(world, x!, y!))
        const rgba = objectColor(api, object)
        result.push({ id, text, bounds: [Math.min(...corners.map(p => p[0]!)), Math.min(...corners.map(p => p[1]!)), Math.max(...corners.map(p => p[0]!)), Math.max(...corners.map(p => p[1]!))], size: objectSize(api, object), color: '#' + rgba.slice(0, 3).map(n => n.toString(16).padStart(2, '0')).join('') })
      })
    })
    return result
  } finally { api.FPDFText_ClosePage(textPage); api.FPDF_ClosePage(page); doc.close() }
}

export async function replacePdfTexts(bytes: Uint8Array, changes: PageTextEdits[]): Promise<Uint8Array> {
  if (!changes.some(p => p.edits.length)) return bytes
  const api = await engine()
  const doc = open(api, bytes)
  const fontHandles: number[] = []
  const fontBuffers: number[] = []
  let fallbackFonts: ArrayBuffer[] | undefined
  try {
    // Fetch before mutating the document; every change starts from the original bytes.
    fontsPromise ??= Promise.all(['Regular', 'Bold'].map(async weight => {
      const response = await fetch(`/fonts/NotoSans-${weight}.ttf`)
      if (!response.ok) throw new Error('Ersatzschrift konnte nicht geladen werden.')
      return response.arrayBuffer()
    })).catch(error => { fontsPromise = undefined; throw error })
    fallbackFonts = await fontsPromise
    const fallback = (bold: boolean) => {
      const i = bold ? 1 : 0
      if (!fontHandles[i]) {
        const data = new Uint8Array(fallbackFonts![i]!), ptr = allocate(api, data)
        fontBuffers.push(ptr)
        fontHandles[i] = api.FPDFText_LoadFont(doc.document, ptr, data.length, 2, true)
        if (!fontHandles[i]) throw new Error('Ersatzschrift konnte nicht eingebettet werden.')
      }
      return fontHandles[i]!
    }
    for (const change of changes) {
      if (!change.edits.length) continue
      const page = api.FPDF_LoadPage(doc.document, change.source)
      if (!page) throw new Error('Seite konnte nicht bearbeitet werden.')
      const textPage = api.FPDFText_LoadPage(page)
      try {
        const candidateText = (object: number) => {
          // Text extraction is cached per text page and only includes attached objects.
          api.FPDFPage_InsertObject(page, object)
          const probe = api.FPDFText_LoadPage(page)
          try { return objectText(api, object, probe) }
          finally { api.FPDFText_ClosePage(probe); api.FPDFPage_RemoveObject(page, object) }
        }
        const targets = new Map<string, { object: number; parent: number; world: Matrix; topIndex: number }>()
        walk(api, page, (object, id, parent, world, topIndex) => targets.set(id, { object, parent, world, topIndex }))
        for (const edit of [...change.edits].sort((a, b) => Number(b.id.split('/')[0]) - Number(a.id.split('/')[0]))) {
          const target = targets.get(edit.id)
          if (!target) throw new Error('Textblock wurde nicht gefunden.')
          const { object, parent, world, topIndex } = target
          const matrix = objectMatrix(api, object), rgba = objectColor(api, object), originalFont = api.FPDFTextObj_GetFont(object)
          const fontName = scratch(api, 512, ptr => { api.FPDFFont_GetBaseFontName(originalFont, ptr, 512); return api.pdfium.UTF8ToString(ptr) })
          const lines = edit.text.normalize('NFC').replace(/\r\n?/g, '\n').split('\n')
          const replacements: number[] = []
          try { for (let line = 0; line < lines.length; line++) {
            const text = lines[line]!
            if (!text) continue
            const setText = (font: number) => {
              const obj = api.FPDFPageObj_CreateTextObj(doc.document, font, edit.size)
              if (!obj) throw new Error('Text konnte nicht angelegt werden.')
              const ok = scratch(api, (text.length + 1) * 2, ptr => { api.pdfium.stringToUTF16(text, ptr, (text.length + 1) * 2); return api.FPDFText_SetText(obj, ptr) })
              if (!ok) { api.FPDFPageObj_Destroy(obj); throw new Error('Text konnte nicht gesetzt werden.') }
              return obj
            }
            let replacement = setText(originalFont)
            if (candidateText(replacement) !== text) {
              api.FPDFPageObj_Destroy(replacement)
              replacement = setText(fallback(/bold|black|heavy|demi/i.test(fontName) || api.FPDFFont_GetWeight(originalFont) >= 600))
              if (candidateText(replacement) !== text) { api.FPDFPageObj_Destroy(replacement); throw new Error('Die Schrift unterstützt eines der eingegebenen Zeichen nicht.') }
            }
            const offset: Matrix = [...matrix]
            offset[4] -= matrix[2] * line * edit.size * 1.3
            offset[5] -= matrix[3] * line * edit.size * 1.3
            const finalMatrix = parent ? multiply(world, offset) : offset
            scratch(api, 24, ptr => { finalMatrix.forEach((n, i) => api.pdfium.setValue(ptr + i * 4, n, 'float')); api.FPDFPageObj_SetMatrix(replacement, ptr) })
            const channels = edit.color.match(/[a-f\d]{2}/gi)?.map(hex => parseInt(hex, 16)) ?? rgba
            api.FPDFPageObj_SetFillColor(replacement, channels[0]!, channels[1]!, channels[2]!, rgba[3])
            replacements.push(replacement)
          } } catch (error) { replacements.forEach(object => api.FPDFPageObj_Destroy(object)); throw error }
          const removed = parent ? api.FPDFFormObj_RemoveObject(parent, object) : api.FPDFPage_RemoveObject(page, object)
          if (!removed) { replacements.forEach(object => api.FPDFPageObj_Destroy(object)); throw new Error('Der ursprüngliche Text konnte nicht entfernt werden.') }
          api.FPDFPageObj_Destroy(object)
          for (let i = 0; i < replacements.length; i++) {
            const replacement = replacements[i]!
            if (parent) api.FPDFPage_InsertObject(page, replacement)
            else if (!api.FPDFPage_InsertObjectAtIndex(page, replacement, topIndex + i)) { replacements.slice(i).forEach(object => api.FPDFPageObj_Destroy(object)); throw new Error('Der Ersatztext konnte nicht eingefügt werden.') }
          }
        }
        if (!api.FPDFPage_GenerateContent(page)) throw new Error('Änderungen konnten nicht gespeichert werden.')
      } finally { api.FPDFText_ClosePage(textPage); api.FPDF_ClosePage(page) }
    }
    const writer = api.PDFiumExt_OpenFileWriter()
    try {
      if (!api.FPDF_SaveAsCopy(doc.document, writer, 2)) throw new Error('PDF konnte nicht gespeichert werden.')
      const size = api.PDFiumExt_GetFileWriterSize(writer)
      if (!size) throw new Error('PDF-Export ist leer.')
      return scratch(api, size, ptr => { api.PDFiumExt_GetFileWriterData(writer, ptr, size); return heap(api).slice(ptr, ptr + size) })
    } finally { api.PDFiumExt_CloseFileWriter(writer) }
  } finally {
    // Fonts remain owned by the document until all pages have been serialized.
    fontHandles.forEach(font => { if (font) api.FPDFFont_Close(font) })
    doc.close()
    fontBuffers.forEach(ptr => api.pdfium.wasmExports.free(ptr))
  }
}
