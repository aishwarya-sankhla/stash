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
    const rows: { y: number; parts: { x: number; end: number; text: string }[] }[] = []
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const [x, y] = [item.transform[4], item.transform[5]]
      let row = rows.find((r) => Math.abs(r.y - y) < 2.5)
      if (!row) rows.push((row = { y, parts: [] }))
      // Some statements print a column twice, a fraction of a point apart; keep one copy.
      if (row.parts.some((p) => p.text === item.str && Math.abs(p.x - x) < 1)) continue
      row.parts.push({ x, end: x + item.width, text: item.str })
    }
    rows.sort((a, b) => b.y - a.y)
    for (const row of rows) {
      const parts = row.parts.sort((a, b) => a.x - b.x)
      // Pieces that touch are one word split by the PDF ("Clos" + "ing"); a gap means a space.
      let text = ''
      parts.forEach((part, i) => {
        const touching = i > 0 && Math.abs(part.x - parts[i - 1].end) < 0.5 && !/\s$/.test(parts[i - 1].text) && !/^\s/.test(part.text)
        text += (i === 0 || touching ? '' : ' ') + part.text
      })
      lines.push(text.replace(/\s+/g, ' ').trim())
    }
  }
  await task.destroy()
  return lines
}
