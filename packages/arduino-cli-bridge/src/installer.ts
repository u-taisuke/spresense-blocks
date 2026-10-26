import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ArduinoCliClient } from "./ArduinoCliClient.js";
import {
  getArduinoCliBinaryPath,
  getArduinoCliConfigPath,
  getArduinoDataDir,
  getArduinoUserDir,
  getLibraryPinsPath,
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
  step:
    | "check"
    | "download-cli"
    | "extract-cli"
    | "write-config"
    | "update-index"
    | "install-core"
    | "install-library"
    | "done";
  message: string;
  /** arduino-cli 自身の生ログなど、詳細を表示したい場合。 */
  detail?: string;
}

/**
 * arduino-cli ライブラリの依存情報。`board-spresense` パッケージの同名の型と構造は同じ
 * (循環依存を避けるためこちらで独立に定義している。呼び出し側はどちらの型でも渡せる)。
 */
export interface LibraryDependency {
  /** `arduino-cli lib list` に表示される名前。インストール済み判定に使う。 */
  name: string;
  libraryManagerName?: string;
  /** 末尾に `#<commit-sha>` を含め、必ずコミットを固定すること。 */
  gitUrl?: string;
}

type ProgressCallback = (event: InstallProgressEvent) => void;

/** ライブラリ名 → インストールしたときの gitUrl。 */
export type LibraryPins = Record<string, string>;

/**
 * ライブラリを(入れ直しも含めて)インストールする必要があるかどうか。
 *
 * - 未インストールなら必要。
 * - gitUrl で入れるライブラリは、記録にあるインストール時の gitUrl が今の固定値と違えば必要
 *   (固定コミットを更新しても、ライブラリのバージョン表記が同じことがあるため、名前だけでは
 *   古い版のままになってしまう。記録が無い=以前のバージョンのアプリで入れた場合も、1回だけ入れ直す)。
 *   `lib install --git-url` は、インストール済みのライブラリを新しい内容で置き換える。
 */
export function needsLibraryInstall(lib: LibraryDependency, installedNames: string[], pins: LibraryPins): boolean {
  if (!installedNames.includes(lib.name)) {
    return true;
  }
  return lib.gitUrl !== undefined && pins[lib.name] !== lib.gitUrl;
}

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

/** `fetch` と同じ形の関数。Electron では OS のプロキシ設定に従う `net.fetch` を渡す。 */
export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export interface DownloadOptions {
  /** 既定は Node.js 組み込みの `fetch`(OS のプロキシ設定は見ない)。 */
  fetchImpl?: FetchLike;
  attempts?: number;
  /** データが1バイトも届かないまま この時間が過ぎたら、止まったとみなして打ち切る。 */
  stallTimeoutMs?: number;
  /** リトライ前の待ち時間の基準(試行回数倍する)。テスト用。 */
  retryDelayMs?: number;
  /** 受信済みバイト数と全体のバイト数(サーバーが教えてくれない場合は null)。 */
  onProgress?: (receivedBytes: number, totalBytes: number | null) => void;
}

/**
 * 「止まった」とみなすまでの時間。
 *
 * 以前は1回の試行全体を60秒で打ち切っていたが、arduino-cli 本体は約18MBあり、
 * 約2.5Mbps未満の回線(混み合った学校の回線など)では、正常にダウンロードが進んでいても
 * 毎回途中で打ち切られ、3回とも失敗してセットアップが絶対に終わらなかった。
 * そのため「合計時間」ではなく「データが届かない時間」で判定する。遅くても進んでいる限りは待ち、
 * ファイアウォール等で通信が無応答のまま固まった場合だけ打ち切る。
 */
const DOWNLOAD_STALL_TIMEOUT_MS = 60_000;

class DownloadStalledError extends Error {
  constructor(timeoutMs: number) {
    super(`${Math.round(timeoutMs / 1000)}秒間データが届かなかったため中断しました`);
    this.name = "DownloadStalledError";
  }
}

