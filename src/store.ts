import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { applySips, isoDate, recordNetWorth } from './finance'
import { newId } from './format'
import {
  ASSET_CLASS_LABELS,
  DEFAULT_DATA,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type AppData,
  type AssetClass,
  type Holding,
  type FixedDeposit,
  type NetWorthSnapshot,
  type Profile,
  type Sip,
  type Transaction,
} from './types'

export type SetData = Dispatch<SetStateAction<AppData>>

const STORAGE_KEY = 'finance-tracker:v1'

/** File storage provided by the desktop app's preload script (electron/preload.cjs). Absent in the browser. */
interface StashDesktop {
  load(): { path: string; json: string | null }
  save(json: string): Promise<void>
  moveTo(json: string): Promise<string | null>
  openFile(): Promise<{ path: string; json: string } | null>
  reveal(): Promise<void>
}
export const desktop = (globalThis as { stashDesktop?: StashDesktop }).stashDesktop

/** Path of the desktop data file currently being written to. */
export let desktopDataPath = ''

/** Desktop only: save the current data to a new location and keep saving there. */
export async function moveDataFile(data: AppData) {
  const path = await desktop!.moveTo(serialize(data))
  if (path) desktopDataPath = path
  return path
}

/** Desktop only: switch to another existing data file and return its contents. */
export async function openDataFile() {
  const result = await desktop!.openFile()
  if (!result) return null
  desktopDataPath = result.path
  return { path: result.path, data: parseData(result.json) }
}

type Json = Record<string, unknown>
const STASH_KEYS = ['transactions', 'holdings', 'fds', 'budgets', 'profile', 'netWorth']
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const list = (v: unknown) => (Array.isArray(v) ? v : [])
const finite = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const text = (v: unknown) => (typeof v === 'string' ? v : '')
const DATE = /^\d{4}-\d{2}-\d{2}$/

function toTransaction(v: unknown): Transaction | null {
  if (!isObject(v)) return null
  const amount = finite(v.amount)
  const type = v.type === 'income' || v.type === 'expense' ? v.type : null
  const date = text(v.date)
  if (!type || amount === null || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const known = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const category = known.includes(text(v.category)) ? text(v.category) : 'Other'
  return { id: text(v.id) || newId(), date, type, category, amount, note: text(v.note) }
}

function toHolding(v: unknown): Holding | null {
  if (!isObject(v)) return null
  const invested = finite(v.invested)
  const currentValue = finite(v.currentValue)
  const assetClass = text(v.assetClass)
  if (!text(v.name) || invested === null || invested < 0 || currentValue === null || currentValue < 0) return null
  if (!Object.hasOwn(ASSET_CLASS_LABELS, assetClass)) return null
  const holding: Holding = { id: text(v.id) || newId(), name: text(v.name), assetClass: assetClass as AssetClass, invested, currentValue }
  if (DATE.test(text(v.valueUpdated))) holding.valueUpdated = text(v.valueUpdated)
  const sip = toSip(v.sip)
  if (sip) holding.sip = sip
  return holding
}

function toSip(v: unknown): Sip | null {
  if (!isObject(v)) return null
  const amount = finite(v.amount)
  const day = finite(v.day)
  const lastApplied = text(v.lastApplied)
  if (amount === null || amount <= 0 || day === null || !Number.isInteger(day) || day < 1 || day > 28) return null
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(lastApplied)) return null
  return { amount, day, lastApplied }
}

function toFixedDeposit(v: unknown): FixedDeposit | null {
  if (!isObject(v)) return null
  const principal = finite(v.principal)
  const rate = finite(v.rate)
  const startDate = text(v.startDate)
  const maturityDate = text(v.maturityDate)
  if (!text(v.bank) || principal === null || principal <= 0 || rate === null || rate < 0 || rate > 50) return null
  if (!DATE.test(startDate) || !DATE.test(maturityDate) || maturityDate <= startDate) return null
  return { id: text(v.id) || newId(), bank: text(v.bank), principal, rate, startDate, maturityDate }
}

