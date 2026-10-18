export const COLORS = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b', '#14b8a6', '#a855f7']

export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ?? ''}`}>{value}</div>
    </div>
  )
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (month: string) => void }) {
  return <input type="month" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
}

export function Progress({ fraction }: { fraction: number }) {
  const tone = fraction > 1 ? 'over' : fraction >= 0.8 ? 'near' : 'ok'
  return (
    <div className="progress">
      <div className={`progress-bar ${tone}`} style={{ width: `${Math.min(100, fraction * 100)}%` }} />
    </div>
  )
}
