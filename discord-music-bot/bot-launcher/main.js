const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

let mainWindow, tray, botProcess = null, isQuitting = false;
let guiSocket = null, reconnectTimer = null;

const BOT_DIR   = path.join(__dirname, '..');
const BOT_ENTRY = path.join(BOT_DIR, 'index.js');
const DATA_FILE = path.join(__dirname, 'data.json');
const ICON_PATH = path.join(__dirname, 'icon.png');
const GUI_PORT  = 3001;

// Music dir — read from bot's .env or default
function getMusicDir() {
  try {
    const envPath = path.join(BOT_DIR, '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const m = line.match(/^MUSIC_DIR\s*=\s*(.+)$/);
        if (m) return path.resolve(m[1].trim());
      }
    }
  } catch {}
  return path.join(BOT_DIR, 'music');
}

const LOCAL_EXTS = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.opus', '.webm'];

// ── Data helpers ──────────────────────────────────────────────────────────────
function loadData() {
  try { if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch {}
  return { users: [] };
}
function saveData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }

// ── Playlist helpers ──────────────────────────────────────────────────────────
function getPlaylistFile() {
  const dir = path.join(BOT_DIR, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const files = fs.readdirSync(dir).filter(f => f.startsWith('playlists_'));
  return files.length ? path.join(dir, files[0]) : path.join(dir, 'playlists_gui.json');
}

function loadAllPlaylists() {
  const dir = path.join(BOT_DIR, 'data');
  const result = {};
  if (!fs.existsSync(dir)) return result;
  fs.readdirSync(dir).filter(f => f.startsWith('playlists_')).forEach(file => {
    try { Object.assign(result, JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))); } catch {}
  });
  return result;
}

function savePlaylists(playlists) {
  const fp = getPlaylistFile();
  let existing = {};
  try { if (fs.existsSync(fp)) existing = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch {}
  Object.assign(existing, playlists);
  fs.writeFileSync(fp, JSON.stringify(existing, null, 2));
}

function deletePlaylistFromDisk(key) {
  const dir = path.join(BOT_DIR, 'data');
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).filter(f => f.startsWith('playlists_')).forEach(file => {
    const fp = path.join(dir, file);
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (data[key]) { delete data[key]; fs.writeFileSync(fp, JSON.stringify(data, null, 2)); }
    } catch {}
  });
}

// ── WebSocket to bot ──────────────────────────────────────────────────────────
function connectToBot() {
  if (guiSocket) return;
  try {
    guiSocket = new WebSocket(`ws://localhost:${GUI_PORT}`);
    guiSocket.on('open', () => { if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; } });
    guiSocket.on('message', (raw) => {
      try { mainWindow?.webContents.send('bot-state', JSON.parse(raw.toString())); } catch {}
    });
    guiSocket.on('close', () => { guiSocket = null; if (botProcess) scheduleReconnect(); });
    guiSocket.on('error', () => { guiSocket = null; if (botProcess) scheduleReconnect(); });
  } catch {}
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setInterval(() => {
    if (!guiSocket && botProcess) connectToBot();
    else if (!botProcess) { clearInterval(reconnectTimer); reconnectTimer = null; }
  }, 2000);
}

function sendToBot(data) {
  if (guiSocket?.readyState === WebSocket.OPEN) {
    try { guiSocket.send(JSON.stringify(data)); return true; } catch {}
  }
  return false;
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 720, minWidth: 850, minHeight: 600,
    backgroundColor: '#0a0a0f', frame: false, icon: ICON_PATH,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  mainWindow.loadFile('index.html');
  mainWindow.on('close', (e) => { if (!isQuitting) { e.preventDefault(); mainWindow.hide(); } });
}

function createTray() {
  const img = nativeImage.createFromPath(ICON_PATH);
  tray = new Tray(img.resize({ width: 16, height: 16 }));
  tray.setToolTip('Dance Gavin Dance Bot');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Start Bot', click: () => { mainWindow.show(); startBot(); } },
    { label: 'Stop Bot',  click: () => stopBot() },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; stopBot(); app.quit(); } },
  ]));
  tray.on('click', () => mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show());
}

// ── Bot process ───────────────────────────────────────────────────────────────
function startBot() {
  if (botProcess) return;
  if (!fs.existsSync(BOT_ENTRY)) { sendLog('❌ Could not find bot at: ' + BOT_ENTRY, 'error'); return; }
  sendLog('▶ Starting bot...', 'system');
  botProcess = spawn('node', [BOT_ENTRY], { cwd: BOT_DIR });
  botProcess.stdout.on('data', d => d.toString().trim().split('\n').forEach(l => { if (l.trim()) sendLog(l.trim(), 'info'); }));
  botProcess.stderr.on('data', d => d.toString().trim().split('\n').forEach(l => { if (l.trim()) sendLog(l.trim(), 'warn'); }));
  botProcess.on('close', code => {
    sendLog(`⏹ Bot exited (code ${code})`, 'system');
    botProcess = null;
    if (guiSocket) { try { guiSocket.terminate(); } catch {} guiSocket = null; }
    mainWindow?.webContents.send('bot-status', 'stopped');
    mainWindow?.webContents.send('bot-state', { type: 'state', current: null, queue: [] });
  });
  botProcess.on('error', err => {
    sendLog('❌ Failed to start: ' + err.message, 'error');
    botProcess = null;
    mainWindow?.webContents.send('bot-status', 'stopped');
  });
  mainWindow?.webContents.send('bot-status', 'running');
  setTimeout(connectToBot, 3000);
}

function stopBot() {
  if (!botProcess) return;
  sendLog('⏹ Stopping bot...', 'system');
  if (guiSocket) { try { guiSocket.terminate(); } catch {} guiSocket = null; }
  botProcess.kill(); botProcess = null;
  mainWindow?.webContents.send('bot-status', 'stopped');
  mainWindow?.webContents.send('bot-state', { type: 'state', current: null, queue: [] });
}

