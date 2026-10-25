import { EXPENSE_CATEGORIES, type Transaction } from './types'

/**
 * Expenses logged on an iPhone with the "Add expense" shortcut, one per line:
 *   2026-10-25 14:03:22 | 250 | Groceries | Milk and bread
 * The file arrives by AirDrop from outside the app, so every line is validated like any other untrusted input.
 */
export const MAX_PHONE_FILE_BYTES = 1024 * 1024
const MAX_LINES = 10_000
const MAX_AMOUNT = 1e8 // ₹10 crore: anything larger is a typo
const MAX_NOTE = 200

export interface PhoneImport {
  fresh: Transaction[]
  duplicates: number
  rejected: { line: number; text: string }[]
}

/** 53-bit string hash (cyrb53), used to give each line a stable ID so re-imports are skipped. */
function hash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

function isCalendarDate(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number)
  const parsed = new Date(Date.UTC(y, m - 1, d))
  return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d
}

function parseLine(line: string): Omit<Transaction, 'id'> & { key: string } | null {
  const [when = '', amountText = '', categoryText = '', ...noteParts] = line.split('|').map((part) => part.trim())
  if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(when) || !isCalendarDate(when.slice(0, 10))) return null
  const cleanAmount = amountText.replace(/₹|rs\.?|inr|,|\s/gi, '')
  if (!/^\d+(\.\d+)?$/.test(cleanAmount)) return null
  const amount = Number(cleanAmount)
  if (!(amount > 0) || amount > MAX_AMOUNT) return null
  const known = EXPENSE_CATEGORIES.find((c) => c.toLowerCase() === categoryText.toLowerCase())
  const typedNote = noteParts.join(' | ')
  // An unrecognised category is kept in the note rather than lost.
  const note = (known || !categoryText ? typedNote : [categoryText, typedNote].filter(Boolean).join(' · '))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, MAX_NOTE)
  return { key: [when, amount, categoryText, typedNote].join('|'), date: when.slice(0, 10), type: 'expense', category: known ?? 'Other', amount, note }
}

/** Parses an iPhone expense file, skipping lines already imported and reporting lines it can't read. */
export function parsePhoneExpenses(text: string, existing: Transaction[]): PhoneImport {
  if (text.length > MAX_PHONE_FILE_BYTES) throw new Error('File too large')
  const seen = new Set(existing.map((t) => t.id))
  const result: PhoneImport = { fresh: [], duplicates: 0, rejected: [] }
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).slice(0, MAX_LINES)
  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (!line) return
    const parsed = parseLine(line)
    if (!parsed) {
      result.rejected.push({ line: i + 1, text: line.slice(0, 80) })
      return
    }
    const { key, ...tx } = parsed
    const id = `iphone-${hash(key)}`
    if (seen.has(id)) {
      result.duplicates++
      return
    }
    seen.add(id)
    result.fresh.push({ id, ...tx })
  })
  return result
}
