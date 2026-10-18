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

export interface Holding {
  id: string
  name: string
  assetClass: AssetClass
  invested: number
  currentValue: number
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

export interface AppData {
  transactions: Transaction[]
  budgets: Record<string, number> // expense category -> monthly limit
  holdings: Holding[]
  profile: Profile
}

export const EXPENSE_CATEGORIES = [
  'Rent',
  'Groceries',
  'Dining',
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
  debt: 'Debt (FDs, PPF, EPF, bonds, debt MFs)',
  gold: 'Gold (SGB, gold ETFs)',
  cash: 'Cash (savings, liquid funds)',
  realEstate: 'Real estate',
  other: 'Other',
}

export const DEFAULT_DATA: AppData = {
  transactions: [],
  budgets: {},
  holdings: [],
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
