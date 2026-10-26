import { resolveArduinoCliPath } from "./paths.js";
import { ProcessTimeoutError, runProcess } from "./runProcess.js";

export interface ArduinoCliEvents {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface DetectedBoard {
  port: string;
  boardName?: string;
  fqbn?: string;
}

export class ArduinoCliExitError extends Error {
  constructor(
    public readonly command: string[],
    public readonly exitCode: number | null,
    public readonly stderr: string
  ) {
    super(`arduino-cli ${command.join(" ")} が失敗しました (exit code: ${exitCode})`);
    this.name = "ArduinoCliExitError";
  }
}

export class ArduinoCliTimeoutError extends Error {
  constructor(
    public readonly command: string[],
    /** "total" = 上限時間を超えた / "idle" = 何も出力しないまま(=ダウンロードが止まったまま)時間が過ぎた */
    public readonly kind: "total" | "idle" = "total"
  ) {
    super(
      kind === "idle"
        ? `arduino-cli ${command.join(" ")} のダウンロードが途中で止まったまま進まなくなったため、中断しました。` +
            "ネットワークが不安定か、プロキシ・ファイアウォール・ウイルス対策ソフトが通信をブロックしている可能性があります。"
        : `arduino-cli ${command.join(" ")} が一定時間たっても終わりませんでした。` +
            "ネットワークが不安定か、ファイアウォール/ウイルス対策ソフトが通信をブロックしている可能性があります。"
    );
    this.name = "ArduinoCliTimeoutError";
  }
}

/** コマンドごとの時間切れの判定方法。 */
interface TimeoutPolicy {
  totalTimeoutMs: number;
  idleTimeoutMs?: number;
}

/**
 * ネットワークを使わないコマンド(コンパイル・書き込み・一覧取得など)の上限時間。
 * コンパイルは途中経過を出力しないことがあるため、「止まっている時間」ではなく合計時間で判定する。
 * ハングしたまま「ずっと処理中」で固まらないよう、必ずここで強制終了する。
 */
const LOCAL_COMMAND_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * ダウンロードを伴うコマンド(ボード情報の更新・コア/ライブラリのインストール)の判定方法。
 *
 * SPRESENSEコアのインストールは合計約225MBのダウンロードになり、遅い回線では5分では終わらない
 * (以前は一律5分で打ち切っていたため、約6Mbps未満の回線ではセットアップが絶対に完了しなかった)。
 * arduino-cli はダウンロード中に進捗を出力し続けるので、「出力が途絶えた時間」でネットワークが
 * 止まったことを判断する。遅くても進んでいる限りは待ち、止まったら早めに知らせる。
 */
const NETWORK_COMMAND_TIMEOUTS: TimeoutPolicy = {
  idleTimeoutMs: 3 * 60 * 1000,
  totalTimeoutMs: 60 * 60 * 1000,
};

export interface ArduinoCliClientOptions {
  /**
   * すべてのコマンドの子プロセスに追加で渡す環境変数。
   * プロキシ環境では `ARDUINO_NETWORK_PROXY`(arduino-cli の設定 `network.proxy` に相当)を渡す。
   * arduino-cli は `HTTPS_PROXY` 等の一般的な環境変数もWindowsのプロキシ設定も見ないため、明示が必要。
   */
  env?: Record<string, string>;
  /** テスト用。ネットワークを使わないコマンドの上限時間を上書きする。 */
  localCommandTimeoutMs?: number;
}

/**
 * arduino-cli サブプロセスの唯一の窓口。
 *
 * - Electron の main プロセスからのみ使う想定（レンダラーから直接子プロセスは起動しない）。
 * - 一度に1コマンドしか実行しない（ビルドキャッシュ破損防止のため）。ただし「既に実行中なら
 *   即座に失敗させる」のではなく、キューに積んで前のコマンドが終わるのを待ってから実行する。
 *   (以前は即座に ArduinoCliBusyError で失敗させていたが、バックグラウンドのポート自動検出
 *   ポーリングと、ユーザーが押す「コンパイル & 書き込み」がたまたま同時に重なると
 *   後者が無条件で失敗してしまう不具合があった。起動直後にSPRESENSEを挿した状態だと、
 *   ポート自動検出のポーリングと最初のビルドが重なりやすく、再現性高く発生していた)
 * - stdout/stderr はイベントコールバックでストリーム通知する
 *   （SPRESENSEのビルドは数十秒かかりうるため、進捗をUIに出す必要がある）。
 */
export class ArduinoCliClient {
  /** 直前にキューされたコマンドの完了を表す Promise。次のコマンドはこれに続けて実行する。 */
  private queue: Promise<void> = Promise.resolve();

