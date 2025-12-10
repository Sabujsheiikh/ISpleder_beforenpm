const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Keeping false as per current architecture to allow window.require
      webSecurity: false
    },
    icon: path.join(__dirname, 'favicon.ico'),
    title: "ISPLedger Enterprise"
  });

  // VITE USES 'dist', not 'build'
  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  mainWindow.loadURL(startUrl);

  // Handle new windows (e.g. for printing)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    return { action: 'allow' };
  });

  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

// --- IPC HANDLERS FOR LOCAL BACKUP & FILE SYSTEM ---

// 1. Get Backup Path (AppData)
const getBackupPath = () => {
  const userDataPath = app.getPath('userData');
  const backupDir = path.join(userDataPath, 'Backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
};

// 2. Save Backup Handler
ipcMain.handle('backup-local', async (event, dataString) => {
  try {
    const backupDir = getBackupPath();
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const fileName = `KAMS_Backup_${dateStr}.json`;
    const filePath = path.join(backupDir, fileName);
    
    fs.writeFileSync(filePath, dataString, 'utf-8');
    return { success: true, path: filePath };
  } catch (error) {
    console.error("Backup Failed:", error);
    return { success: false, error: error.message };
  }
});

// 3. Cleanup Old Backups (Retention Policy: 10 Days)
ipcMain.handle('clean-backups', async () => {
  try {
    const backupDir = getBackupPath();
    const files = fs.readdirSync(backupDir);
    const now = Date.now();
    const RETENTION_MS = 10 * 24 * 60 * 60 * 1000; // 10 Days

    let deletedCount = 0;

    files.forEach(file => {
      const filePath = path.join(backupDir, file);
      const stats = fs.statSync(filePath);
      const fileAge = now - stats.mtime.getTime();

      if (fileAge > RETENTION_MS) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    });

    return { success: true, deleted: deletedCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// --- AUTO UPDATER EVENTS ---

// Triggered by React App on load if setting is enabled
ipcMain.on('check-for-updates', () => {
  if (!process.env.ELECTRON_START_URL) { // Only in production build
     autoUpdater.checkForUpdatesAndNotify();
  }
});

autoUpdater.on('update-available', () => {
  if(mainWindow) mainWindow.webContents.send('update_available');
});

autoUpdater.on('update-downloaded', () => {
  if(mainWindow) mainWindow.webContents.send('update_downloaded');
});

ipcMain.on('restart_app', () => {
  autoUpdater.quitAndInstall();
});