/** 1回分のダウンロード。データが届くたびに「止まった」判定のタイマーを延長する。 */
async function downloadOnce(
  url: string,
  fetchImpl: FetchLike,
  stallTimeoutMs: number,
  onProgress: DownloadOptions["onProgress"]
): Promise<Buffer> {
  const controller = new AbortController();
  let stalledError: DownloadStalledError | undefined;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const resetStallTimer = (): void => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      stalledError = new DownloadStalledError(stallTimeoutMs);
      controller.abort(stalledError);
    }, stallTimeoutMs);
  };

  resetStallTimer();
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const lengthHeader = response.headers.get("content-length");
    const totalBytes = lengthHeader !== null && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : null;
    if (!response.body) {
      throw new Error("サーバーからの応答が空でした");
    }

    const reader = response.body.getReader();
    // 中断の仕方は fetch の実装(Node.js / Electron)によって差があるため、
    // abort に加えて読み取り側も明示的に止め、確実に read() から抜けるようにする。
    controller.signal.addEventListener("abort", () => void reader.cancel().catch(() => undefined), { once: true });

    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    onProgress?.(0, totalBytes);
    for (;;) {
      const { done, value } = await reader.read();
      if (stalledError) {
        throw stalledError;
      }
      if (done) {
        break;
      }
      resetStallTimer();
      chunks.push(value);
      receivedBytes += value.byteLength;
      onProgress?.(receivedBytes, totalBytes);
    }
    if (totalBytes !== null && receivedBytes !== totalBytes) {
      throw new Error(`ダウンロードが途中で切れました(${receivedBytes} / ${totalBytes} バイト)`);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    throw stalledError ?? error;
  } finally {
    clearTimeout(stallTimer);
  }
}

/**
 * 指定URLをダウンロードする。学校のネットワーク環境は不安定・プロキシ経由なことがあるため、
 * 数回リトライしてからでないと諦めない。
 */
export async function downloadFile(url: string, options: DownloadOptions = {}): Promise<Buffer> {
  const {
    fetchImpl = (u, init) => fetch(u, init),
    attempts = 3,
    stallTimeoutMs = DOWNLOAD_STALL_TIMEOUT_MS,
    retryDelayMs = 1000,
    onProgress,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await downloadOnce(url, fetchImpl, stallTimeoutMs, onProgress);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(retryDelayMs * attempt);
      }
    }
  }
  throw new Error(
    `${attempts}回試しましたが、ダウンロードできませんでした。\n` +
      "学校のネットワークがプロキシやファイアウォールで外部通信をブロックしている可能性があります。" +
      "ネットワーク管理者に、以下のURLへのアクセスを許可してもらえるか確認してください。\n" +
      `URL: ${url}\n元のエラー: ${String(lastError)}`
  );
}

function formatMegabytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

