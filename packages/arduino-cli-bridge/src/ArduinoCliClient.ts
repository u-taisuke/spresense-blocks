import { spawn } from "node:child_process";
import { resolveArduinoCliPath } from "./paths.js";

export interface ArduinoCliEvents {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface DetectedBoard {
  port: string;
  boardName?: string;
  fqbn?: string;
}

export class ArduinoCliBusyError extends Error {
  constructor() {
    super("arduino-cli は既に別の処理を実行中です。完了を待ってから再試行してください。");
    this.name = "ArduinoCliBusyError";
  }
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
  constructor(public readonly command: string[]) {
    super(
      `arduino-cli ${command.join(" ")} が一定時間たっても終わりませんでした。` +
        "ネットワークが不安定か、ファイアウォール/ウイルス対策ソフトが通信をブロックしている可能性があります。"
    );
    this.name = "ArduinoCliTimeoutError";
  }
}

/**
 * 1コマンドに許す最大実行時間。
 *
 * ネットワークが完全に無応答の場合、arduino-cli 自身がハングして戻ってこないことがある
 * (ファイアウォール/ウイルス対策ソフトが未署名の通信を検査中に無応答のまま止めてしまう等)。
 * それでもUIが「ずっと処理中」のまま固まってしまわないよう、必ずここで強制終了する。
 * コンパイルやコアインストールは数十秒〜数分かかることがあるため、十分長めに取ってある。
 */
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * arduino-cli サブプロセスの唯一の窓口。
 *
 * - Electron の main プロセスからのみ使う想定（レンダラーから直接子プロセスは起動しない）。
 * - 一度に1コマンドしか実行しない（ビルドキャッシュ破損防止のためのシングルフライト）。
 * - stdout/stderr はイベントコールバックでストリーム通知する
 *   （SPRESENSEのビルドは数十秒かかりうるため、進捗をUIに出す必要がある）。
 */
export class ArduinoCliClient {
  private busy = false;

  constructor(
    private readonly binaryPath: string = resolveArduinoCliPath(),
    /** 指定すると、すべてのコマンドに `--config-file <path>` を付与する(ユーザーの既存Arduino環境を触らないため)。 */
    private readonly configFilePath?: string,
    /** テスト用。既定値は COMMAND_TIMEOUT_MS(5分)。 */
    private readonly commandTimeoutMs: number = COMMAND_TIMEOUT_MS
  ) {}

  async compile(sketchDir: string, fqbn: string, events: ArduinoCliEvents = {}): Promise<void> {
    await this.run(["compile", "--fqbn", fqbn, sketchDir], events);
  }

  async upload(sketchDir: string, fqbn: string, port: string, events: ArduinoCliEvents = {}): Promise<void> {
    await this.run(["upload", "--fqbn", fqbn, "--port", port, sketchDir], events);
  }

  async updateIndex(events: ArduinoCliEvents = {}): Promise<void> {
    await this.run(["core", "update-index"], events);
  }

  async ensureCoreInstalled(coreId: string, events: ArduinoCliEvents = {}): Promise<void> {
    await this.run(["core", "install", coreId], events);
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

  private run(args: string[], events: ArduinoCliEvents): Promise<void> {
    if (this.busy) {
      return Promise.reject(new ArduinoCliBusyError());
    }
    this.busy = true;

    const fullArgs = this.configFilePath ? ["--config-file", this.configFilePath, ...args] : args;

    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, fullArgs, { windowsHide: true });
      let stderr = "";
      let settled = false;

      const timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        this.busy = false;
        child.kill();
        reject(new ArduinoCliTimeoutError(args));
      }, this.commandTimeoutMs);

      child.stdout.on("data", (data: Buffer) => events.onStdout?.(data.toString("utf8")));
      child.stderr.on("data", (data: Buffer) => {
        const text = data.toString("utf8");
        stderr += text;
        events.onStderr?.(text);
      });

      child.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        this.busy = false;
        reject(error);
      });

      child.on("close", (exitCode) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        this.busy = false;
        if (exitCode === 0) {
          resolve();
        } else {
          reject(new ArduinoCliExitError(args, exitCode, stderr));
        }
      });
    });
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
