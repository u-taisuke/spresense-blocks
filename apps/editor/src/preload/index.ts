import { contextBridge, ipcRenderer, shell } from "electron";
import type { DetectedBoard, InstallProgressEvent } from "@spresense-blocks/arduino-cli-bridge";

export interface LogEntry {
  channel: "stdout" | "stderr";
  chunk: string;
}

export interface OpenProjectResult {
  path: string;
  data: unknown;
}

export type SetupRunResult = { ok: true } | { ok: false; error: string };

export interface SpresenseApi {
  listBoards(): Promise<DetectedBoard[]>;
  compileAndUpload(code: string, port: string): Promise<void>;
  onLog(callback: (entry: LogEntry) => void): () => void;
  /** path が null なら保存ダイアログを開く。戻り値は実際に保存できたパス(キャンセル時は null)。 */
  saveProject(data: unknown, path: string | null): Promise<string | null>;
  /** キャンセル時は null。 */
  openProject(): Promise<OpenProjectResult | null>;
  /** arduino-cli / SPRESENSEコアのセットアップを実行する(既に完了していれば即座に成功で返る)。 */
  runSetup(): Promise<SetupRunResult>;
  onSetupProgress(callback: (event: InstallProgressEvent) => void): () => void;
  /** USBドライバのダウンロードページ等、外部URLを既定のブラウザで開く。 */
  openExternal(url: string): void;
}

const api: SpresenseApi = {
  listBoards: () => ipcRenderer.invoke("arduino:listBoards"),
  compileAndUpload: (code, port) => ipcRenderer.invoke("arduino:compileAndUpload", { code, port }),
  onLog: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, entry: LogEntry): void => callback(entry);
    ipcRenderer.on("arduino:log", listener);
    return () => ipcRenderer.removeListener("arduino:log", listener);
  },
  saveProject: (data, path) => ipcRenderer.invoke("project:save", { data, path }),
  openProject: () => ipcRenderer.invoke("project:open"),
  runSetup: () => ipcRenderer.invoke("setup:run"),
  onSetupProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: InstallProgressEvent): void =>
      callback(progress);
    ipcRenderer.on("setup:progress", listener);
    return () => ipcRenderer.removeListener("setup:progress", listener);
  },
  openExternal: (url) => {
    // http(s) 以外(file: 等)は開かせない。安全のための最小限のチェック。
    if (/^https?:\/\//.test(url)) {
      shell.openExternal(url);
    }
  },
};

contextBridge.exposeInMainWorld("spresense", api);