  private readonly env: NodeJS.ProcessEnv | undefined;
  private readonly localTimeouts: TimeoutPolicy;

  constructor(
    private readonly binaryPath: string = resolveArduinoCliPath(),
    /** 指定すると、すべてのコマンドに `--config-file <path>` を付与する(ユーザーの既存Arduino環境を触らないため)。 */
    private readonly configFilePath?: string,
    options: ArduinoCliClientOptions = {}
  ) {
    this.env = options.env ? { ...process.env, ...options.env } : undefined;
    this.localTimeouts = { totalTimeoutMs: options.localCommandTimeoutMs ?? LOCAL_COMMAND_TIMEOUT_MS };
  }

  async compile(sketchDir: string, fqbn: string, events: ArduinoCliEvents = {}): Promise<void> {
    await this.run(["compile", "--fqbn", fqbn, sketchDir], events);
  }

  async upload(sketchDir: string, fqbn: string, port: string, events: ArduinoCliEvents = {}): Promise<void> {
    await this.run(["upload", "--fqbn", fqbn, "--port", port, sketchDir], events);
  }

  async updateIndex(events: ArduinoCliEvents = {}): Promise<void> {
    await this.run(["core", "update-index"], events, NETWORK_COMMAND_TIMEOUTS);
  }

  async ensureCoreInstalled(coreId: string, events: ArduinoCliEvents = {}): Promise<void> {
    await this.run(["core", "install", coreId], events, NETWORK_COMMAND_TIMEOUTS);
  }

  /** インストール済みのコアのバージョンを返す(未インストールなら null)。 */
  async getInstalledCoreVersion(coreId: string): Promise<string | null> {
    let stdout = "";
    try {
      await this.run(["core", "list", "--format", "json"], {
        onStdout: (chunk) => {
          stdout += chunk;
        },
      });
    } catch {
      return null;
    }
    return parseInstalledCoreVersion(stdout, coreId);
  }

  async listBoards(): Promise<DetectedBoard[]> {
    let stdout = "";
    await this.run(["board", "list", "--json"], {
      onStdout: (chunk) => {
        stdout += chunk;
      },
    });
    return parseBoardList(stdout);
  }

  /** Arduino Library Manager からライブラリをインストールする。 */
  async installLibrary(libraryManagerName: string, events: ArduinoCliEvents = {}): Promise<void> {
    await this.run(["lib", "install", libraryManagerName], events, NETWORK_COMMAND_TIMEOUTS);
  }

  /**
   * git リポジトリから直接ライブラリをインストールする(Library Manager未登録のライブラリ用)。
   * `library.enable_unsafe_install` が有効な設定(config-file)でないと失敗するので注意。
   * @param gitUrl 末尾に `#<commit-sha>` を付けてコミットを固定すること(再現性とセキュリティのため)。
   */
  async installLibraryFromGit(gitUrl: string, events: ArduinoCliEvents = {}): Promise<void> {
    await this.run(["lib", "install", "--git-url", gitUrl], events, NETWORK_COMMAND_TIMEOUTS);
  }

