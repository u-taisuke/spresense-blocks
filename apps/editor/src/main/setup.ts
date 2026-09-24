import { ipcMain, type BrowserWindow } from "electron";
import { ArduinoCliClient, ArduinoCliInstaller, type InstallProgressEvent } from "@spresense-blocks/arduino-cli-bridge";
import { board } from "@spresense-blocks/board-spresense";

/**
 * arduino-cli本体のダウンロード〜SPRESENSEコアのインストールまでを、
 * アプリ専用のデータディレクトリ(`appDataDir`、Electronなら `app.getPath('userData')`)に
 * 閉じ込めて行う。ユーザーが元々持っている Arduino IDE の環境には一切触れない。
 */
export class SetupManager {
  readonly installer: ArduinoCliInstaller;
  /** 開発時: 環境変数で arduino-cli の場所が明示されている場合は、自動セットアップを完全にスキップする。 */
  private readonly devOverrideActive = Boolean(process.env.SPRESENSE_BLOCKS_ARDUINO_CLI_PATH);
  private readyPromise: Promise<void> | null = null;

  constructor(appDataDir: string) {
    this.installer = new ArduinoCliInstaller(appDataDir, board);
  }

  /** IPC経由でも main プロセス内(他のIPCハンドラの登録時など)でも使う、実際にビルド/書き込みを行うクライアント。 */
  createArduinoCliClient(): ArduinoCliClient {
    if (this.devOverrideActive) {
      // resolveArduinoCliPath() が環境変数を最優先で見るので、パス指定は不要。
      // 専用の config-file も使わず、開発機に元からある arduino-cli の設定をそのまま使う。
      return new ArduinoCliClient();
    }
    return new ArduinoCliClient(this.installer.binaryPath, this.installer.configFilePath);
  }

  /**
   * 何度呼んでもよい(2回目以降は同じ Promise を返す = 二重にダウンロード・インストールしない)。
   * 失敗した場合は次回呼び出しで再試行できるよう状態をリセットする。
   */
  ensureReady(onProgress: (event: InstallProgressEvent) => void): Promise<void> {
    if (this.devOverrideActive) {
      onProgress({ step: "done", message: "開発用の arduino-cli を使用します(自動セットアップはスキップ)。" });
      return Promise.resolve();
    }
    if (!this.readyPromise) {
      this.readyPromise = this.installer.ensureReady(onProgress).catch((error: unknown) => {
        this.readyPromise = null;
        throw error;
      });
    }
    return this.readyPromise;
  }
}

export function registerSetupIpc(getWindow: () => BrowserWindow | null, setupManager: SetupManager): void {
  ipcMain.handle("setup:run", async () => {
    try {
      await setupManager.ensureReady((event) => {
        getWindow()?.webContents.send("setup:progress", event);
      });
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: String(error) };
    }
  });
}
