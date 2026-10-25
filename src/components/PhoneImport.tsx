import { useRef, useState } from 'react'
import { formatDate, formatINR } from '../format'
import { MAX_PHONE_FILE_BYTES, parsePhoneExpenses, type PhoneImport as Parsed } from '../phoneImport'
import { desktop, type SetData } from '../store'
import { EXPENSE_CATEGORIES, type AppData } from '../types'
import { CategoryChip } from './ui'

const PREVIEW_ROWS = 8
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Imports expenses logged on an iPhone with the "Add expense" shortcut and sent over by AirDrop. */
export function PhoneImport({ data, setData }: { data: AppData; setData: SetData }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<{ name: string; result: Parsed } | null>(null)
  const [message, setMessage] = useState('')
  const [canTrash, setCanTrash] = useState(false)

  function read(name: string, text: string) {
    setPreview(null)
    setCanTrash(false)
    let result: Parsed
    try {
      result = parsePhoneExpenses(text, data.transactions)
    } catch {
      setMessage(`${name} is too large to be an iPhone expense file.`)
      return
    }
    if (result.fresh.length > 0) {
      setPreview({ name, result })
      setMessage('')
    } else if (result.duplicates > 0) {
      setMessage(`Everything in ${name} was already imported.`)
      setCanTrash(Boolean(desktop))
    } else {
      setMessage(`${name} doesn't contain any expenses from the iPhone shortcut.`)
    }
  }

  async function pick() {
    if (!desktop) return fileInput.current?.click()
    const file = await desktop.pickExpenses()
    if (file) read(file.name, file.text)
  }

  function add() {
    if (!preview) return
    const { fresh } = preview.result
    setData((d) => {
      const ids = new Set(d.transactions.map((t) => t.id))
      return { ...d, transactions: [...d.transactions, ...fresh.filter((t) => !ids.has(t.id))] }
    })
    setMessage(`Added ${plural(fresh.length, 'expense')} from ${preview.name}.`)
    setPreview(null)
    setCanTrash(Boolean(desktop))
  }

  async function trash() {
    setCanTrash(false)
    try {
      await desktop!.trashExpenses()
      setMessage('Moved the file to the Trash.')
    } catch {
      setMessage("Couldn't move the file to the Trash. You can delete it from your Downloads folder.")
    }
  }

  const r = preview?.result
  const rows = r ? [...r.fresh].sort((a, b) => b.date.localeCompare(a.date)) : []

  return (
    <section className="card">
      <div className="card-head">
        <h2>Expenses from your iPhone</h2>
        <button className="primary" onClick={pick}>
          Import iPhone expenses…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".txt,text/plain"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            if (f.size > MAX_PHONE_FILE_BYTES) setMessage(`${f.name} is too large to be an iPhone expense file.`)
            else read(f.name, await f.text())
          }}
        />
      </div>
      <p className="muted small">
        Log spending on your phone with a Shortcut, AirDrop the file here, and review it before anything is added. No internet involved.
        Expenses you've already imported are skipped.
      </p>

      {r && preview && (
        <div className="import-preview">
          <div className="import-summary">
            <strong>
              {plural(r.fresh.length, 'new expense')} · {formatINR(r.fresh.reduce((s, t) => s + t.amount, 0))}
            </strong>
            <span className="muted small">
              {' '}
              from {preview.name}
              {r.duplicates > 0 && ` · ${r.duplicates} already imported`}
            </span>
          </div>
          <ul className="tx-list">
            {rows.slice(0, PREVIEW_ROWS).map((t) => (
              <li key={t.id}>
                <CategoryChip category={t.category} sub={t.note || undefined} />
                <span className="tx-date">{formatDate(t.date)}</span>
                <span className="tx-amt">−{formatINR(t.amount)}</span>
              </li>
            ))}
          </ul>
          {rows.length > PREVIEW_ROWS && <p className="muted small">…and {rows.length - PREVIEW_ROWS} more</p>}
          {r.rejected.length > 0 && (
            <details className="import-rejected">
              <summary>{plural(r.rejected.length, 'line')} couldn't be read and will be skipped</summary>
              <ul>
                {r.rejected.slice(0, 20).map((x) => (
                  <li key={x.line}>
                    <span className="muted">Line {x.line}:</span> <code>{x.text}</code>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="row">
            <button className="primary" onClick={add}>
              Add {plural(r.fresh.length, 'expense')}
            </button>
            <button onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}

      {message && (
        <div className="row">
          <p className="muted">{message}</p>
          {canTrash && <button onClick={trash}>Move the file to Trash</button>}
        </div>
      )}

      <details className="guide">
        <summary>Set up the iPhone shortcut (once, about 5 minutes)</summary>
        <h3>1. Make a private folder on your iPhone</h3>
        <p>
          Files app → <b>Browse</b> → <b>On My iPhone</b> → <b>⋯</b> → <b>New Folder</b>, named <b>Stash</b>. Keeping it in On My iPhone (not iCloud Drive)
          means your expenses never go online.
        </p>
        <h3>2. Build the "Add expense" shortcut</h3>
        <p>
          Shortcuts app → <b>+</b>. Name it <b>Add expense</b>, then add these actions in order (search for each by name):
        </p>
        <ol>
          <li>
            <b>Ask for Input</b>: type <b>Number</b>, prompt <i>Amount (₹)</i>.
          </li>
          <li>
            <b>Set Variable</b>: name <b>Amount</b>, set to <i>Provided Input</i>.
          </li>
          <li>
            <b>List</b>: add these items: {EXPENSE_CATEGORIES.join(', ')}. Spell them the same way so Stash files them correctly; anything else goes under
            Other with its name in the note.
          </li>
          <li>
            <b>Choose from List</b>: prompt <i>Category</i>.
          </li>
          <li>
            <b>Set Variable</b>: name <b>Category</b>, set to the item chosen in the list.
          </li>
          <li>
            <b>Ask for Input</b>: type <b>Text</b>, prompt <i>Note</i>.
          </li>
          <li>
            <b>Set Variable</b>: name <b>Note</b>, set to <i>Provided Input</i>.
          </li>
          <li>
            <b>Text</b>: insert the variables so it reads <code>Current Date | Amount | Category | Note</code> (Current Date is in the variable strip above the keyboard; swipe it or tap Variables). Tap <i>Current Date</i> → Date Format{' '}
            <b>Custom</b> → <code>yyyy-MM-dd HH:mm:ss</code>.
          </li>
          <li>
            <b>Append to Text File</b>: append <i>Text</i>, file path <code>Stash expenses.txt</code>. If the action lets you tap a folder, choose <b>On My iPhone → Stash</b>. If it doesn't, it saves to a <b>Shortcuts</b> folder: after a test run, search Files for <i>Stash expenses</i> to see where. In iCloud Drive it will sync to iCloud, so turn on Advanced Data Protection to keep it end-to-end encrypted.
            Leave <b>Make New Line</b> on.
          </li>
          <li>
            Optional: <b>Show Notification</b> <i>Spent ₹Amount on Category</i>.
          </li>
        </ol>
        <p>
          Tap the shortcut's name → <b>Add to Home Screen</b>. Each line it saves looks like <code>2026-10-25 14:03:22 | 250 | Groceries | Milk and bread</code>.
        </p>
        <h3>3. Send your expenses to the Mac (weekly, or whenever you like)</h3>
        <ol>
          <li>
            Files → the folder where the file is saved → long-press <b>Stash expenses</b> → <b>Share</b> → <b>AirDrop</b> → your Mac. Check the device name before tapping.
          </li>
          <li>
            On the Mac it lands in Downloads. Click <b>Import iPhone expenses…</b> above, choose it, review, and add.
          </li>
          <li>
            {desktop ? (
              <>
                Click <b>Move the file to Trash</b>
              </>
            ) : (
              'Delete the file from Downloads'
            )}
            , then on the iPhone long-press <b>Stash expenses</b> → <b>Delete</b> so the next batch starts fresh. If you
            forget, nothing is added twice.
          </li>
        </ol>
        <p className="muted small">
          For privacy: set AirDrop to Contacts Only, keep a passcode on your iPhone, and consider turning on Advanced Data Protection for iCloud backups.
        </p>
      </details>
    </section>
  )
}
