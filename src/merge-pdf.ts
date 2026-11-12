import { PDFDocument } from 'pdf-lib'

export type MergeInput = { id: string; file: File; pages: number }

export async function prepareMergeInputs(files: File[], existing: MergeInput[], signal: AbortSignal): Promise<MergeInput[]> {
  if (files.length + existing.length > 30) throw new Error('Bitte höchstens 30 PDFs auswählen.')
  if ([...existing.map(p => p.file), ...files].reduce((sum, f) => sum + f.size, 0) > 100 * 1024 * 1024) throw new Error('Die PDFs dürfen zusammen höchstens 100 MB groß sein.')
  const result: MergeInput[] = []
  let pageCount = existing.reduce((sum, p) => sum + p.pages, 0)
  for (const file of files) {
    signal.throwIfAborted()
    if (!/\.pdf$/i.test(file.name)) throw new Error(`${file.name}: Bitte eine PDF-Datei auswählen.`)
    if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name}: Eine PDF darf höchstens 50 MB groß sein.`)
    let doc: PDFDocument
    try { doc = await PDFDocument.load(await file.arrayBuffer()) }
    catch (e) { throw new Error(`${file.name}: ${e instanceof Error && /encrypt|password/i.test(e.message) ? 'Die PDF ist passwortgeschützt. Bitte zuerst entsperren.' : 'Die PDF konnte nicht gelesen werden.'}`) }
    const pages = doc.getPageCount()
    if (!pages) throw new Error(`${file.name}: Diese PDF enthält keine Seiten.`)
    pageCount += pages
    if (pageCount > 500) throw new Error('Bitte höchstens 500 Seiten zusammenführen.')
    result.push({ id: crypto.randomUUID(), file, pages })
  }
  signal.throwIfAborted()
  return result
}

export async function mergePdfs(inputs: MergeInput[], progress: (current: number, total: number) => void, signal: AbortSignal) {
  if (inputs.length < 2) throw new Error('Bitte mindestens zwei PDFs auswählen.')
  const output = await PDFDocument.create(), total = inputs.reduce((sum, item) => sum + item.pages, 0)
  let current = 0
  for (const input of inputs) {
    signal.throwIfAborted()
    const source = await PDFDocument.load(await input.file.arrayBuffer())
    signal.throwIfAborted()
    const pages = await output.copyPages(source, source.getPageIndices())
    for (const page of pages) { output.addPage(page); current++; progress(current, total) }
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
  signal.throwIfAborted()
  output.setCreator('EDIT//PDF'); output.setTitle('Kombinierte PDF')
  const bytes = await output.save()
  signal.throwIfAborted()
  return bytes
}
