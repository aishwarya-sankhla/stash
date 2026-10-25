// Electron main process: hosts the Stash UI and stores its data in a JSON file on disk.
const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const configFile = () => path.join(app.getPath('userData'), 'config.json')
const defaultDataFile = () => path.join(app.getPath('documents'), 'Stash', 'stash-data.json')
const JSON_FILTER = [{ name: 'Stash data', extensions: ['json'] }]
const MAX_EXPENSES_BYTES = 1024 * 1024 // matches MAX_PHONE_FILE_BYTES in src/phoneImport.ts
const indexFile = path.join(__dirname, '..', 'dist', 'index.html')
const pageUrl = process.env.STASH_DEV_URL || pathToFileURL(indexFile).href

let win
let dataFile
let expensesFile = null // the iPhone expense file the user last picked; the only file the UI can ask to trash

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), 'utf8'))
  } catch {
    return {}
  }
}

function rememberDataFile(file) {
  dataFile = file
  fs.mkdirSync(path.dirname(configFile()), { recursive: true })
  fs.writeFileSync(configFile(), JSON.stringify({ ...readConfig(), dataFile: file }, null, 2))
}

/** Write to a temp file, then rename, so a crash mid-write never leaves a half-written data file. */
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, text, { mode: 0o600 }) // financial data: readable by this user only
  fs.renameSync(tmp, file)
}

const looksLikeStashData = (d) =>
  d !== null && typeof d === 'object' && !Array.isArray(d) && ['transactions', 'holdings', 'fds', 'budgets', 'profile', 'netWorth'].some((k) => k in d)

/** Returns the file's JSON text, or null if it doesn't exist. Throws if it exists but isn't Stash data. */
function readJson(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
  if (!looksLikeStashData(JSON.parse(text))) throw new Error('Not Stash data')
  return text
}

/** Only the Stash window's own page may use the file APIs (navigation away from it is blocked below). */
function fromStashPage(event) {
  return Boolean(win) && event.sender === win.webContents && event.senderFrame?.routingId === win.webContents.mainFrame.routingId
}

function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!fromStashPage(event)) throw new Error('Blocked IPC from unexpected sender')
    return fn(event, ...args)
  })
}

ipcMain.on('stash:load', (event) => {
  if (!fromStashPage(event)) {
    event.returnValue = { path: '', json: null }
    return
  }
  try {
    event.returnValue = { path: dataFile, json: readJson(dataFile) }
  } catch {
    // Keep the unreadable file instead of overwriting it with empty data.
    const kept = dataFile.replace(/\.json$/, '') + `.unreadable-${Date.now()}.json`
    try {
      fs.renameSync(dataFile, kept)
    } catch {}
    const warn = () =>
      dialog.showMessageBox(win, { type: 'warning', message: "Your data file couldn't be read, so Stash started fresh.", detail: `The old file was kept as:\n${kept}` })
    if (win.isVisible()) warn()
    else win.once('show', warn)
    event.returnValue = { path: dataFile, json: null }
  }
})

handle('stash:save', (_event, json) => writeAtomic(dataFile, String(json)))

handle('stash:moveTo', async (_event, json) => {
  const result = await dialog.showSaveDialog(win, { title: 'Move data file', defaultPath: dataFile, filters: JSON_FILTER })
  if (result.canceled || !result.filePath) return null
  writeAtomic(result.filePath, String(json))
  rememberDataFile(result.filePath)
  return dataFile
})

handle('stash:openFile', async () => {
  const result = await dialog.showOpenDialog(win, { title: 'Open data file', properties: ['openFile'], filters: JSON_FILTER })
  if (result.canceled || result.filePaths.length === 0) return null
  const file = result.filePaths[0]
  let json
  try {
    json = readJson(file)
  } catch {
    dialog.showErrorBox('Not a Stash data file', `${file} isn't a Stash data file, so Stash didn't open it.`)
    return null
  }
  rememberDataFile(file)
  return { path: file, json }
})

handle('stash:reveal', () => shell.showItemInFolder(dataFile))

handle('stash:pickExpenses', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Import iPhone expenses',
    defaultPath: app.getPath('downloads'),
    properties: ['openFile'],
    filters: [{ name: 'iPhone expenses', extensions: ['txt'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const file = result.filePaths[0]
  if (fs.statSync(file).size > MAX_EXPENSES_BYTES) {
    dialog.showErrorBox('File too large', `${path.basename(file)} is too large to be an iPhone expense file, so Stash didn't open it.`)
    return null
  }
  expensesFile = file
  return { name: path.basename(file), text: fs.readFileSync(file, 'utf8') }
})

// Takes no path from the UI: only the file the user just picked can be moved to the Trash.
handle('stash:trashExpenses', async () => {
  if (!expensesFile) return false
  const file = expensesFile
  expensesFile = null
  await shell.trashItem(file)
  return true
})

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: 'Stash',
    backgroundColor: '#f6f3ee',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  })
  win.once('ready-to-show', () => win.show())
  // The UI is a single local page; never navigate away or open other windows.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  win.loadURL(pageUrl)
}

// One window only, so two copies can't overwrite each other's saves.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  app.whenReady().then(() => {
    // Stash needs no camera, microphone, location, notifications, etc.
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)
    dataFile = readConfig().dataFile || defaultDataFile()
    createWindow()
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
  })
  app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
}
