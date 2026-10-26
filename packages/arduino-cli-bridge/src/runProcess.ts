import { spawn } from "node:child_process";

/** 子プロセスを時間切れで打ち切ったときのエラー。`kind` でどちらの上限に引っかかったかが分かる。 */
export class ProcessTimeoutError extends Error {
  constructor(
    /** "total" = 開始からの上限時間を超えた / "idle" = 何も出力しないまま上限時間が過ぎた */
    public readonly kind: "total" | "idle",
    public readonly timeoutMs: number
  ) {
    super(
      kind === "idle"
        ? `${Math.round(timeoutMs / 1000)}秒間なにも出力されなかったため打ち切りました`
        : `${Math.round(timeoutMs / 1000)}秒を超えたため打ち切りました`
    );
    this.name = "ProcessTimeoutError";
  }
}

export interface RunProcessOptions {
  /** 子プロセスの環境変数。省略すると親プロセスのものをそのまま使う。 */
  env?: NodeJS.ProcessEnv;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  /** 開始からの上限時間。 */
  totalTimeoutMs: number;
  /**
   * 指定すると、標準出力・標準エラーのどちらにも何も出ないまま この時間が過ぎたら打ち切る。
   * ダウンロードのように「遅くても進んでいれば待ち続けたいが、止まったら早めに諦めたい」処理用。
   */
  idleTimeoutMs?: number;
}

export interface RunProcessResult {
  exitCode: number | null;
  stderr: string;
}

/** 子プロセスを1つ実行し、終了を待つ。時間切れの場合はプロセスを止めて ProcessTimeoutError で失敗する。 */
export function runProcess(command: string, args: string[], options: RunProcessOptions): Promise<RunProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, env: options.env });
    let stderr = "";
    let settled = false;
    let totalTimer: ReturnType<typeof setTimeout> | undefined;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (settle: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(totalTimer);
      clearTimeout(idleTimer);
      settle();
    };
    const timeOut = (kind: "total" | "idle", timeoutMs: number): void => {
      finish(() => {
        child.kill();
        reject(new ProcessTimeoutError(kind, timeoutMs));
      });
    };
    const resetIdleTimer = (): void => {
      const idleTimeoutMs = options.idleTimeoutMs;
      if (idleTimeoutMs === undefined || settled) {
        return;
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => timeOut("idle", idleTimeoutMs), idleTimeoutMs);
    };

    totalTimer = setTimeout(() => timeOut("total", options.totalTimeoutMs), options.totalTimeoutMs);
    resetIdleTimer();

    child.stdout?.on("data", (data: Buffer) => {
      resetIdleTimer();
      options.onStdout?.(data.toString("utf8"));
    });
    child.stderr?.on("data", (data: Buffer) => {
      resetIdleTimer();
      const text = data.toString("utf8");
      stderr += text;
      options.onStderr?.(text);
    });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (exitCode) => finish(() => resolve({ exitCode, stderr })));
  });
}
