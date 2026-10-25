import { applySips, sipCoveredMonth } from './finance'
import { newId } from './format'
import type { AppData, Holding } from './types'

/**
 * Reads the text of a CAMS / KFintech Consolidated Account Statement (the detailed CAS you can request
 * free from either registrar). Each fund block names the scheme with its ISIN and ends with a line like:
 *   Closing Unit Balance: 657.390 NAV on 23-Oct-2026: INR 105.5560 Total Cost Value: 64,000.00 Market Value on 23-Oct-2026: INR 69,391.13
 */
export interface CasFund {
  name: string
  isin: string | null
  units: number
  navDate: string | null // YYYY-MM-DD
  /** Purchase cost of the units still held; null when the statement doesn't show it. */
  cost: number | null
  value: number
}

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
const DATE = String.raw`(\d{1,2}-[A-Za-z]{3}-\d{4})`
const AMOUNT = String.raw`(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)`

function toIso(date: string): string | null {
  const [d, mon, y] = date.split('-')
  const m = MONTHS[mon.toLowerCase()]
  return m ? `${y}-${m}-${d.padStart(2, '0')}` : null
}

const num = (s: string) => Number(s.replace(/,/g, ''))
const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places

/** "B205DGG-Axis Small Cap Fund - Direct Growth - " → "Axis Small Cap Fund - Direct Growth" */
function cleanName(text: string): string {
  return text
    .replace(/^[A-Z0-9]{3,12}-(?=\S)/, '') // registrar's scheme code
    .replace(/\((?:Non-Demat|Demat)\)/gi, '')
    .replace(/\(formerly[^)]*\)/gi, '')
    .replace(/\(Advisor\s*:[^)]*\)/gi, '')
    .replace(/Registrar\s*:.*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s-]+$/, '')
    .trim()
}

export function parseCasText(lines: string[]): CasFund[] {
  const funds = new Map<string, CasFund>()
  let name = ''
  let isin: string | null = null
  lines.forEach((line, i) => {
    const isinMatch = /ISIN\s*:\s*(IN[A-Z0-9]{10})/i.exec(line)
    if (isinMatch) {
      isin = isinMatch[1].toUpperCase()
      // Long names wrap: the line before starts with the registrar's scheme code ("P8042-HDFC …").
      const prev = lines[i - 1] ?? ''
      const startsBefore = /^[A-Z0-9]{3,12}-\S/.test(prev) && !/ISIN|Closing\s+Unit/i.test(prev)
      name = cleanName(startsBefore ? `${prev} ${line.slice(0, isinMatch.index)}` : line.slice(0, isinMatch.index))
      return
    }
    if (!/Closing\s+Unit\s+Balance/i.test(line)) return
    // The closing figures sometimes wrap onto the next line or two.
    // Stop at the next fund so its figures are never mixed in.
    const block = [line]
    for (const next of lines.slice(i + 1, i + 3)) {
      if (/ISIN|Closing\s+Unit|Folio\s+No/i.test(next)) break
      block.push(next)
    }
    const text = block.join(' ')
    const units = num(/Closing\s+Unit\s+Balance\s*:?\s*([\d,]+(?:\.\d+)?)/i.exec(text)?.[1] ?? '0')
    const nav = new RegExp(String.raw`NAV\s+on\s+${DATE}\s*:?\s*${AMOUNT}`, 'i').exec(text)
    const market = new RegExp(String.raw`(?:Market\s+Value|Valuation)\s+on\s+${DATE}\s*:?\s*${AMOUNT}`, 'i').exec(text)
    const cost = new RegExp(String.raw`Cost\s+Value\s*:?\s*${AMOUNT}`, 'i').exec(text)
    const value = round(market ? num(market[2]) : nav ? units * num(nav[2]) : 0, 2)
    if (!name || !(units > 0) || !(value > 0)) return // fully redeemed folios show a zero balance
    const fund: CasFund = {
      name,
      isin,
      units,
      navDate: toIso(market?.[1] ?? nav?.[1] ?? '') ?? null,
      cost: cost ? num(cost[1]) : null,
      value,
    }
    // The same scheme held in several folios becomes one fund.
    const key = isin ?? name.toLowerCase()
    const prev = funds.get(key)
    funds.set(
      key,
      prev
        ? {
            ...prev,
            units: round(prev.units + fund.units, 4),
            value: round(prev.value + fund.value, 2),
            cost: prev.cost !== null && fund.cost !== null ? round(prev.cost + fund.cost, 2) : null,
            navDate: [prev.navDate, fund.navDate].filter(Boolean).sort().at(-1) ?? null,
          }
        : fund,
    )
  })
  return [...funds.values()]
}

