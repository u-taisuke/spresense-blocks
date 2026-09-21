import { ipcMain, dialog, type BrowserWindow } from "electron";
import { readFileSync, writeFileSync } from "node:fs";

const FILE_FILTERS = [{ name: "Spresense Blocks プロジェクト", extensions: ["sprsb"] }];

export interface SaveProjectArgs {
  data: unknown;
  /** 既に保存先が分かっている場合はそのパス。null なら保存ダイアログを開く。 */
  path: string | null;
}

export interface OpenProjectResult {
  path: string;
  data: unknown;
}

export function registerProjectIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle("project:save", async (_event, args: SaveProjectArgs): Promise<string | null> => {
    let targetPath = args.path;

    if (!targetPath) {
      const win = getWindow();
      const result = win
        ? await dialog.showSaveDialog(win, { filters: FILE_FILTERS })
        : await dialog.showSaveDialog({ filters: FILE_FILTERS });
      if (result.canceled || !result.filePath) {
        return null;
      }
      targetPath = result.filePath;
    }

    writeFileSync(targetPath, JSON.stringify(args.data, null, 2), "utf8");
    return targetPath;
  });

  ipcMain.handle("project:open", async (): Promise<OpenProjectResult | null> => {
    const win = getWindow();
    const options = { filters: FILE_FILTERS, properties: ["openFile"] as const };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const path = result.filePaths[0];
    const data = JSON.parse(readFileSync(path, "utf8"));
    return { path, data };
  });
}
