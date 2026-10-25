import confetti from 'canvas-confetti'
import {
  Briefcase,
  Building2,
  Car,
  Coins,
  Film,
  GraduationCap,
  HeartPulse,
  Home,
  Pizza,
  KeyRound,
  Landmark,
  Laptop,
  Package,
  Plane,
  Shapes,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Sprout,
  Store,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { formatINR } from '../format'
import type { AssetClass } from '../types'

/* ---------- Palette ---------- */

export type Tint = 'lilac' | 'mint' | 'peach' | 'sky' | 'butter' | 'rose' | 'lime' | 'stone'

/** Soft tile background, readable foreground, and a chart-strength swatch for each tint. */
export const TINTS: Record<Tint, { bg: string; fg: string; chart: string }> = {
  lilac: { bg: '#EEEAFF', fg: '#5B45E0', chart: '#A797FF' },
  mint: { bg: '#E2F6EC', fg: '#1D7F55', chart: '#7DD8AE' },
  peach: { bg: '#FFEDE3', fg: '#B94E1C', chart: '#FFAC85' },
  sky: { bg: '#E3F1FF', fg: '#1E68AE', chart: '#8CC6FF' },
  butter: { bg: '#FFF4CC', fg: '#8F6B00', chart: '#FFD45A' },
  rose: { bg: '#FFE7ED', fg: '#B92F55', chart: '#FF97AE' },
  lime: { bg: '#F0FAD0', fg: '#4A6500', chart: '#C6EB4E' },
  stone: { bg: '#F0ECE5', fg: '#5E5869', chart: '#CFC7BA' },
}

/** Distinct chart colours, in order, for ranked series such as the spending donut. */
export const CHART_COLORS = (['lilac', 'peach', 'mint', 'sky', 'butter', 'rose', 'lime', 'stone'] as Tint[]).map((t) => TINTS[t].chart)

const CATEGORY_STYLE: Record<string, [LucideIcon, Tint]> = {
  Rent: [Home, 'lilac'],
  Groceries: [ShoppingCart, 'mint'],
  Dining: [UtensilsCrossed, 'peach'],
  'Ordering in': [Pizza, 'butter'],
  Transport: [Car, 'sky'],
  Utilities: [Zap, 'butter'],
  Shopping: [ShoppingBag, 'rose'],
  Health: [HeartPulse, 'rose'],
  Entertainment: [Film, 'lilac'],
  Education: [GraduationCap, 'sky'],
  'EMI / Loans': [Landmark, 'butter'],
  Travel: [Plane, 'sky'],
  Other: [Package, 'stone'],
  Salary: [Briefcase, 'lime'],
  Business: [Store, 'lime'],
  Freelance: [Laptop, 'lime'],
  'Interest / Dividends': [Sprout, 'lime'],
  Rental: [KeyRound, 'lime'],
}

export const ASSET_STYLE: Record<AssetClass, [LucideIcon, Tint]> = {
  equity: [TrendingUp, 'lilac'],
  debt: [Shield, 'sky'],
  gold: [Coins, 'butter'],
  cash: [Wallet, 'mint'],
  realEstate: [Building2, 'peach'],
  other: [Shapes, 'stone'],
}

/* ---------- Primitives ---------- */

export function IconTile({ icon: Icon, tint, size = 'md' }: { icon: LucideIcon; tint: Tint; size?: 'sm' | 'md' }) {
  const t = TINTS[tint]
  return (
    <span className={`icon-tile ${size}`} style={{ background: t.bg, color: t.fg }}>
      <Icon size={size === 'sm' ? 15 : 18} strokeWidth={2.2} />
    </span>
  )
}

export function CategoryChip({ category, sub }: { category: string; sub?: string }) {
  const [icon, tint] = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.Other
  return (
    <span className="chip">
      <IconTile icon={icon} tint={tint} size="sm" />
      <span>
        {category}
        {sub && <span className="chip-sub">{sub}</span>}
      </span>
    </span>
  )
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
      </div>
      {children && <div className="row">{children}</div>}
    </header>
  )
}

export function Stat({
  label,
  value,
  icon,
  tint,
  tone,
  children,
}: {
  label: string
  value: string
  icon: LucideIcon
  tint: Tint
  tone?: 'pos' | 'neg'
  children?: ReactNode
}) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <IconTile icon={icon} tint={tint} size="sm" />
      </div>
      <div className={`stat-value ${tone ?? ''}`}>{value}</div>
      {children}
    </div>
  )
}

/** Shows a formatted ₹ amount; edits as a plain number and commits on blur or Enter. */
export function MoneyInput({ value, onCommit, label }: { value: number; onCommit: (n: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className="money-input"
      inputMode="decimal"
      aria-label={label}
      title="Click to edit"
      value={draft ?? formatINR(value)}
      onFocus={(e) => {
        setDraft(String(value))
        requestAnimationFrame(() => e.target.select())
      }}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
      onBlur={() => {
        if (draft !== null) onCommit(Number(draft) || 0)
        setDraft(null)
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (month: string) => void }) {
  return <input className="month" type="month" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
}

export function Progress({ fraction }: { fraction: number }) {
  const tone = fraction > 1 ? 'over' : fraction >= 0.8 ? 'near' : 'ok'
  return (
    <div className="progress">
      <div className={`progress-bar ${tone}`} style={{ width: `${Math.min(100, fraction * 100)}%` }} />
    </div>
  )
}

/** Circular progress ring; `fraction` is clamped to 0–1. */
export function Ring({ fraction, size = 132, stroke = 12, children }: { fraction: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const f = Math.max(0, Math.min(1, fraction))
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--lime)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * f} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  )
}

export function celebrate() {
  confetti({ particleCount: 110, spread: 70, origin: { y: 0.25 }, colors: ['#D4F36B', '#A797FF', '#FFAC85', '#7DD8AE', '#FFD45A'] })
}
