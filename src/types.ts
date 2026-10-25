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

export interface Holding {
  id: string
  name: string
  assetClass: AssetClass
  invested: number
  currentValue: number
  /** When the user last entered the current value (YYYY-MM-DD). */
  valueUpdated?: string
  sip?: Sip
}

/** A cumulative bank fixed deposit: interest is reinvested and paid out at maturity. */
export interface FixedDeposit {
  id: string
  bank: string
  principal: number
  rate: number // % per year
  startDate: string // YYYY-MM-DD
  maturityDate: string // YYYY-MM-DD
}

export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive'

export interface Profile {
  age: number
  riskTolerance: RiskTolerance
  dependents: number
  highInterestDebt: number // credit cards, personal loans, etc.
  hasHealthInsurance: boolean
  hasTermInsurance: boolean
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
    confirmed: false,
  },
}
