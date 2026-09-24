import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ArduinoCliClient } from "./ArduinoCliClient.js";
import {
  getArduinoCliBinaryPath,
  getArduinoCliConfigPath,
  getArduinoDataDir,
  getArduinoUserDir,
} from "./paths.js";

export interface PlatformAsset {
  url: string;
  archiveFormat: "zip" | "tar.gz";
}

/**
 * 現在の OS/CPU に対応する arduino-cli の GitHub リリースアセットを返す。
 * バージョンは呼び出し側(board.json の `arduinoCliVersion`)で固定する。
 */
export function getPlatformAsset(version: string): PlatformAsset {
  const base = `https://github.com/arduino/arduino-cli/releases/download/v${version}`;
  const key = `${process.platform}:${process.arch}`;

  switch (key) {
    case "win32:x64":
      return { url: `${base}/arduino-cli_${version}_Windows_64bit.zip`, archiveFormat: "zip" };
    case "win32:ia32":
      return { url: `${base}/arduino-cli_${version}_Windows_32bit.zip`, archiveFormat: "zip" };
    case "darwin:x64":
      return { url: `${base}/arduino-cli_${version}_macOS_64bit.tar.gz`, archiveFormat: "tar.gz" };
    case "darwin:arm64":
      return { url: `${base}/arduino-cli_${version}_macOS_ARM64.tar.gz`, archiveFormat: "tar.gz" };
    case "linux:x64":
      return { url: `${base}/arduino-cli_${version}_Linux_64bit.tar.gz`, archiveFormat: "tar.gz" };
    case "linux:arm64":
      return { url: `${base}/arduino-cli_${version}_Linux_ARM64.tar.gz`, archiveFormat: "tar.gz" };
    case "linux:arm":
      return { url: `${base}/arduino-cli_${version}_Linux_ARMv7.tar.gz`, archiveFormat: "tar.gz" };
    default:
      throw new Error(
        `この環境(${process.platform}/${process.arch})向けの arduino-cli 配布物が見つかりません。手動でインストールし、` +
          "SPRESENSE_BLOCKS_ARDUINO_CLI_PATH 環境変数でパスを指定してください。"
      );
  }
}

export interface InstallProgressEvent {
  step: "check" | "download-cli" | "extract-cli" | "write-config" | "update-index" | "install-core" | "done";
  message: string;
  /** arduino-cli 自身の生ログなど、詳細を表示したい場合。 */
  detail?: string;
}

type ProgressCallback = (event: InstallProgressEvent) => void;

/** Windows は System32 の bsdtar(zip/tar.gz両対応)、それ以外は PATH 上の tar を使う。 */
function getTarExecutable(): string {
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
    return join(systemRoot, "System32", "tar.exe");
  }
  return "tar";
}