  /** インストール済みライブラリの名前一覧(`lib list` に出る表示名)を返す。 */
  async getInstalledLibraryNames(): Promise<string[]> {
    let stdout = "";
    await this.run(["lib", "list", "--format", "json"], {
      onStdout: (chunk) => {
        stdout += chunk;
      },
    });
    return parseInstalledLibraryNames(stdout);
  }

  /**
   * コマンドをキューに積む。前にキューされたコマンドが(成功・失敗どちらでも)終わってから、
   * このコマンドを実行する。`queue` 自体は常に成功する Promise にしておく(catchで握りつぶす)
   * ことで、1つのコマンドが失敗しても後続のコマンドが実行されなくなる事態を防いでいる。
   */
  private run(args: string[], events: ArduinoCliEvents, timeouts: TimeoutPolicy = this.localTimeouts): Promise<void> {
    const task = this.queue.then(() => this.exec(args, events, timeouts));
    this.queue = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }

  private async exec(args: string[], events: ArduinoCliEvents, timeouts: TimeoutPolicy): Promise<void> {
    const fullArgs = this.configFilePath ? ["--config-file", this.configFilePath, ...args] : args;

    let result;
    try {
      result = await runProcess(this.binaryPath, fullArgs, {
        env: this.env,
        onStdout: events.onStdout,
        onStderr: events.onStderr,
        ...timeouts,
      });
    } catch (error) {
      if (error instanceof ProcessTimeoutError) {
        throw new ArduinoCliTimeoutError(args, error.kind);
      }
      throw error;
    }
    if (result.exitCode !== 0) {
      throw new ArduinoCliExitError(args, result.exitCode, result.stderr);
    }
  }
}

/**
 * arduino-cli の `board list --json` 出力を解析する。
 * バージョンによって直下が配列(旧)か `{ detected_ports: [...] }`(新)かが異なるため、
 * どちらの形でも読めるよう緩やかにパースする。
 * 実装時に固定する arduino-cli のバージョンで実際の出力を確認し、必要なら調整すること
 * （実装計画の「実装時に確認が必要な事実」を参照）。
 */
export function parseBoardList(rawJson: string): DetectedBoard[] {
  if (!rawJson.trim()) {
    return [];
  }
  const parsed: unknown = JSON.parse(rawJson);
  const entries: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { detected_ports?: unknown[] })?.detected_ports)
      ? (parsed as { detected_ports: unknown[] }).detected_ports
      : [];

  return entries.map((entry): DetectedBoard => {
    const e = entry as Record<string, any>;
    const port: string = e.port?.address ?? e.address ?? "";
    const matches: any[] = e.matching_boards ?? e.boards ?? [];
    const first = matches[0];
    return {
      port,
      boardName: first?.name,
      fqbn: first?.fqbn,
    };
  });
}

/**
 * `arduino-cli core list --format json` の出力から、指定したコアのインストール済みバージョンを取り出す。
 * (このコマンドはインストール済みかどうかに関わらずインデックス上の全プラットフォームを返すため、
 * 対象の `installed_version` フィールドの有無で判定する)
 */
export function parseInstalledCoreVersion(rawJson: string, coreId: string): string | null {
  if (!rawJson.trim()) {
    return null;
  }
  const parsed = JSON.parse(rawJson) as {
    platforms?: Array<{ id?: string; installed_version?: string }>;
  };
  const platform = parsed.platforms?.find((p) => p.id === coreId);
  return platform?.installed_version ?? null;
}

/** `arduino-cli lib list --format json` の出力から、インストール済みライブラリ名の一覧を取り出す。 */
export function parseInstalledLibraryNames(rawJson: string): string[] {
  if (!rawJson.trim()) {
    return [];
  }
  const parsed = JSON.parse(rawJson) as {
    installed_libraries?: Array<{ library?: { name?: string } }>;
  };
  return (parsed.installed_libraries ?? [])
    .map((entry) => entry.library?.name)
    .filter((name): name is string => Boolean(name));
}
