const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export const formatINR = (n: number) => inr.format(Math.round(n))
export const formatPct = (fraction: number) => `${Math.round(fraction * 100)}%`

export function formatMonth(month: string) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

export const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export const newId = () => crypto.randomUUID()

/** Short rupee amounts for chart axes, in Indian units: ₹45k, ₹12.4L, ₹1.2Cr. */
export function formatCompactINR(n: number) {
  const trim = (x: number) => String(Number(x.toFixed(1)))
  if (Math.abs(n) >= 1e7) return `₹${trim(n / 1e7)}Cr`
  if (Math.abs(n) >= 1e5) return `₹${trim(n / 1e5)}L`
  if (Math.abs(n) >= 1e3) return `₹${Math.round(n / 1e3)}k`
  return `₹${Math.round(n)}`
}
