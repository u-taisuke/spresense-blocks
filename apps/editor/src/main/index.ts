import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { registerArduinoIpc } from "./ipc/arduino.js";
import { registerProjectIpc } from "./ipc/project.js";
import { SetupManager, registerSetupIpc } from "./setup.js";

// package.json の "name" が "@spresense-blocks/editor" (npm workspace用のスコープ付き名前)なので、
// これを明示的に上書きしないと、Electronがこの文字列をそのまま userData のパスに使ってしまい
// "AppData/Roaming/@spresense-blocks/editor" のような分かりにくい(スラッシュ入りの)フォルダになる。
// electron-builder のインストール先フォルダ名とも食い違って紛らわしいため、ここで固定する。
app.setName("spresense-blocks");

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  // app.getPath('userData') は app.whenReady() 以降でないと確実ではないため、ここで生成する。
  const setupManager = new SetupManager(app.getPath("userData"));

  registerSetupIpc(() => mainWindow, setupManager);
  registerArduinoIpc(() => mainWindow, setupManager.createArduinoCliClient());
  registerProjectIpc(() => mainWindow);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
