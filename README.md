# Stash — personal finance tracker & investment advisor

An offline app for tracking income, expenses, budgets and investments (in ₹), with a rule-based advisor. Your data stays in a file on your own computer: nothing is sent anywhere, and the app works without internet.

## Contents

- [What Stash does](#what-stash-does)
- [Install](#install)
  - [Mac](#mac)
  - [Windows](#windows)
  - [Linux](#linux)
  - [Where your data lives](#where-your-data-lives)
- [Other ways to install](#other-ways-to-install)
  - [Build it yourself on a Mac](#build-it-yourself-on-a-mac)
  - [Browser version (no install)](#browser-version-no-install)
- [Log expenses on your iPhone](#log-expenses-on-your-iphone)
  - [Shortcut 1: Add expense](#shortcut-1-add-expense)
  - [Shortcut 2: Send expenses](#shortcut-2-send-expenses)
  - [Import into Stash](#import-into-stash)
- [Development](#development)
  - [Desktop builds](#desktop-builds)

## What Stash does

- **Overview**: money in and out, savings rate, saving streak, net worth over time, spending by category, six-month trend.
- **Transactions**: add, search and delete income and expenses, or import expenses logged on an iPhone.
- **Budgets**: monthly limits per expense category.
- **Investments**: holdings by asset class with returns, monthly SIPs and top-ups applied automatically, fixed deposits with maturity tracking, asset mix.
- **Advisor**: prioritised recommendations and a monthly plan (emergency fund → high-interest debt → investments split by an age- and risk-based equity/debt/gold target). The logic is in `src/advisor.ts`.
- **Settings**: your profile for the advisor, the data file location, iPhone import, export/import and sample data.

The advisor gives general, rule-based guidance, not personalised financial advice.

## Install

Download the latest build from this repository's **[Releases](https://github.com/aishwarya-sankhla/stash/releases)** page.

| File | For |
|---|---|
| `Stash-<version>-mac-AppleSilicon.zip` | Mac with an M1, M2, M3 or M4 chip |
| `Stash-<version>-mac-Intel.zip` | Mac with an Intel processor |
| `Stash-Setup-<version>.exe` | Windows installer |
| `Stash-<version>-portable.exe` | Windows, runs without installing |
| `Stash-<version>.AppImage` | Linux |
| `SHA256SUMS.txt` | Checksums to verify the downloads |

Not sure which Mac you have? Apple menu → **About This Mac**: "Chip: Apple M…" means Apple Silicon; "Processor: Intel" means Intel.

### Mac

1. Download the zip for your Mac and double-click it to unzip.
2. Drag **Stash** into your **Applications** folder.
3. Open **Terminal** and run this once (the app isn't signed with an Apple developer certificate, so macOS blocks it until you clear the download flag):
   ```sh
   xattr -cr /Applications/Stash.app
   ```
4. Open Stash from Applications.

**To update:** download the new zip, unzip it, drag Stash into Applications and choose **Replace**, then run the `xattr` command again. Your data carries over.

### Windows

Run `Stash-Setup-<version>.exe`. Windows shows "Windows protected your PC" because the app is unsigned: click **More info → Run anyway**. The portable `.exe` runs without installing.

### Linux

Make the AppImage executable (`chmod +x Stash-*.AppImage`) and run it.

### Where your data lives

Every change is saved straight away to `Documents/Stash/stash-data.json` (on Linux without a Documents folder, `~/Stash/stash-data.json`). **Settings → Data file** shows the path and lets you move it or open another file. Back it up like any other file. Updating or replacing the app never touches it.

## Other ways to install

[Releases](#install) is the easiest way. These are the alternatives.

### Build it yourself on a Mac

Build the app from this repository's code instead of downloading it. You need **Node.js**: if Terminal says `command not found: npm`, install the LTS version from [nodejs.org](https://nodejs.org) first.

1. Get the code: on this repository's page, click **Code → Download ZIP** and unzip it, or run `git clone https://github.com/aishwarya-sankhla/stash.git`.
2. In Terminal, go into that folder and run:
   ```sh
   npm install
   npm run dist:mac
   ```
3. The finished app appears in the `release` folder. Drag **Stash** into Applications. An app built on your own Mac usually doesn't need the `xattr` step from the [Mac](#mac) instructions; run it if macOS refuses to open the app.

The first build takes about 5 minutes. After an update, download the code again and repeat steps 2–3.

To try it without packaging, run `npm install` and then `npm run desktop`. Stash opens straight from the code, but only while Terminal stays open.

### Browser version (no install)

`Stash.html` is attached to each release. Download it and double-click to open it in your browser. It runs offline with no server or internet.

- Your data is stored **inside that browser**, not in `stash-data.json`. Clearing browser data can wipe it, and it doesn't share data with the desktop app.
- Use the same browser each time, and back up with **Settings → Export JSON**.
- It's good for trying Stash out; use the desktop app for your main copy.

## Log expenses on your iPhone

Log spending on your phone with a Shortcut, AirDrop the file to your Mac, and import it into Stash. No internet is needed, and Stash shows a preview before adding anything and skips entries it has already imported.

Each expense is saved as one line in a text file called `Stash expenses.txt`:

```
2026-10-25 14:03:22 | 250 | Groceries | Milk and bread
```

### Shortcut 1: Add expense

Set this up once. Open the **Shortcuts** app → **+** → rename it **Add expense**. Add these actions in order, using **Search for actions** at the bottom:

1. **Ask for Input**: change *Text* to **Number**; prompt `Amount (₹)`.
2. **Set Variable**: name `Amount` (it should say *to Provided Input*).
3. **List**: replace the sample items with these categories, spelled exactly like this (put your most-used ones first):
   `Rent`, `Groceries`, `Dining`, `Ordering in`, `Transport`, `Utilities`, `Shopping`, `Health`, `Entertainment`, `Education`, `EMI / Loans`, `Travel`, `Other`.
   Anything else imports as *Other*, with its name kept in the note.
4. **Choose from List**: tap **Show More** → prompt `Category`.
5. **Set Variable**: name `Category` (set to the item chosen in the list).
6. **Ask for Input**: leave it as *Text*; prompt `Note`.
7. **Set Variable**: name `Note`.
8. **Text**: build this line, typing the ` | ` separators yourself and inserting the variables from the strip above the keyboard (swipe it, or tap **Variables**):
   `Current Date | Amount | Category | Note`
   Then tap the **Current Date** bubble → **Date Format** → **Custom** → `yyyy-MM-dd HH:mm:ss`. Don't use ISO 8601 or another preset.
   *If you can't find Current Date:* add a **Date** action and a **Format Date** action (Custom, `yyyy-MM-dd HH:mm:ss`) before the Text action, and insert **Formatted Date** instead.
9. **Append to Text File**: append *Text*; file path `Stash expenses.txt`. Under **Show More**, keep **Make New Line** on. The file is saved in the **Shortcuts** folder in Files.
10. Optional: **Show Notification**: replace the *Appended File* bubble with `Spent ₹` + **Amount** + ` on ` + **Category**; under Show More, set **Title** to `Expense logged`.

Tap **Done**. Then long-press the shortcut → **Share** (or **Details**) → **Add to Home Screen**. Other quick ways to run it: say "Hey Siri, Add expense", **Back Tap** (Settings → Accessibility → Touch), or the **Action button** on newer iPhones.

**Check it works:** run it once, then open **Files** and search for `Stash expenses`. You should see a line like the example above.

**Privacy:** check where the file is. In **On My iPhone → Shortcuts**, it stays on your phone. In **iCloud Drive → Shortcuts**, it syncs to iCloud. To keep it on the phone, turn off iCloud Drive for the Shortcuts app (Settings → your name → iCloud → iCloud Drive). Otherwise, turn on **Advanced Data Protection** so iCloud Drive is end-to-end encrypted. Also set AirDrop to **Contacts Only** and keep a passcode on your phone.

### Shortcut 2: Send expenses

This sends the file to your Mac with one tap. Shortcuts → **+** → rename it **Send expenses**, then add:

1. **Get File from Folder**: file path `Stash expenses.txt`, from the **Shortcuts** folder. Under Show More, keep **Error If Not Found** on.
2. **AirDrop**: it should read *AirDrop File*.
3. **Delete Files**: under Show More, turn **Confirm Before Deleting** on.

Add it to your Home Screen too.

### Import into Stash

Do this weekly, or whenever you like.

1. Tap **Send expenses** on your iPhone and choose your Mac. Only tap **Delete** when it asks if the Mac received the file (it lands in **Downloads**).
2. In Stash: **Settings → Expenses from your iPhone → Import iPhone expenses…** and choose the file. The name may end in a number, such as `Stash expenses 2.txt`; that's fine.
3. Review the preview and click **Add**. Lines that couldn't be read are listed and skipped.
4. Click **Move the file to Trash**.

If you forget to delete the file on the phone, send it again next time: Stash recognises entries it has already imported and skips them.

## Development

React 19 + TypeScript + Vite, with Electron for the desktop app.

```sh
npm install
npm run dev      # start the dev server
npm test         # unit tests
npm run build    # typecheck + build; also writes Stash.html (see Browser version above)
```

In an Amp orb, `amp orb services ensure` starts the app from `.amp/services.yaml` and prints a portal URL.

### Desktop builds

```sh
npm run desktop     # build and run the desktop app
npm run dist:linux  # release/Stash-<version>.AppImage
npm run dist:win    # release/Stash Setup <version>.exe and a portable .exe (on Linux this needs Wine)
npm run dist:mac    # release/Stash-<version>.dmg (run on a Mac)
```

To build the Mac app on Linux instead: `npm run build && npx electron-builder --mac dir --arm64 --x64`, then ad-hoc sign each `Stash.app` with [rcodesign](https://github.com/indygreg/apple-platform-rs) (`rcodesign sign release/mac-arm64/Stash.app`) and zip it with `zip -ry` to keep symlinks. Apple Silicon Macs won't run an unsigned app.
