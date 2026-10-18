import { useState } from 'react'
import { Advisor } from './components/Advisor'
import { Budgets } from './components/Budgets'
import { Dashboard } from './components/Dashboard'
import { Investments } from './components/Investments'
import { Settings } from './components/Settings'
import { Transactions } from './components/Transactions'
import { monthKey } from './finance'
import { useAppData } from './store'

const TABS = ['Dashboard', 'Transactions', 'Budgets', 'Investments', 'Advisor', 'Settings'] as const
type Tab = (typeof TABS)[number]

export default function App() {
  const [data, setData] = useAppData()
  const [tab, setTab] = useState<Tab>('Dashboard')
  const currentMonth = monthKey(new Date())
  const isEmpty = data.transactions.length === 0 && data.holdings.length === 0

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">₹</span> Stash
          <span className="tagline">Finance tracker &amp; advisor</span>
        </div>
        <nav>
          {TABS.map((t) => (
            <button key={t} className={t === tab ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {isEmpty && tab !== 'Settings' && (
          <div className="banner">
            No data yet. Add transactions and investments, or{' '}
            <button className="link" onClick={() => setTab('Settings')}>
              load sample data
            </button>{' '}
            to explore.
          </div>
        )}
        {tab === 'Dashboard' && <Dashboard data={data} currentMonth={currentMonth} />}
        {tab === 'Transactions' && <Transactions data={data} setData={setData} />}
        {tab === 'Budgets' && <Budgets data={data} setData={setData} currentMonth={currentMonth} />}
        {tab === 'Investments' && <Investments data={data} setData={setData} />}
        {tab === 'Advisor' && <Advisor data={data} currentMonth={currentMonth} />}
        {tab === 'Settings' && <Settings data={data} setData={setData} />}
      </main>
    </div>
  )
}
