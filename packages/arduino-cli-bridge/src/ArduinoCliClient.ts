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

  constructor(private readonly binaryPath: string = resolveArduinoCliPath()) {}

  async compile(sketchDir: string, fqbn: string, events: ArduinoCliEvents = {}): Promise<void> {
    await this.run(["compile", "--fqbn", fqbn, sketchDir], events);
  }

  async upload(sketchDir: string, fqbn: string, port: string, events: ArduinoCliEvents = {}): Promise<void> {
    await this.run(["upload", "--fqbn", fqbn, "--port", port, sketchDir], events);
  }

  async ensureCoreInstalled(coreId: string, events: ArduinoCliEvents = {}): Promise<void> {
    await this.run(["core", "install", coreId], events);
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

    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, args, { windowsHide: true });
      let stderr = "";

      child.stdout.on("data", (data: Buffer) => events.onStdout?.(data.toString("utf8")));
      child.stderr.on("data", (data: Buffer) => {
        const text = data.toString("utf8");
        stderr += text;
        events.onStderr?.(text);
      });

      child.on("error", (error) => {
        this.busy = false;
        reject(error);
      });

      child.on("close", (exitCode) => {
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
