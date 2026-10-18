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

## Desktop app

The desktop app (Electron) saves every change straight to a JSON file on your computer, by default `Documents/Stash/stash-data.json`, instead of browser storage. Settings → Data file shows the path and lets you move it or open another file.

```sh
npm run desktop     # build and run the desktop app
npm run dist:linux  # release/Stash-<version>.AppImage
npm run dist:win    # release/Stash Setup <version>.exe and a portable .exe (on Linux this needs Wine)
npm run dist:mac    # release/Stash-<version>.dmg (run on a Mac)
```

Builds are unsigned, so Windows SmartScreen and macOS Gatekeeper warn on first launch ("More info → Run anyway" on Windows; on macOS, System Settings → Privacy & Security → Open Anyway).

## Offline use

`npm run build` produces `Stash.html`: a single self-contained file with all code, styles and fonts inlined. Open it by double-clicking; it needs no server and no internet. Data lives in that browser's localStorage, so keep using the same browser and use Settings → Export JSON for backups.

The advisor gives general, rule-based guidance, not personalised financial advice.
