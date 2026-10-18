import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { DEFAULT_DATA, type AppData } from './types'

export type SetData = Dispatch<SetStateAction<AppData>>

const STORAGE_KEY = 'finance-tracker:v1'

export function parseData(json: string): AppData {
  const parsed = JSON.parse(json) as Partial<AppData>
  return {
    transactions: parsed.transactions ?? [],
    budgets: parsed.budgets ?? {},
    holdings: parsed.holdings ?? [],
    profile: { ...DEFAULT_DATA.profile, ...parsed.profile },
  }
}

function load(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return DEFAULT_DATA
  try {
    return parseData(raw)
  } catch {
    return DEFAULT_DATA
  }
}

/** App state persisted to localStorage. */
export function useAppData() {
  const [data, setData] = useState<AppData>(load)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])
  return [data, setData] as const
}
