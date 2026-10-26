import { describe, expect, it } from "vitest";
import { ArduinoCliTimeoutError } from "../src/ArduinoCliClient.js";
import { ProcessTimeoutError, runProcess } from "../src/runProcess.js";

/** node -e で、`intervalMs` ごとに1行出力しながら `durationMs` 動き続けるプロセス。 */
function chattyScript(intervalMs: number, durationMs: number): string[] {
  return [
    "-e",
    `const t = setInterval(() => process.stdout.write("."), ${intervalMs});` +
      `setTimeout(() => { clearInterval(t); process.exit(0); }, ${durationMs});`,
  ];
}

describe("runProcess", () => {
  it("出力が続いている限り、無出力の上限時間より長くかかっても打ち切らない", async () => {
    let output = "";
    const result = await runProcess(process.execPath, chattyScript(50, 1200), {
      totalTimeoutMs: 10_000,
      idleTimeoutMs: 400,
      onStdout: (chunk) => {
        output += chunk;
      },
    });
    expect(result.exitCode).toBe(0);
    expect(output.length).toBeGreaterThan(5);
  });

  it("何も出力しないまま上限時間が過ぎたら idle として打ち切る", async () => {
    const error = await runProcess(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], {
      totalTimeoutMs: 10_000,
      idleTimeoutMs: 300,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProcessTimeoutError);
    expect((error as ProcessTimeoutError).kind).toBe("idle");
  });

  it("出力が続いていても、合計の上限時間を超えたら total として打ち切る", async () => {
    const error = await runProcess(process.execPath, chattyScript(50, 10_000), {
      totalTimeoutMs: 500,
      idleTimeoutMs: 400,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProcessTimeoutError);
    expect((error as ProcessTimeoutError).kind).toBe("total");
  });

  it("env で渡した環境変数が子プロセスに届く", async () => {
    let output = "";
    await runProcess(process.execPath, ["-e", "process.stdout.write(process.env.SPB_TEST_VALUE ?? '')"], {
      env: { ...process.env, SPB_TEST_VALUE: "hello" },
      totalTimeoutMs: 10_000,
      onStdout: (chunk) => {
        output += chunk;
      },
    });
    expect(output).toBe("hello");
  });
});

describe("ArduinoCliTimeoutError", () => {
  it("ダウンロードが止まった(idle)場合は、上限時間切れとは別の説明になる", () => {
    const idle = new ArduinoCliTimeoutError(["core", "install", "SPRESENSE:spresense@3.4.7"], "idle");
    const total = new ArduinoCliTimeoutError(["compile"]);
    expect(idle.kind).toBe("idle");
    expect(idle.message).toContain("止まったまま");
    expect(total.kind).toBe("total");
    expect(total.message).toContain("一定時間たっても終わりませんでした");
  });
});
