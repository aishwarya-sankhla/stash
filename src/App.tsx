import { ArrowLeftRight, LayoutGrid, LineChart, Settings as SettingsIcon, Sparkles, Target, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Advisor } from './components/Advisor'
import { Budgets } from './components/Budgets'
import { Dashboard } from './components/Dashboard'
import { Investments } from './components/Investments'
import { Settings } from './components/Settings'
import { Transactions } from './components/Transactions'
import { monthKey } from './finance'
import { sampleData } from './sampleData'
import { useAppData } from './store'

const TABS: { name: string; icon: LucideIcon }[] = [
  { name: 'Overview', icon: LayoutGrid },
  { name: 'Transactions', icon: ArrowLeftRight },
  { name: 'Budgets', icon: Target },
  { name: 'Investments', icon: LineChart },
  { name: 'Advisor', icon: Sparkles },
  { name: 'Settings', icon: SettingsIcon },
]

export default function App() {
  const [data, setData] = useAppData()
  const [tab, setTab] = useState('Overview')
  const currentMonth = monthKey(new Date())
  const isEmpty = data.transactions.length === 0 && data.holdings.length === 0 && data.fds.length === 0

  return (
    <div className="app">
      <header className="topbar">
        <div className="wordmark">
          stash<span className="dot">.</span>
        </div>
        <nav className="nav">
          {TABS.map(({ name, icon: Icon }) => (
            <button key={name} className={name === tab ? 'nav-item active' : 'nav-item'} onClick={() => setTab(name)}>
              <Icon size={16} strokeWidth={2.2} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
      </header>
      <main key={tab} className="page">
        {isEmpty && tab !== 'Settings' && (
          <div className="banner">
            <span>Your stash is empty. Add a few transactions and holdings, or explore with sample data.</span>
            <button className="primary" onClick={() => setData(sampleData())}>
              Load sample data
            </button>
          </div>
        )}
        {tab === 'Overview' && <Dashboard data={data} currentMonth={currentMonth} />}
        {tab === 'Transactions' && <Transactions data={data} setData={setData} />}
        {tab === 'Budgets' && <Budgets data={data} setData={setData} currentMonth={currentMonth} />}
        {tab === 'Investments' && <Investments data={data} setData={setData} />}
        {tab === 'Advisor' && <Advisor data={data} currentMonth={currentMonth} onSetupProfile={() => setTab('Settings')} />}
        {tab === 'Settings' && <Settings data={data} setData={setData} />}
      </main>
    </div>
  )
}