/** ダウンロードの進み具合を「3.2 / 18.0 MB (17%)」のような1行にする。 */
export function formatDownloadProgress(receivedBytes: number, totalBytes: number | null): string {
  if (totalBytes === null || totalBytes <= 0) {
    return `${formatMegabytes(receivedBytes)} MB`;
  }
  const percent = Math.floor((receivedBytes / totalBytes) * 100);
  return `${formatMegabytes(receivedBytes)} / ${formatMegabytes(totalBytes)} MB (${percent}%)`;
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
export interface ArduinoCliInstallerOptions {
  /** arduino-cli 本体のダウンロードに使う fetch。既定は Node.js 組み込みの `fetch`。 */
  fetch?: FetchLike;
}

export interface EnsureReadyOptions {
  /**
   * arduino-cli に使わせるプロキシ(例: `http://proxy.example.ac.jp:8080`)。
   * arduino-cli は OS のプロキシ設定を見ないため、プロキシ必須のネットワークでは
   * これを渡さないとボード情報やライブラリのダウンロードが一切できない。
   */
  proxyUrl?: string | null;
}

/** 進捗表示を更新する最短間隔。ダウンロードの1チャンクごとにUIへ送ると多すぎるため間引く。 */
const PROGRESS_THROTTLE_MS = 300;

export class ArduinoCliInstaller {
  constructor(
    private readonly appDataDir: string,
    private readonly board: InstallerBoardInfo,
    private readonly options: ArduinoCliInstallerOptions = {}
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
    const message = "arduino-cli をダウンロード中...";
    onProgress({ step: "download-cli", message });
    let lastReportedAt = 0;
    const buffer = await downloadFile(asset.url, {
      fetchImpl: this.options.fetch,
      onProgress: (receivedBytes, totalBytes) => {
        const now = Date.now();
        const finished = totalBytes !== null && receivedBytes >= totalBytes;
        if (!finished && now - lastReportedAt < PROGRESS_THROTTLE_MS) {
          return;
        }
        lastReportedAt = now;
        onProgress({ step: "download-cli", message, detail: formatDownloadProgress(receivedBytes, totalBytes) });
      },
    });

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
      "library:",
      // sensor-addon パックのBMI160ライブラリのように、Library Managerに登録されていない
      // ライブラリを `lib install --git-url` で取得するために必要。
      // コミットを固定したURLしか使わないので、このアプリの範囲では安全に有効化できる。
      "  enable_unsafe_install: true",
      "",
    ].join("\n");
    writeFileSync(this.configFilePath, yaml, "utf8");
  }

  private async ensureLibrariesInstalled(
    client: ArduinoCliClient,
    libraries: LibraryDependency[],
    onProgress: ProgressCallback
  ): Promise<void> {
    if (libraries.length === 0) {
      return;
    }
    const installedNames = await client.getInstalledLibraryNames();
    const pins = this.readLibraryPins();

    for (const lib of libraries) {
      if (!needsLibraryInstall(lib, installedNames, pins)) {
        continue;
      }
      const message = `${lib.name} をインストールしています...`;
      onProgress({ step: "install-library", message });
      const events = {
        onStdout: (chunk: string) => onProgress({ step: "install-library", message, detail: chunk }),
        onStderr: (chunk: string) => {
          // `--git-url` を使うたびに出る「自己責任で」という英語の警告は、コミットを固定したURLしか
          // 使わないこのアプリでは意味が無く、生徒・先生を不安にさせるだけなので画面には出さない。
          if (!chunk.includes("--git-url and --zip-path flags allow installing untrusted files")) {
            onProgress({ step: "install-library", message, detail: chunk });
          }
        },
      };
      const isUpdate = installedNames.includes(lib.name);
      try {
        if (lib.gitUrl) {
          await client.installLibraryFromGit(lib.gitUrl, events);
          pins[lib.name] = lib.gitUrl;
          this.writeLibraryPins(pins);
        } else if (lib.libraryManagerName) {
          await client.installLibrary(lib.libraryManagerName, events);
        }
      } catch (error) {
        // 未インストールのライブラリが入れられないのは致命的(そのブロックを使うと必ずコンパイルに失敗する)
        // なので、そのままエラーにする。一方、インストール済みのライブラリを新しい固定コミットに
        // 入れ直す(更新する)のに失敗した場合は、古い版のままでも動くので起動を止めない。
        // 教室のPCがオフラインのときにアプリ自体が使えなくなるのを避けるため。
        // 記録(library-pins.json)は更新しないので、次回の起動時にもう一度入れ直しを試みる。
        if (!isUpdate) {
          throw error;
        }
        onProgress({
          step: "install-library",
          message: `${lib.name} の更新に失敗しました。今のバージョンのまま使います(次回の起動時にもう一度試します)`,
          detail: String(error),
        });
      }
    }
  }

  private readLibraryPins(): LibraryPins {
    try {
      const parsed: unknown = JSON.parse(readFileSync(getLibraryPinsPath(this.appDataDir), "utf8"));
      return parsed && typeof parsed === "object" ? (parsed as LibraryPins) : {};
    } catch {
      // まだ記録が無い(初回、または以前のバージョンのアプリ)場合。
      return {};
    }
  }

  private writeLibraryPins(pins: LibraryPins): void {
    writeFileSync(getLibraryPinsPath(this.appDataDir), `${JSON.stringify(pins, null, 2)}\n`, "utf8");
  }

  /**
   * arduino-cli本体・設定・SPRESENSEコア・(指定があれば)追加ライブラリが揃っていることを確認し、
   * 足りなければ用意する。何度呼んでも安全(既に揃っていれば何もしない)。
   * @param libraries センサー拡張ボードなど、特定のブロックパックが必要とする追加ライブラリ。
   */
  async ensureReady(
    onProgress: ProgressCallback,
    libraries: LibraryDependency[] = [],
    options: EnsureReadyOptions = {}
  ): Promise<void> {
    onProgress({ step: "check", message: "セットアップ状況を確認しています..." });
    if (options.proxyUrl) {
      onProgress({
        step: "check",
        message: "セットアップ状況を確認しています...",
        detail: `プロキシ ${options.proxyUrl} を使います`,
      });
    }

    if (!this.isArduinoCliInstalled()) {
      await this.downloadAndInstallCli(onProgress);
    }

    this.ensureConfigFile();

    // 設定ファイル(network.proxy)ではなく環境変数で渡すのは、ノートPCを持ち歩いて
    // プロキシのある学校と無い自宅を行き来しても、起動のたびに今のネットワークに合わせられるようにするため。
    const client = new ArduinoCliClient(this.binaryPath, this.configFilePath, {
      env: options.proxyUrl ? { ARDUINO_NETWORK_PROXY: options.proxyUrl } : undefined,
    });
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

    await this.ensureLibrariesInstalled(client, libraries, onProgress);

    onProgress({ step: "done", message: "準備が完了しました。" });
  }
}
