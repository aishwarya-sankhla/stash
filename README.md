# Stash — personal finance tracker & investment advisor

A React + TypeScript app for tracking income, expenses, budgets and investments (in ₹), with a rule-based advisor.

- **Dashboard** — monthly income/expenses, savings rate, spending by category, 6-month trend.
- **Transactions** — add, search and delete income/expenses.
- **Budgets** — monthly limits per expense category with progress bars.
- **Investments** — holdings by asset class, returns, asset mix. Cash holdings count as your emergency fund.
- **Advisor** — prioritised recommendations and a monthly plan (emergency fund → high-interest debt → investments split by an age/risk-based equity/debt/gold target). Logic lives in `src/advisor.ts`.
- **Settings** — profile used by the advisor, JSON export/import, sample data.

Data is stored in the browser's localStorage; nothing is sent to a server.

```sh
npm install
npm run dev      # start the dev server
npm test         # advisor unit tests
npm run build    # typecheck + production build
```

In an Amp orb, `amp orb services ensure` starts the app from `.amp/services.yaml` and prints a portal URL.

The advisor gives general, rule-based guidance, not personalised financial advice.