const tokens = (name: string) =>
  new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t && !['fund', 'plan', 'option', 'scheme', 'the', 'of', 'and'].includes(t)),
  )

/** The existing holding a statement fund most likely is: same ISIN, else a close name match. */
export function matchHolding(fund: CasFund, holdings: Holding[]): Holding | null {
  if (fund.isin) {
    const byIsin = holdings.find((h) => h.isin === fund.isin)
    if (byIsin) return byIsin
  }
  // Direct and Regular plans of a fund are different schemes with different NAVs.
  const plan = (name: string) => (/\bdirect\b/i.test(name) ? 'direct' : /\bregular\b/i.test(name) ? 'regular' : null)
  const fundPlan = plan(fund.name)
  const a = tokens(fund.name)
  let best: Holding | null = null
  let bestScore = 0
  for (const h of holdings) {
    if (h.isin && fund.isin && h.isin !== fund.isin) continue
    const holdingPlan = plan(h.name)
    if (fundPlan && holdingPlan && fundPlan !== holdingPlan) continue
    const b = tokens(h.name)
    const shared = [...a].filter((t) => b.has(t)).length
    const score = shared / new Set([...a, ...b]).size
    if (score > bestScore) [best, bestScore] = [h, score]
  }
  return bestScore >= 0.5 ? best : null
}

/** A sensible starting asset class for a new fund, which the user can change before importing. */
export function guessAssetClass(name: string): Holding['assetClass'] {
  const n = name.toLowerCase()
  if (/gold|silver/.test(n)) return 'gold'
  if (/liquid|overnight|money market/.test(n)) return 'cash'
  if (/arbitrage/.test(n)) return 'debt' // behaves like debt, even though it's taxed as equity
  if (/equity|index|nifty|sensex|cap\b|flexi|elss|tax saver/.test(n)) return 'equity'
  if (/debt|bond|gilt|duration|income|corporate|banking & psu|banking and psu|credit|floater|treasury|savings fund|target maturity|psu/.test(n))
    return 'debt'
  return 'equity'
}

export type CasAction = { kind: 'update'; holdingId: string } | { kind: 'add'; assetClass: Holding['assetClass'] } | { kind: 'skip' }

/**
 * Applies the statement: updated holdings take the statement's cost, value and date; new ones are added.
 * SIPs restart from the statement date, so instalments Stash added after it are re-added on top of the
 * statement's value instead of being lost or counted twice.
 */
export function applyCasImport(data: AppData, choices: { fund: CasFund; action: CasAction }[], today: string): AppData {
  const updates = new Map<string, CasFund>()
  const added: Holding[] = []
  for (const { fund, action } of choices) {
    if (action.kind === 'update') {
      const prev = updates.get(action.holdingId)
      updates.set(
        action.holdingId,
        prev ? { ...prev, value: prev.value + fund.value, cost: prev.cost !== null && fund.cost !== null ? prev.cost + fund.cost : null } : fund,
      )
    } else if (action.kind === 'add') {
      added.push({
        id: newId(),
        name: fund.name,
        assetClass: action.assetClass,
        invested: fund.cost ?? fund.value,
        currentValue: fund.value,
        valueUpdated: fund.navDate ?? today,
        ...(fund.isin ? { isin: fund.isin } : {}),
      })
    }
  }
  const holdings = data.holdings.map((h) => {
    const fund = updates.get(h.id)
    if (!fund) return h
    const asOf = fund.navDate ?? today
    return {
      ...h,
      invested: fund.cost ?? h.invested,
      currentValue: fund.value,
      valueUpdated: asOf,
      ...(fund.isin ? { isin: fund.isin } : {}),
      ...(h.sip ? { sip: { ...h.sip, lastApplied: sipCoveredMonth(asOf, h.sip.day) } } : {}),
    }
  })
  return applySips({ ...data, holdings: [...holdings, ...added] }, today)
}
