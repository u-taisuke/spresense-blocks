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

export interface RemovableDrive {
  driveLetter: string;
  volumeName: string;
  totalBytes: number;
  freeBytes: number;
}

/** samples/samples.json の1件分(main/content.ts の SampleInfo と同じ形)。 */
export interface SampleInfo {
  file: string;
  title: string;
  description: string;
  hardware: string;
  category: "基本" | "センサー" | "ゆる楽器";
}

export interface OpenSampleResult {
  info: SampleInfo;
  data: unknown;
}

/** メニューバーからの操作(main/menu.ts の MenuAction と同じ形)。 */
export type MenuAction =
  | { type: "open" }
  | { type: "save" }
  | { type: "openSample"; file: string }
  | { type: "showSamples" }
  | { type: "showTutorial" }
  | { type: "toggleCode" };

export type CopyVoicesResult = { ok: true; copiedVoices: string[] } | { ok: false; error: string };

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
  /** アプリに同梱されている(=SDカードにコピー可能な)音色フォルダ名の一覧。 */
  listAvailableVoices(): Promise<string[]>;
  /** リムーバブルディスク(SDカードリーダー等)の一覧。Windows以外では常に空配列。 */
  listRemovableDrives(): Promise<RemovableDrive[]>;
  /** 選んだ音色フォルダを丸ごと、指定したドライブのルート直下にコピーする。 */
  copyVoicesToDrive(driveLetter: string, voices: string[]): Promise<CopyVoicesResult>;
  /** アプリに同梱されているサンプルの一覧。 */
  listSamples(): Promise<SampleInfo[]>;
  /** サンプルを1つ読み込む(file は listSamples() が返したものだけ受け付ける)。 */
  openSample(file: string): Promise<OpenSampleResult>;
  /** チュートリアル(Markdown)の本文。 */
  readTutorial(): Promise<string>;
  /** メニューバーの項目が選ばれたときに呼ばれる。 */
  onMenuAction(callback: (action: MenuAction) => void): () => void;
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
  listAvailableVoices: () => ipcRenderer.invoke("sdcard:listVoices"),
  listRemovableDrives: () => ipcRenderer.invoke("sdcard:listDrives"),
  copyVoicesToDrive: (driveLetter, voices) =>
    ipcRenderer.invoke("sdcard:copyVoices", { driveLetter, voices }),
  listSamples: () => ipcRenderer.invoke("content:listSamples"),
  openSample: (file) => ipcRenderer.invoke("content:openSample", file),
  readTutorial: () => ipcRenderer.invoke("content:readTutorial"),
  onMenuAction: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, action: MenuAction): void => callback(action);
    ipcRenderer.on("menu:action", listener);
    return () => ipcRenderer.removeListener("menu:action", listener);
  },
};

contextBridge.exposeInMainWorld("spresense", api);
