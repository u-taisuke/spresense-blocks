import { ipcMain } from "electron";
import {
  AVAILABLE_VOICES,
  copyVoicesToDrive,
  getAvailableVoices,
  listRemovableDrives,
  type VoiceName,
} from "../sdcard.js";

export type CopyVoicesResult = { ok: true; copiedVoices: string[] } | { ok: false; error: string };

const DRIVE_LETTER_PATTERN = /^[A-Za-z]:$/;

function isVoiceName(value: string): value is VoiceName {
  return (AVAILABLE_VOICES as readonly string[]).includes(value);
}

export function registerSdCardIpc(): void {
  ipcMain.handle("sdcard:listDrives", async () => listRemovableDrives());

  ipcMain.handle("sdcard:listVoices", async () => getAvailableVoices());

  ipcMain.handle(
    "sdcard:copyVoices",
    async (_event, args: { driveLetter: string; voices: string[] }): Promise<CopyVoicesResult> => {
      if (!DRIVE_LETTER_PATTERN.test(args.driveLetter)) {
        return { ok: false, error: `不正なドライブ指定です: ${args.driveLetter}` };
      }
      // レンダラーから届く文字列は自由入力ではなくチェックボックスの選択結果だが、
      // 念のためここでも既知の音色名だけに絞ってからファイルコピーに渡す。
      const voices = args.voices.filter(isVoiceName);
      try {
        const result = copyVoicesToDrive(args.driveLetter, voices);
        return { ok: true, copiedVoices: result.copiedVoices };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    }
  );
}
