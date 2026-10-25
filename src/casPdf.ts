import { getDocument } from 'pdfjs-dist'

/** Thrown when the PDF is password-protected; `incorrect` is true when a password was given but was wrong. */
export class CasPasswordError extends Error {
  constructor(readonly incorrect: boolean) {
    super(incorrect ? 'Incorrect password' : 'Password required')
  }
}

/**
 * Extracts the text of a PDF as lines, top to bottom. Runs entirely on this computer: pdf.js's parser is
 * bundled into the app and runs in this thread (importing it sets `globalThis.pdfjsWorker`, which pdf.js
 * uses instead of a separate worker), so it also works when Stash.html is opened straight from disk, where
 * browsers refuse to start workers. Fonts and scripts in the PDF are never executed; only its text is read.
 */
export async function readPdfLines(data: ArrayBuffer, password?: string): Promise<string[]> {
  // @ts-expect-error pdfjs-dist ships no types for its worker build; it is imported only for its side effect.
  await import('pdfjs-dist/build/pdf.worker.min.mjs')
  const task = getDocument({ data: new Uint8Array(data), password, disableFontFace: true, useSystemFonts: false, enableXfa: false })
  let doc
  try {
    doc = await task.promise
  } catch (err) {
    await task.destroy()
    if ((err as { name?: string }).name === 'PasswordException') throw new CasPasswordError(Boolean(password))
    throw err
  }
  const lines: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent()
    // Group text pieces into lines by their vertical position, then read each line left to right.
    const rows: { y: number; parts: { x: number; text: string }[] }[] = []
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const [x, y] = [item.transform[4], item.transform[5]]
      let row = rows.find((r) => Math.abs(r.y - y) < 2.5)
      if (!row) rows.push((row = { y, parts: [] }))
      row.parts.push({ x, text: item.str })
    }
    rows.sort((a, b) => b.y - a.y)
    for (const row of rows) lines.push(row.parts.sort((a, b) => a.x - b.x).map((part) => part.text.trim()).join(' '))
  }
  await task.destroy()
  return lines
}
