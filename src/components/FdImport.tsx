import { FileUp } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { applyFdImport, bankKey, FD_BANKS, fdOutline, maturityMismatch, pairFds, parseFdText, paysOutInterest, type FdBank, type ImportedFd, type ParsedFd } from '../fdImport'
import { formatDate, formatINR } from '../format'
import { copyText, desktop, type SetData } from '../store'
import type { AppData } from '../types'

const MAX_PDF_BYTES = 20 * 1024 * 1024
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type Doc = { name: string; bytes: ArrayBuffer }
/** A file with FDs in it, and its bank when the file names it. */
type FoundFile = { name: string; bank: FdBank | null; fds: ParsedFd[]; incomplete: number; outline: string }

/**
 * Replaces a bank's FDs with the ones in its deposit advices, e-receipts or FD summary (HDFC Bank, SBI, ICICI Bank),
 * read entirely on this computer.
 */
export function FdImport({ data, setData }: { data: AppData; setData: SetData }) {
  const fileInput = useRef<HTMLInputElement>(null)
  /** Files still to read; the first one is waiting for its password when `askPassword` is set. */
  const [queue, setQueue] = useState<Doc[]>([])
  const [askPassword, setAskPassword] = useState(false)
  const [password, setPassword] = useState('')
  /** The last password that worked, tried first on the next files (banks use the same one for all their advices). */
  const lastPassword = useRef<string | undefined>(undefined)
  const [found, setFound] = useState<FoundFile[] | null>(null)
  /** Banks you picked for files that don't name theirs, by file position. */
  const [chosenBank, setChosenBank] = useState<Record<number, FdBank>>({})
  const [unread, setUnread] = useState<{ name: string; outline: string }[]>([])
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [kept, setKept] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState('')

  async function readQueue(docs: Doc[], typed?: string, soFar: FoundFile[] = found ?? [], bad = unread) {
    setBusy(true)
    setMessage('')
    const { readPdfLines, CasPasswordError } = await import('../casPdf')
    const fds = [...soFar]
    const failed = [...bad]
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i]
      const pwd = i === 0 && typed ? typed : lastPassword.current
      let lines: string[]
      try {
        lines = await readPdfLines(doc.bytes.slice(0), pwd)
      } catch (err) {
        if (err instanceof CasPasswordError) {
          setQueue(docs.slice(i))
          setFound(fds.length > 0 ? fds : null)
          setUnread(failed)
          setAskPassword(true)
          setPassword('')
          setMessage(i === 0 && typed ? "That password didn't work. Try again." : '')
          setBusy(false)
          return
        }
        failed.push({ name: doc.name, outline: '' })
        continue
      }
      if (pwd) lastPassword.current = pwd
      const result = parseFdText(lines)
      if (result.fds.length === 0) failed.push({ name: doc.name, outline: fdOutline(lines) })
      else fds.push({ name: doc.name, ...result, outline: fdOutline(lines) })
    }
    setQueue([])
    setAskPassword(false)
    setFound(fds.length > 0 ? fds : null)
    setUnread(failed)
    setSkipped(new Set())
    setKept(new Set())
    setChosenBank({})
    setBusy(false)
  }

  function reset() {
    setQueue([])
    setAskPassword(false)
    setPassword('')
    setFound(null)
    setUnread([])
    lastPassword.current = undefined
  }

  function submitPassword(e: FormEvent) {
    e.preventDefault()
    if (password) readQueue(queue, password)
  }

  // Every FD found, with its bank; the same FD in an advice and a summary is listed once.
  const entries: { key: string; file: number; bank: FdBank | null; fd: ParsedFd }[] = []
  found?.forEach((f, file) =>
    f.fds.forEach((fd, i) => {
      const bank = f.bank ?? chosenBank[file] ?? null
      const twin = (e: (typeof entries)[number]) => e.file !== file && e.bank === bank && pairFds([{ ...fd, bank: bank! }], [{ ...e.fd, id: '', bank: e.bank ?? '' }])[0]
      if (!entries.some(twin)) entries.push({ key: `${file}-${i}`, file, bank, fd })
    }),
  )
  const incomplete = found?.reduce((s, f) => s + f.incomplete, 0) ?? 0
  const bankless = found?.flatMap((f, file) => (f.bank ? [] : [{ file, name: f.name }])) ?? []
  const ready = bankless.every((b) => chosenBank[b.file])
  const picked = entries.filter((e) => e.bank && !skipped.has(e.key))
  const chosen: ImportedFd[] = picked.map((e) => ({ ...e.fd, bank: e.bank! }))
  const matches = pairFds(chosen, data.fds)
  const matchOf = (key: string) => matches[picked.findIndex((e) => e.key === key)]
  const banks = [...new Set(entries.flatMap((e) => (e.bank ? [e.bank] : [])))]
  // FDs of the same banks that aren't in the files: removed unless kept, so the bank's FDs match its documents.
  const missing = found ? data.fds.filter((f) => banks.includes(bankKey(f.bank) as FdBank) && !matches.includes(f)) : []
  const removing = missing.filter((f) => !kept.has(f.id))

  async function apply() {
    await desktop?.backupNow()
    const updated = matches.filter(Boolean).length
    setData((d) => applyFdImport(d, chosen, removing.map((f) => f.id)))
    setMessage(
      `Imported ${plural(chosen.length, 'FD')}: ${updated} updated, ${chosen.length - updated} added${removing.length > 0 ? `, ${removing.length} removed` : ''}.${desktop ? ' Your data was backed up first (Settings → Backups).' : ''}`,
    )
    reset()
  }

  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set)
    if (!next.delete(value)) next.add(value)
    return next
  }
  // Files to report: unread ones, or when FDs were found, those files too in case their numbers look wrong.
  const outlines = (found ?? unread).filter((u) => u.outline)

  return (
    <div className="fd-import">
      {!found && !askPassword && (
        <div className="row">
          <button onClick={() => fileInput.current?.click()} disabled={busy}>
            <FileUp size={16} /> {busy ? 'Reading…' : 'Import from bank PDFs…'}
          </button>
          <span className="muted small">HDFC Bank, SBI or ICICI Bank FD advices, e-receipts or FD summary. Read on this computer.</span>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          const tooBig = files.filter((f) => f.size > MAX_PDF_BYTES)
          const docs = await Promise.all(files.filter((f) => f.size <= MAX_PDF_BYTES).map(async (f) => ({ name: f.name, bytes: await f.arrayBuffer() })))
          reset()
          if (docs.length > 0) readQueue(docs, undefined, [], tooBig.map((f) => ({ name: f.name, outline: '' })))
        }}
      />

      {askPassword && queue[0] && (
        <form className="row cas-password" onSubmit={submitPassword}>
          <span>
            <b>{queue[0].name}</b> is password-protected. Banks usually use your customer ID or date of birth; the email the PDF came with says which.
          </span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="PDF password" autoFocus aria-label="PDF password" />
          <button className="primary" type="submit" disabled={busy || !password}>
            {busy ? 'Opening…' : 'Open'}
          </button>
          <button type="button" onClick={() => readQueue(queue.slice(1), undefined, found ?? [], [...unread, { name: queue[0].name, outline: '' }])} disabled={busy}>
            Skip this file
          </button>
          <button type="button" onClick={reset}>
            Cancel
          </button>
        </form>
      )}

      {found && !askPassword && (
        <div className="import-preview">
          <div className="import-summary">
            <strong>
              {plural(entries.length, 'FD')} · {formatINR(entries.reduce((s, e) => s + e.fd.principal, 0))}
            </strong>
            {banks.length > 0 && <span className="muted small"> found for {banks.length > 1 ? `${banks.slice(0, -1).join(', ')} and ${banks.at(-1)}` : banks[0]}</span>}
          </div>
          {bankless.map((b) => (
            <label key={b.file} className="row fd-import-bank">
              <span>
                Which bank is <b>{b.name}</b> from? It doesn't say in its text.
              </span>
              <select value={chosenBank[b.file] ?? ''} onChange={(e) => setChosenBank((c) => ({ ...c, [b.file]: e.target.value as FdBank }))} aria-label={`Bank of ${b.name}`}>
                <option value="" disabled>
                  Choose…
                </option>
                {FD_BANKS.map((bank) => (
                  <option key={bank}>{bank}</option>
                ))}
              </select>
            </label>
          ))}
          <ul className="fd-import-list">
            {entries.map(({ key, bank, fd }) => {
              const match = matchOf(key)
              return (
                <li key={key} className={skipped.has(key) ? 'off' : ''}>
                  <label>
                    <input type="checkbox" checked={!skipped.has(key)} onChange={() => setSkipped((s) => toggle(s, key))} aria-label={`Import FD of ${formatINR(fd.principal)}`} />
                    <span>
                      {bank ?? 'Bank?'} · {formatINR(fd.principal)} at {fd.rate}%
                      <span className="chip-sub">
                        {formatDate(fd.startDate)} → {formatDate(fd.maturityDate)}
                        {fd.maturityAmount !== null && ` · ${formatINR(fd.maturityAmount)} at maturity`}
                        {fd.startEstimated && ' · start date worked out from the amounts, so check it'}
                      </span>
                      {paysOutInterest(fd) && <span className="fd-import-warn">Interest is paid out, but Stash counts it as reinvested, so this FD's value will read high.</span>}
                      {maturityMismatch(fd) && <span className="fd-import-warn">The maturity amount doesn't match Stash's sum for this amount, rate and dates. Check them after importing.</span>}
                    </span>
                  </label>
                  <span className={`tag ${match ? 'ok' : 'neutral'}`}>{match ? 'Updates your FD' : 'New'}</span>
                </li>
              )
            })}
          </ul>
          {incomplete > 0 && (
            <p className="fd-import-warn">
              {plural(incomplete, 'FD')} in the files couldn't be read fully and {incomplete === 1 ? 'is' : 'are'} left out: the summary has no start dates, and an FD that pays out its
              interest has no maturity amount to work one out from. Add {incomplete === 1 ? 'it' : 'them'} by hand, and untick {incomplete === 1 ? 'its' : 'their'} removal below if{' '}
              {incomplete === 1 ? "it's" : "they're"} already in Stash.
            </p>
          )}
          {missing.length > 0 && (
            <>
              <p className="fd-import-sub">
                Not in these files, so removed to match them. Untick any you want to keep, for example if its advice wasn't selected:
              </p>
              <ul className="fd-import-list">
                {missing.map((f) => (
                  <li key={f.id} className={kept.has(f.id) ? 'off' : ''}>
                    <label>
                      <input type="checkbox" checked={!kept.has(f.id)} onChange={() => setKept((s) => toggle(s, f.id))} aria-label={`Remove ${f.bank} FD of ${formatINR(f.principal)}`} />
                      <span>
                        {f.bank} · {formatINR(f.principal)} at {f.rate}%
                        <span className="chip-sub">
                          {formatDate(f.startDate)} → {formatDate(f.maturityDate)}
                        </span>
                      </span>
                    </label>
                    <span className={`tag ${kept.has(f.id) ? 'neutral' : 'over'}`}>{kept.has(f.id) ? 'Keep' : 'Remove'}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {unread.length > 0 && <p className="muted small">No FDs found in {unread.map((u) => u.name).join(', ')}.</p>}
          <p className="muted small">
            Select all of a bank's advices at once, or its FD summary: its FDs that aren't in the files are removed. FDs at other banks stay as they are. Updated FDs keep their
            emergency fund switch.{desktop && ' Stash backs up your data before importing.'}
          </p>
          <div className="row">
            <button className="primary" onClick={apply} disabled={!ready || (chosen.length === 0 && removing.length === 0)}>
              Import {plural(chosen.length, 'FD')}
              {removing.length > 0 && `, remove ${removing.length}`}
            </button>
            <button onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      {!found && !askPassword && unread.length > 0 && (
        <p className="muted">
          No FDs found in {unread.map((u) => u.name).join(', ')}. Stash reads FD advices, e-receipts and FD summaries from HDFC Bank, SBI and ICICI Bank; if this is one,
          it doesn't understand its layout yet.
        </p>
      )}
      {message && <p className="muted">{message}</p>}
      {outlines.map((o) => (
        <details key={o.name} className="guide cas-outline">
          <summary>
            {found ? 'Numbers look wrong? Copy' : 'Help fix this: copy'} a privacy-safe outline of {o.name}
          </summary>
          <p className="muted small">
            This shows the document's layout from its first line about deposits. Every number is replaced by 0, and every word other than common banking words by x, so
            your name, address and IDs don't show. Check it below, then copy and share it so the reader can be fixed.
          </p>
          <textarea readOnly value={o.outline} rows={10} aria-label={`Outline of ${o.name}`} />
          <div className="row">
            <button
              onClick={async () => {
                await copyText(o.outline)
                setCopied(o.name)
              }}
            >
              {copied === o.name ? 'Copied' : 'Copy outline'}
            </button>
          </div>
        </details>
      ))}
    </div>
  )
}
