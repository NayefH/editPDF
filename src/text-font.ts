import type { PDFDocument } from 'pdf-lib'

let fontBytes: Promise<ArrayBuffer> | undefined

export async function embedTextFont(document: PDFDocument) {
  fontBytes ??= fetch(`${import.meta.env.BASE_URL}fonts/NotoSans-Regular.ttf`).then(response => {
    if (!response.ok) throw new Error('Die Schrift für den PDF-Export konnte nicht geladen werden.')
    return response.arrayBuffer()
  }).catch(error => { fontBytes = undefined; throw error })
  const [bytes, { default: fontkit }] = await Promise.all([fontBytes, import('@pdf-lib/fontkit')])
  document.registerFontkit(fontkit)
  return document.embedFont(bytes, { subset: true })
}
