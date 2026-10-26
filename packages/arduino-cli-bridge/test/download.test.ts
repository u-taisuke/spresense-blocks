import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { downloadFile, formatDownloadProgress } from "../src/installer.js";
import { proxyUrlFromPacResult } from "../src/proxy.js";

/** 1チャンクずつ `intervalMs` おきに送るテスト用サーバー。`stallAfter` チャンク送ったら黙り込む。 */
function startServer(options: { chunks: number; chunkSize: number; intervalMs: number; stallAfter?: number }): Promise<{
  server: Server;
  url: string;
}> {
  const server = createServer((_req, res: ServerResponse) => {
    res.writeHead(200, { "content-length": String(options.chunks * options.chunkSize) });
    let sent = 0;
    const timer = setInterval(() => {
      if (options.stallAfter !== undefined && sent >= options.stallAfter) {
        return; // 接続は開いたまま、何も送らない(ファイアウォールが無応答で固めた状態を模擬)
      }
      res.write(Buffer.alloc(options.chunkSize, 0x61));
      sent++;
      if (sent === options.chunks) {
        clearInterval(timer);
        res.end();
      }
    }, options.intervalMs);
    res.on("close", () => clearInterval(timer));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}/file.zip` });
    });
  });
}

describe("downloadFile", () => {
  let server: Server | undefined;
  afterEach(() => {
    server?.closeAllConnections();
    server?.close();
    server = undefined;
  });

  it("遅くても進み続けていれば、「止まった」判定の時間より長くかかっても最後まで受け取る", async () => {
    // 合計 約1.2秒かかるが、データは 100ms ごとに届くので、400ms の判定では打ち切られない
    // (以前の実装は合計時間で打ち切っていたため、遅い回線では必ず失敗していた)
    const started = await startServer({ chunks: 12, chunkSize: 1000, intervalMs: 100 });
    server = started.server;
    const progress: Array<[number, number | null]> = [];

    const buffer = await downloadFile(started.url, {
      attempts: 1,
      stallTimeoutMs: 400,
      onProgress: (received, total) => progress.push([received, total]),
    });

    expect(buffer.length).toBe(12_000);
    expect(progress.at(-1)).toEqual([12_000, 12_000]);
  });

  it("データが届かなくなったら、止まったと判断して失敗する(永久に待たない)", async () => {
    const started = await startServer({ chunks: 10, chunkSize: 1000, intervalMs: 50, stallAfter: 3 });
    server = started.server;

    const startedAt = Date.now();
    const error = await downloadFile(started.url, { attempts: 2, stallTimeoutMs: 300, retryDelayMs: 10 }).catch(
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("2回試しましたが");
    expect(String(error)).toContain("データが届かなかった");
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });

  it("差し替えた fetch(Electron の net.fetch など)を使ってダウンロードする", async () => {
    const calls: string[] = [];
    const buffer = await downloadFile("https://example.invalid/a.zip", {
      attempts: 1,
      fetchImpl: async (url) => {
        calls.push(url);
        return new Response("abc", { headers: { "content-length": "3" } });
      },
    });
    expect(calls).toEqual(["https://example.invalid/a.zip"]);
    expect(buffer.toString()).toBe("abc");
  });

  it("HTTP エラーはリトライしたうえで、URL 付きのエラーにする", async () => {
    let count = 0;
    const error = await downloadFile("https://example.invalid/missing.zip", {
      attempts: 3,
      retryDelayMs: 1,
      fetchImpl: async () => {
        count++;
        return new Response("not found", { status: 404, statusText: "Not Found" });
      },
    }).catch((e: unknown) => e);
    expect(count).toBe(3);
    expect(String(error)).toContain("HTTP 404");
    expect(String(error)).toContain("https://example.invalid/missing.zip");
  });
});

describe("formatDownloadProgress", () => {
  it("全体の大きさが分かるときは割合も出す", () => {
    expect(formatDownloadProgress(3 * 1024 * 1024, 12 * 1024 * 1024)).toBe("3.0 / 12.0 MB (25%)");
  });
  it("全体の大きさが分からないときは受信量だけ出す", () => {
    expect(formatDownloadProgress(1.5 * 1024 * 1024, null)).toBe("1.5 MB");
  });
});

describe("proxyUrlFromPacResult", () => {
  it("DIRECT や空文字はプロキシ無し", () => {
    expect(proxyUrlFromPacResult("DIRECT")).toBeNull();
    expect(proxyUrlFromPacResult("")).toBeNull();
  });
  it("PROXY / HTTPS / SOCKS をそれぞれの URL にする", () => {
    expect(proxyUrlFromPacResult("PROXY proxy.example.ac.jp:8080")).toBe("http://proxy.example.ac.jp:8080");
    expect(proxyUrlFromPacResult("HTTPS secure.example:443")).toBe("https://secure.example:443");
    expect(proxyUrlFromPacResult("SOCKS5 127.0.0.1:1080")).toBe("socks5://127.0.0.1:1080");
    expect(proxyUrlFromPacResult("SOCKS 127.0.0.1:1080")).toBe("socks5://127.0.0.1:1080");
  });
  it("複数ある場合は、DIRECT を飛ばして最初のプロキシを使う", () => {
    expect(proxyUrlFromPacResult("PROXY a:1; PROXY b:2; DIRECT")).toBe("http://a:1");
    expect(proxyUrlFromPacResult("DIRECT; PROXY b:2")).toBe("http://b:2");
  });
});
