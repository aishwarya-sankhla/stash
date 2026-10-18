import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { DEFAULT_DATA, type AppData } from './types'

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
export const desktop = (window as { stashDesktop?: StashDesktop }).stashDesktop

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

export function parseData(json: string): AppData {
  const parsed = JSON.parse(json) as Partial<AppData>
  return {
    transactions: parsed.transactions ?? [],
    budgets: parsed.budgets ?? {},
    holdings: parsed.holdings ?? [],
    profile: { ...DEFAULT_DATA.profile, ...parsed.profile },
  }
}

export const serialize = (data: AppData) => JSON.stringify(data, null, 2)

function load(): AppData {
  if (desktop) {
    const result = desktop.load()
    desktopDataPath = result.path
    return result.json ? parseData(result.json) : DEFAULT_DATA
  }
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return DEFAULT_DATA
  try {
    return parseData(raw)
  } catch {
    return DEFAULT_DATA
  }
}

/** App state, saved on every change: to the data file in the desktop app, else to localStorage. */
export function useAppData() {
  const [data, setData] = useState<AppData>(load)
  useEffect(() => {
    if (desktop) desktop.save(serialize(data)).catch((err) => alert(`Couldn't save your data file:\n${err}`))
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])
  return [data, setData] as const
}
