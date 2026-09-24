import { ipcMain, type BrowserWindow } from "electron";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArduinoCliClient } from "@spresense-blocks/arduino-cli-bridge";
import { board } from "@spresense-blocks/board-spresense";

const SKETCH_NAME = "spresense_blocks_sketch";

/** Arduino のビルドシステムは「スケッチフォルダ名 == .inoファイル名」を要求するため、専用の一時ディレクトリに書き出す。 */
function writeSketch(code: string): string {
  const parentDir = mkdtempSync(join(tmpdir(), "spresense-blocks-"));
  const sketchDir = join(parentDir, SKETCH_NAME);
  mkdirSync(sketchDir, { recursive: true });
  writeFileSync(join(sketchDir, `${SKETCH_NAME}.ino`), code, "utf8");
  return sketchDir;
}

/**
 * @param client セットアップ処理(SetupManager)が用意した、専用データディレクトリを指す
 *   ArduinoCliClient を渡すこと。ユーザーの既存Arduino環境と衝突させないため。
 */
export function registerArduinoIpc(getWindow: () => BrowserWindow | null, client: ArduinoCliClient): void {
  const sendLog = (channel: "stdout" | "stderr", chunk: string): void => {
    getWindow()?.webContents.send("arduino:log", { channel, chunk });
  };

  ipcMain.handle("arduino:listBoards", async () => {
    return client.listBoards();
  });

  ipcMain.handle(
    "arduino:compileAndUpload",
    async (_event, args: { code: string; port: string }) => {
      const sketchDir = writeSketch(args.code);
      const events = {
        onStdout: (chunk: string) => sendLog("stdout", chunk),
        onStderr: (chunk: string) => sendLog("stderr", chunk),
      };

      sendLog("stdout", `コンパイル中... (${board.fqbn})\n`);
      await client.compile(sketchDir, board.fqbn, events);

      sendLog("stdout", `書き込み中... (port: ${args.port})\n`);
      await client.upload(sketchDir, board.fqbn, args.port, events);
    }
  );
}
