import { cp, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = new URL('../', import.meta.url)
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  const target = new URL(`public/pdfjs/${directory}`, root)
  await mkdir(target, { recursive: true })
  await cp(fileURLToPath(new URL(`node_modules/pdfjs-dist/${directory}`, root)), fileURLToPath(target), { recursive: true })
}