function sendLog(message, type = 'info') {
  mainWindow?.webContents.send('log', { message, type, time: new Date().toLocaleTimeString() });
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.on('start-bot',  () => startBot());
ipcMain.on('stop-bot',   () => stopBot());
ipcMain.on('minimize',   () => mainWindow.hide());
ipcMain.on('close-app',  () => { isQuitting = true; stopBot(); app.quit(); });

ipcMain.handle('get-data',       () => loadData());
ipcMain.handle('save-data',      (e, d) => { saveData(d); return true; });
ipcMain.handle('get-bot-status', () => botProcess ? 'running' : 'stopped');
ipcMain.handle('get-playlists',  () => loadAllPlaylists());
ipcMain.handle('get-music-dir',  () => getMusicDir());

// Playback controls
ipcMain.handle('gui-pause',  () => sendToBot({ type: 'pause' }));
ipcMain.handle('gui-resume', () => sendToBot({ type: 'resume' }));
ipcMain.handle('gui-skip',   () => sendToBot({ type: 'skip' }));
ipcMain.handle('gui-stop',   () => sendToBot({ type: 'stop' }));

// Get local music library
ipcMain.handle('get-local-files', () => {
  const dir = getMusicDir();
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); return []; }
  return fs.readdirSync(dir)
    .filter(f => LOCAL_EXTS.includes(path.extname(f).toLowerCase()))
    .map(f => ({
      name: path.basename(f, path.extname(f)),
      filename: f,
      ext: path.extname(f).toLowerCase(),
      filePath: path.join(dir, f),
    }));
});

// Browse for files
ipcMain.handle('browse-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Audio Files',
    filters: [{ name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'opus', 'webm'] }],
    properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled) return [];
  return result.filePaths;
});

// Copy files into music dir
ipcMain.handle('import-files', (e, filePaths) => {
  const dir = getMusicDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const imported = [];
  for (const src of filePaths) {
    const dest = path.join(dir, path.basename(src));
    try {
      if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
      imported.push({ name: path.basename(src, path.extname(src)), filename: path.basename(src), filePath: dest, ext: path.extname(src).toLowerCase() });
    } catch (err) { console.error('Import error:', err.message); }
  }
  return imported;
});

// Play local file via GUI
ipcMain.handle('play-local-file', (e, fileInfo) => {
  return sendToBot({
    type: 'play-local',
    track: {
      title: fileInfo.name,
      artist: null,
      url: fileInfo.filePath,
      filePath: fileInfo.filePath,
      duration: '?',
      thumbnail: null,
      isLocal: true,
      requestedBy: 'GUI',
    },
  });
});

// Playlist handlers
ipcMain.handle('create-playlist', (e, name) => {
  const key = name.toLowerCase().replace(/\s+/g, '-');
  const playlists = loadAllPlaylists();
  playlists[key] = { name, tracks: [], createdBy: 'GUI', createdAt: Date.now() };
  savePlaylists(playlists);
  return true;
});

ipcMain.handle('rename-playlist', (e, { key, name }) => {
  const playlists = loadAllPlaylists();
  if (!playlists[key]) return false;
  playlists[key].name = name;
  savePlaylists(playlists);
  return true;
});

ipcMain.handle('delete-playlist', (e, key) => { deletePlaylistFromDisk(key); return true; });

ipcMain.handle('add-song-to-playlist', async (e, { key, query, localFile }) => {
  try {
    let track;
    if (localFile) {
      track = {
        title: localFile.name,
        artist: null,
        url: localFile.filePath,
        filePath: localFile.filePath,
        duration: '?',
        thumbnail: null,
        isLocal: true,
      };
    } else {
      const play = require(path.join(BOT_DIR, 'node_modules', 'play-dl'));
      let v;
      if (query.includes('youtube.com') || query.includes('youtu.be')) {
        const info = await play.video_info(query);
        v = info.video_details;
        track = { title: v.title, artist: null, url: v.url, duration: v.durationRaw || '?', thumbnail: v.thumbnails?.[0]?.url || null, isLocal: false };
      } else {
        const results = await play.search(query, { limit: 1 });
        if (!results.length) return false;
        v = results[0];
        let title = v.title || query; let artist = null;
        const dash = title.match(/^(.+?)\s*[-–—]\s*(.+)$/);
        if (dash) { artist = dash[1].trim(); title = dash[2].trim(); }
        track = { title, artist, url: v.url, duration: v.durationRaw || '?', thumbnail: v.thumbnails?.[0]?.url || null, isLocal: false };
      }
    }
    const playlists = loadAllPlaylists();
    if (!playlists[key]) playlists[key] = { name: key, tracks: [], createdBy: 'GUI', createdAt: Date.now() };
    playlists[key].tracks.push(track);
    savePlaylists(playlists);
    return true;
  } catch (err) { console.error('[add-song]', err.message); return false; }
});

ipcMain.handle('remove-track-from-playlist', (e, { key, idx }) => {
  const playlists = loadAllPlaylists();
  if (!playlists[key]) return false;
  playlists[key].tracks.splice(idx, 1);
  savePlaylists(playlists);
  return true;
});

ipcMain.handle('play-playlist', (e, key) => {
  if (!botProcess) return false;
  const playlists = loadAllPlaylists();
  const pl = playlists[key];
  if (!pl?.tracks?.length) return false;
  return sendToBot({ type: 'play-playlist', tracks: pl.tracks });
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => { createWindow(); createTray(); });
app.on('before-quit', () => { isQuitting = true; stopBot(); });
app.on('window-all-closed', e => e.preventDefault());
