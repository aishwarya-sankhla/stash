// Electron main process: hosts the Stash UI and stores its data in a JSON file on disk.
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const configFile = () => path.join(app.getPath('userData'), 'config.json')
const defaultDataFile = () => path.join(app.getPath('documents'), 'Stash', 'stash-data.json')
const JSON_FILTER = [{ name: 'Stash data', extensions: ['json'] }]

let win
let dataFile

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
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, file)
}

/** Returns the file's JSON text, or null if it doesn't exist. Throws if it exists but isn't valid JSON. */
function readJson(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
  JSON.parse(text)
  return text
}

ipcMain.on('stash:load', (event) => {
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

ipcMain.handle('stash:save', (_event, json) => writeAtomic(dataFile, json))

ipcMain.handle('stash:moveTo', async (_event, json) => {
  const result = await dialog.showSaveDialog(win, { title: 'Move data file', defaultPath: dataFile, filters: JSON_FILTER })
  if (result.canceled || !result.filePath) return null
  writeAtomic(result.filePath, json)
  rememberDataFile(result.filePath)
  return dataFile
})

ipcMain.handle('stash:openFile', async () => {
  const result = await dialog.showOpenDialog(win, { title: 'Open data file', properties: ['openFile'], filters: JSON_FILTER })
  if (result.canceled || result.filePaths.length === 0) return null
  const file = result.filePaths[0]
  let json
  try {
    json = readJson(file)
  } catch {
    dialog.showErrorBox('Not a Stash data file', `${file} isn't valid JSON.`)
    return null
  }
  rememberDataFile(file)
  return { path: file, json }
})

ipcMain.handle('stash:reveal', () => shell.showItemInFolder(dataFile))

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

  if (process.env.STASH_DEV_URL) win.loadURL(process.env.STASH_DEV_URL)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
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
    dataFile = readConfig().dataFile || defaultDataFile()
    createWindow()
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
  })
  app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
}
