import { FileUp } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { applyCasImport, guessAssetClass, matchHolding, parseCasText, type CasAction, type CasFund } from '../cas'
import { isoDate } from '../finance'
import { formatDate, formatINR } from '../format'
import type { SetData } from '../store'
import { ASSET_CLASS_LABELS, type AppData, type AssetClass } from '../types'

const MAX_PDF_BYTES = 20 * 1024 * 1024
const CLASSES = Object.keys(ASSET_CLASS_LABELS) as AssetClass[]

type Row = { fund: CasFund; action: CasAction }

/** Updates mutual fund holdings from a CAMS / KFintech CAS PDF, read entirely on this computer. */
export function CasImport({ data, setData }: { data: AppData; setData: SetData }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<{ name: string; bytes: ArrayBuffer } | null>(null)
  const [needPassword, setNeedPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function read(name: string, bytes: ArrayBuffer, pwd?: string) {
    setBusy(true)
    setMessage('')
    try {
      const { readPdfLines, CasPasswordError } = await import('../casPdf')
      let lines: string[]
      try {
        lines = await readPdfLines(bytes.slice(0), pwd)
      } catch (err) {
        if (err instanceof CasPasswordError) {
          setFile({ name, bytes })
          setNeedPassword(true)
          setMessage(err.incorrect ? "That password didn't work. Try again." : '')
          return
        }
        throw err
      }
      const funds = parseCasText(lines)
      if (funds.length === 0) {
        reset()
        setMessage(`No funds found in ${name}. Make sure it's a detailed CAS from CAMS or KFintech (not a summary or a demat statement).`)
        return
      }
      setRows(
        funds.map((fund) => {
          const match = matchHolding(fund, data.holdings)
          return { fund, action: match ? { kind: 'update', holdingId: match.id } : { kind: 'add', assetClass: guessAssetClass(fund.name) } }
        }),
      )
      setFile({ name, bytes })
      setNeedPassword(false)
      setPassword('')
    } catch {
      reset()
      setMessage(`Couldn't read ${name}. Is it a PDF statement?`)
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setFile(null)
    setRows(null)
    setNeedPassword(false)
    setPassword('')
  }

  function submitPassword(e: FormEvent) {
    e.preventDefault()
    if (file && password) read(file.name, file.bytes, password)
  }

  function setAction(i: number, value: string) {
    setRows((rs) =>
      rs!.map((r, j) => {
        if (j !== i) return r
        if (value === 'skip') return { ...r, action: { kind: 'skip' } }
        if (value === 'add') return { ...r, action: { kind: 'add', assetClass: guessAssetClass(r.fund.name) } }
        return { ...r, action: { kind: 'update', holdingId: value } }
      }),
    )
  }

  function apply() {
    if (!rows) return
    const updated = rows.filter((r) => r.action.kind === 'update').length
    const added = rows.filter((r) => r.action.kind === 'add').length
    setData((d) => applyCasImport(d, rows, isoDate()))
    setMessage(`Updated ${updated} holding${updated === 1 ? '' : 's'} and added ${added} from ${file?.name}.`)
    reset()
  }

  const chosen = rows?.filter((r) => r.action.kind !== 'skip') ?? []
  const asOf = rows?.map((r) => r.fund.navDate).filter(Boolean).sort().at(-1)

  return (
    <section className="card">
      <div className="card-head">
        <h2>Update from your CAS statement</h2>
        {!rows && !needPassword && (
          <button className="primary" onClick={() => fileInput.current?.click()} disabled={busy}>
            <FileUp size={16} /> {busy ? 'Reading…' : 'Import CAS statement…'}
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            if (f.size > MAX_PDF_BYTES) return setMessage(`${f.name} is too large to be a CAS statement.`)
            read(f.name, await f.arrayBuffer())
          }}
        />
      </div>
      <p className="muted small">
        Fill in or update all your mutual funds at once from the free statement CAMS and KFintech email you. The PDF is read on this computer and its
        password is never saved.
      </p>

      {needPassword && file && (
        <form className="row cas-password" onSubmit={submitPassword}>
          <span>
            <b>{file.name}</b> is password-protected. Enter the password you chose when requesting it.
          </span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Statement password" autoFocus aria-label="Statement password" />
          <button className="primary" type="submit" disabled={busy || !password}>
            {busy ? 'Opening…' : 'Open'}
          </button>
          <button type="button" onClick={reset}>
            Cancel
          </button>
        </form>
      )}

      {rows && (
        <div className="import-preview">
          <div className="import-summary">
            <strong>
              {rows.length} fund{rows.length === 1 ? '' : 's'} · {formatINR(rows.reduce((s, r) => s + r.fund.value, 0))}
            </strong>
            <span className="muted small">
              {' '}
              from {file?.name}
              {asOf && ` · values as of ${formatDate(asOf)}`}
            </span>
          </div>
          <ul className="cas-list">
            {rows.map((r, i) => (
              <li key={`${r.fund.isin ?? r.fund.name}`}>
                <span className="cas-fund">
                  {r.fund.name}
                  <span className="chip-sub">
                    {r.fund.isin ?? 'No ISIN'} · {r.fund.cost !== null ? `${formatINR(r.fund.cost)} invested` : 'invested amount not shown'}
                  </span>
                </span>
                <span className="cas-value">{formatINR(r.fund.value)}</span>
                <span className="cas-action">
                  <select value={r.action.kind === 'update' ? r.action.holdingId : r.action.kind} onChange={(e) => setAction(i, e.target.value)} aria-label={`What to do with ${r.fund.name}`}>
                    {data.holdings.length > 0 && (
                      <optgroup label="Update holding">
                        {data.holdings.map((h) => (
                          <option key={h.id} value={h.id}>
                            Update: {h.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <option value="add">Add as new holding</option>
                    <option value="skip">Skip</option>
                  </select>
                  {r.action.kind === 'add' && (
                    <select
                      value={r.action.assetClass}
                      onChange={(e) => setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, action: { kind: 'add', assetClass: e.target.value as AssetClass } } : x)))}
                      aria-label={`Type of ${r.fund.name}`}
                    >
                      {CLASSES.map((c) => (
                        <option key={c} value={c}>
                          {ASSET_CLASS_LABELS[c].split(' (')[0]}
                        </option>
                      ))}
                    </select>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">
            Updating sets the holding's invested amount, value and date from the statement; SIP instalments after that date are added back automatically.
            Holdings not in the statement (EPF, NPS, FDs and so on) stay as they are. Funds you split into two rows, like a balanced advantage fund, are
            best skipped and updated by hand.
          </p>
          <div className="row">
            <button className="primary" onClick={apply} disabled={chosen.length === 0}>
              Import {chosen.length} fund{chosen.length === 1 ? '' : 's'}
            </button>
            <button onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      {message && <p className="muted">{message}</p>}

      <details className="guide">
        <summary>How to get your CAS statement (free, once a month)</summary>
        <ol>
          <li>
            Go to <b>camsonline.com</b> → <b>Investors</b> → <b>Statements</b> → <b>CAS – CAMS+KFintech</b> (or <b>mfs.kfintech.com</b> →{' '}
            <b>Consolidated Account Statement</b>). Either one covers all your mutual funds.
          </li>
          <li>
            Choose <b>Detailed</b> (it includes the closing values Stash reads), a period such as <b>Specific period</b> up to today, your email, and a password
            you'll remember.
          </li>
          <li>The PDF arrives by email within minutes. Save it, then click <b>Import CAS statement…</b> here.</li>
        </ol>
        <p className="muted small">
          Requesting the statement needs the internet; reading it in Stash doesn't. Demat statements from NSDL/CDSL use a different format and aren't
          supported yet.
        </p>
      </details>
    </section>
  )
}
