import { ipcMain } from "electron";
import { loadSampleManifest, readSample, readTutorial, type OpenSampleResult, type SampleInfo } from "../content.js";

/** サンプル一覧・サンプルの読み込み・チュートリアル本文を、レンダラーに提供する。 */
export function registerContentIpc(contentRoot: string): void {
  ipcMain.handle("content:listSamples", async (): Promise<SampleInfo[]> => loadSampleManifest(contentRoot));

  ipcMain.handle(
    "content:openSample",
    async (_event, file: string): Promise<OpenSampleResult> => readSample(contentRoot, String(file))
  );

  ipcMain.handle("content:readTutorial", async (): Promise<string> => readTutorial(contentRoot));
}
