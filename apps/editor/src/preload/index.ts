import { contextBridge, ipcRenderer } from "electron";
import type { DetectedBoard } from "@spresense-blocks/arduino-cli-bridge";

export interface LogEntry {
  channel: "stdout" | "stderr";
  chunk: string;
}

export interface OpenProjectResult {
  path: string;
  data: unknown;
}

export interface SpresenseApi {
  listBoards(): Promise<DetectedBoard[]>;
  compileAndUpload(code: string, port: string): Promise<void>;
  onLog(callback: (entry: LogEntry) => void): () => void;
  /** path が null なら保存ダイアログを開く。戻り値は実際に保存できたパス(キャンセル時は null)。 */
  saveProject(data: unknown, path: string | null): Promise<string | null>;
  /** キャンセル時は null。 */
  openProject(): Promise<OpenProjectResult | null>;
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
};

contextBridge.exposeInMainWorld("spresense", api);
