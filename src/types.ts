export type TxType = 'income' | 'expense'

export interface Transaction {
  id: string
  date: string // YYYY-MM-DD
  type: TxType
  category: string
  amount: number
  note: string
}

export type AssetClass = 'equity' | 'debt' | 'gold' | 'cash' | 'realEstate' | 'other'

/** A fixed monthly investment, added to the holding automatically on `day` of each month. */
export interface Sip {
  amount: number
  day: number // 1–28
  lastApplied: string // YYYY-MM of the latest instalment already included in the holding
}

/** Money put into (+) or taken out of (−) a holding on a date, used to work out its yearly return (XIRR). */
export interface Flow {
  date: string // YYYY-MM-DD
  amount: number
}

export interface Holding {
  id: string
  name: string
  assetClass: AssetClass
  invested: number
  currentValue: number
  /** When the user last entered the current value (YYYY-MM-DD). */
  valueUpdated?: string
  sip?: Sip
  /** Set when the holding was imported from a CAS statement, so later imports update it. */
  isin?: string
  /**
   * Dated money in and out, oldest first. When Stash doesn't know a holding's history, the first entry is
   * its value on the day tracking started, so returns are measured from then.
   */
  flows?: Flow[]
  /** Set aside as emergency money: counts towards the emergency fund instead of the long-term mix. Cash always counts. */
  emergency?: boolean
  /** The section it's listed under on the Investments tab. Unset means guessed from its name and type. */
  group?: HoldingGroup
}

export type HoldingGroup = 'mf' | 'nps' | 'pf' | 'stocks' | 'gold' | 'cash' | 'property' | 'other'
/** Sections of the holdings list, in display order. */
export const HOLDING_GROUP_LABELS: Record<HoldingGroup, string> = {
  mf: 'Mutual funds',
  nps: 'NPS',
  pf: 'PF & PPF',
  stocks: 'Stocks',
  gold: 'Gold',
  cash: 'Bank & cash',
  property: 'Property',
  other: 'Other',
}

/** A cumulative bank fixed deposit: interest is reinvested and paid out at maturity. */
export interface FixedDeposit {
  id: string
  bank: string
  principal: number
  rate: number // % per year
  startDate: string // YYYY-MM-DD
  maturityDate: string // YYYY-MM-DD
  /** Set aside as emergency money: counts towards the emergency fund instead of the long-term mix. */
  emergency?: boolean
}

export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive'

export interface Profile {
  age: number
  riskTolerance: RiskTolerance
  dependents: number
  highInterestDebt: number // credit cards, personal loans, etc.
  hasHealthInsurance: boolean
  hasTermInsurance: boolean
  retirementAge: number
  /** Income-tax slab rate in % (0–30), for after-tax comparisons. */
  taxSlab: number
  /** True once the user has edited or confirmed their profile; until then the advisor runs on defaults. */
  confirmed: boolean
}

/** Net worth as it stood at the end of a month (or so far, for the current month). */
export interface NetWorthSnapshot {
  month: string // YYYY-MM
  total: number
  byClass: Record<AssetClass, number>
}

/** Money set aside for a dated target, such as a car or a wedding, funded by the linked holdings. */
export interface Goal {
  id: string
  name: string
  target: number
  targetDate: string // YYYY-MM
  holdingIds: string[]
}

export interface AppData {
  transactions: Transaction[]
  budgets: Record<string, number> // expense category -> monthly limit
  holdings: Holding[]
  fds: FixedDeposit[]
  /** One snapshot per month, oldest first, recorded automatically whenever the data changes. */
  netWorth: NetWorthSnapshot[]
  goals: Goal[]
  profile: Profile
}

export const EXPENSE_CATEGORIES = [
  'Rent',
  'Groceries',
  'Dining',
  'Ordering in',
  'Transport',
  'Utilities',
  'Shopping',
  'Health',
  'Entertainment',
  'Education',
  'EMI / Loans',
  'Travel',
  'Other',
]
/** Fixed bills paid in full once a month: a budget for them flags a change in the amount, not "nearly spent". */
export const FIXED_CATEGORIES = ['Rent', 'EMI / Loans']

export const INCOME_CATEGORIES = ['Salary', 'Business', 'Freelance', 'Interest / Dividends', 'Rental', 'Other']

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  equity: 'Equity (stocks, equity MFs)',
  debt: 'Debt (PPF, EPF, bonds, debt MFs)',
  gold: 'Gold (SGB, gold ETFs)',
  cash: 'Cash (savings, liquid funds)',
  realEstate: 'Real estate',
  other: 'Other',
}

export const DEFAULT_DATA: AppData = {
  transactions: [],
  budgets: {},
  holdings: [],
  fds: [],
  netWorth: [],
  goals: [],
  profile: {
    age: 30,
    riskTolerance: 'moderate',
    dependents: 0,
    highInterestDebt: 0,
    hasHealthInsurance: false,
    hasTermInsurance: false,
    retirementAge: 60,
    taxSlab: 30,
    confirmed: false,
  },
}