function toSnapshot(v: unknown): NetWorthSnapshot | null {
  if (!isObject(v) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(text(v.month))) return null
  const raw = isObject(v.byClass) ? v.byClass : {}
  const byClass = Object.fromEntries(
    Object.keys(ASSET_CLASS_LABELS).map((k) => [k, finite(raw[k]) !== null && (raw[k] as number) >= 0 ? (raw[k] as number) : 0]),
  ) as Record<AssetClass, number>
  return { month: text(v.month), total: Object.values(byClass).reduce((s, n) => s + n, 0), byClass }
}

/** Valid snapshots, one per month (the last one wins), oldest first. */
function toNetWorth(v: unknown): NetWorthSnapshot[] {
  const byMonth = new Map<string, NetWorthSnapshot>()
  for (const snapshot of list(v).map(toSnapshot)) if (snapshot) byMonth.set(snapshot.month, snapshot)
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month))
}

function toProfile(v: unknown): Profile {
  const p = isObject(v) ? v : {}
  const d = DEFAULT_DATA.profile
  const nonNegative = (x: unknown, fallback: number) => (finite(x) !== null && (x as number) >= 0 ? (x as number) : fallback)
  return {
    age: finite(p.age) !== null && (p.age as number) >= 1 && (p.age as number) <= 120 ? (p.age as number) : d.age,
    riskTolerance: p.riskTolerance === 'conservative' || p.riskTolerance === 'aggressive' ? p.riskTolerance : 'moderate',
    dependents: nonNegative(p.dependents, d.dependents),
    highInterestDebt: nonNegative(p.highInterestDebt, d.highInterestDebt),
    hasHealthInsurance: p.hasHealthInsurance === true,
    hasTermInsurance: p.hasTermInsurance === true,
    confirmed: p.confirmed === true,
  }
}

/**
 * Parses saved or imported data, keeping only well-formed entries. Data files can be edited by hand or
 * crafted, so nothing here trusts their shape: bad entries are dropped instead of crashing the UI.
 */
export function parseData(json: string): AppData {
  const parsed: unknown = JSON.parse(json)
  if (!isObject(parsed) || !STASH_KEYS.some((k) => k in parsed)) throw new Error('Not Stash data')
  const budgets: Record<string, number> = {}
  if (isObject(parsed.budgets)) {
    for (const [category, limit] of Object.entries(parsed.budgets)) {
      const n = finite(limit)
      if (EXPENSE_CATEGORIES.includes(category) && n !== null && n > 0) budgets[category] = n
    }
  }
  return {
    transactions: list(parsed.transactions).map(toTransaction).filter((t) => t !== null),
    budgets,
    holdings: list(parsed.holdings).map(toHolding).filter((h) => h !== null),
    fds: list(parsed.fds).map(toFixedDeposit).filter((f) => f !== null),
    netWorth: toNetWorth(parsed.netWorth),
    profile: toProfile(parsed.profile),
  }
}

export const serialize = (data: AppData) => JSON.stringify(data, null, 2)

function load(): AppData {
  if (desktop) {
    const result = desktop.load()
    desktopDataPath = result.path
    return result.json ? applySips(parseData(result.json), isoDate()) : DEFAULT_DATA
  }
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return DEFAULT_DATA
  try {
    return applySips(parseData(raw), isoDate())
  } catch {
    return DEFAULT_DATA
  }
}

/** App state, saved on every change: to the data file in the desktop app, else to localStorage. */
export function useAppData() {
  const [data, setData] = useState<AppData>(load)
  useEffect(() => {
    // SIPs are applied on load; also catch instalments that fall due while the app stays open.
    const catchUp = () => setData((d) => applySips(d, isoDate()))
    window.addEventListener('focus', catchUp)
    return () => window.removeEventListener('focus', catchUp)
  }, [])
  useEffect(() => {
    // Keep this month's net worth snapshot current; a no-op when it already matches.
    const recorded = recordNetWorth(data, isoDate())
    if (recorded !== data) setData(recorded)
  }, [data])
  useEffect(() => {
    if (desktop) desktop.save(serialize(data)).catch((err) => alert(`Couldn't save your data file:\n${err}`))
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])
  return [data, setData] as const
}