function extractArchive(archivePath: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(getTarExecutable(), ["-xf", archivePath, "-C", destDir], { windowsHide: true });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ダウンロードしたファイルの展開に失敗しました(tar exit code: ${code})\n${stderr}`));
      }
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 1回のダウンロード試行に許す最大時間。
 *
 * ファイアウォールやウイルス対策ソフトが新規の未署名exeからの通信を検査中に無応答のまま
 * 固まらせてしまうことがあり、`fetch` はネットワークが完全に無応答だと既定でタイムアウトせず
 * 永久に待ち続けてしまう。それを防ぎ、必ず一定時間でエラーとしてユーザーに知らせるための上限。
 * ( arduino-cli 本体は数十MB程度なので、60秒あれば非常に遅い回線でも十分足りる )
 */
const DOWNLOAD_TIMEOUT_MS = 60_000;

/**
 * 指定URLをダウンロードする。学校のネットワーク環境は不安定・プロキシ経由なことがあるため、
 * 数回リトライしてからでないと諦めない。1回あたり `DOWNLOAD_TIMEOUT_MS` で強制的に切り上げる。
 */
async function downloadWithRetry(url: string, attempts = 3): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error("タイムアウトしました")), DOWNLOAD_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(1000 * attempt);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new Error(
    `${attempts}回試しましたが、ダウンロードできませんでした。\n` +
      "学校のネットワークがプロキシやファイアウォールで外部通信をブロックしている可能性があります。" +
      "ネットワーク管理者に、以下のURLへのアクセスを許可してもらえるか確認してください。\n" +
      `URL: ${url}\n元のエラー: ${String(lastError)}`
  );
}

/** YAML の文字列値として安全に埋め込む(JSON文字列のエスケープ規則はYAMLのダブルクォート文字列と互換)。 */
function yamlString(value: string): string {
  return JSON.stringify(value);
}

export interface InstallerBoardInfo {
  coreId: string;
  coreVersion: string;
  boardManagerUrl: string;
  arduinoCliVersion: string;
}

/**
 * arduino-cli 本体のダウンロードと、SPRESENSEコアの自動インストールを行う。
 *
 * すべて `appDataDir` の中に閉じ込め、ユーザーの既存 Arduino IDE 環境(`~/.arduino15` 等)には
 * 一切触れない。すでにセットアップ済みなら(バイナリが存在し、コアのバージョンが一致していれば)
 * ネットワークに一切アクセスしないので、教室でオフラインでも普段どおり起動できる。
 */
export class ArduinoCliInstaller {
  constructor(
    private readonly appDataDir: string,
    private readonly board: InstallerBoardInfo
  ) {}

  get binaryPath(): string {
    return getArduinoCliBinaryPath(this.appDataDir);
  }

  get configFilePath(): string {
    return getArduinoCliConfigPath(this.appDataDir);
  }

  isArduinoCliInstalled(): boolean {
    return existsSync(this.binaryPath);
  }

  private async downloadAndInstallCli(onProgress: ProgressCallback): Promise<void> {
    const asset = getPlatformAsset(this.board.arduinoCliVersion);
    onProgress({ step: "download-cli", message: "arduino-cli をダウンロード中..." });
    const buffer = await downloadWithRetry(asset.url);

    const tempDir = mkdtempSync(join(tmpdir(), "spresense-blocks-cli-"));
    const archivePath = join(tempDir, asset.archiveFormat === "zip" ? "arduino-cli.zip" : "arduino-cli.tar.gz");
    writeFileSync(archivePath, buffer);

    onProgress({ step: "extract-cli", message: "arduino-cli を展開中..." });
    const destDir = dirname(this.binaryPath);
    await extractArchive(archivePath, destDir);

    if (process.platform !== "win32") {
      chmodSync(this.binaryPath, 0o755);
    }
  }

  private ensureConfigFile(): void {
    if (existsSync(this.configFilePath)) {
      return;
    }
    const dataDir = getArduinoDataDir(this.appDataDir);
    const userDir = getArduinoUserDir(this.appDataDir);
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(userDir, { recursive: true });

    const yaml = [
      "board_manager:",
      "  additional_urls:",
      `    - ${yamlString(this.board.boardManagerUrl)}`,
      "directories:",
      `  data: ${yamlString(dataDir)}`,
      `  user: ${yamlString(userDir)}`,
      "",
    ].join("\n");
    writeFileSync(this.configFilePath, yaml, "utf8");
  }

  /**
   * arduino-cli本体・設定・SPRESENSEコアが揃っていることを確認し、足りなければ用意する。
   * 何度呼んでも安全(既に揃っていれば何もしない)。
   */
  async ensureReady(onProgress: ProgressCallback): Promise<void> {
    onProgress({ step: "check", message: "セットアップ状況を確認しています..." });

    if (!this.isArduinoCliInstalled()) {
      await this.downloadAndInstallCli(onProgress);
    }

    this.ensureConfigFile();

    const client = new ArduinoCliClient(this.binaryPath, this.configFilePath);
    const installedVersion = await client.getInstalledCoreVersion(this.board.coreId);

    if (installedVersion !== this.board.coreVersion) {
      onProgress({ step: "update-index", message: "ボード情報を更新しています..." });
      await client.updateIndex({
        onStdout: (chunk) => onProgress({ step: "update-index", message: "ボード情報を更新しています...", detail: chunk }),
        onStderr: (chunk) => onProgress({ step: "update-index", message: "ボード情報を更新しています...", detail: chunk }),
      });

      onProgress({
        step: "install-core",
        message: `SPRESENSEのボード情報をインストールしています...(${this.board.coreVersion})`,
      });
      await client.ensureCoreInstalled(`${this.board.coreId}@${this.board.coreVersion}`, {
        onStdout: (chunk) =>
          onProgress({ step: "install-core", message: "SPRESENSEのボード情報をインストールしています...", detail: chunk }),
        onStderr: (chunk) =>
          onProgress({ step: "install-core", message: "SPRESENSEのボード情報をインストールしています...", detail: chunk }),
      });
    }

    onProgress({ step: "done", message: "準備が完了しました。" });
  }
}
