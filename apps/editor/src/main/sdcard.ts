import { execFile } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { app } from "electron";

const execFileAsync = promisify(execFile);

/**
 * アプリに同梱している音色(音源フォルダ名)。
 * 実体のWAVファイルは apps/editor/resources/instrument-sounds/<voice>/ にあり、
 * packages/block-packs/instrument/tools/generate-sound-assets.py で生成したもの。
 * ここでの並び・名前は packages/block-packs/instrument/src/blocks.ts の VOICE_OPTIONS と一致させること。
 */
export const AVAILABLE_VOICES = ["Piano", "Sax", "Organ", "Glock", "Chip"] as const;
export type VoiceName = (typeof AVAILABLE_VOICES)[number];

export interface RemovableDrive {
  /** 例: "E:" */
  driveLetter: string;
  volumeName: string;
  totalBytes: number;
  freeBytes: number;
}

/**
 * 音源WAVファイルの同梱場所を解決する。
 * 開発時(`npm run dev`)は `app.getAppPath()` が apps/editor ディレクトリそのものを指すので、
 * そのまま `resources/` を見る。パッケージ後は electron-builder の `extraResources` 設定
 * (electron-builder.yml)によって `process.resourcesPath/resources/` に実体がコピーされる。
 */
function resolveAssetsRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "resources", "instrument-sounds");
  }
  return join(app.getAppPath(), "resources", "instrument-sounds");
}

/** 実際にWAVファイルが同梱されている(=SDカードにコピー可能な)音色一覧を返す。 */
export function getAvailableVoices(): VoiceName[] {
  const root = resolveAssetsRoot();
  return AVAILABLE_VOICES.filter((voice) => existsSync(join(root, voice)));
}

/**
 * リムーバブルディスク(SDカードリーダー等)の一覧を取得する。
 * SPRESENSE本体はUSB接続時にSDカードをドライブとして見せないため(書き込み用のUSB-シリアルポートのみ)、
 * ユーザーが物理的にmicroSDカードを取り外し、PC本体やUSBカードリーダーに挿す運用を前提にしている。
 * Windows専用(PowerShellのWin32_LogicalDiskを使用)。
 */
export async function listRemovableDrives(): Promise<RemovableDrive[]> {
  if (process.platform !== "win32") {
    return [];
  }
  const script =
    "Get-CimInstance -ClassName Win32_LogicalDisk -Filter \"DriveType=2\" | " +
    "Select-Object DeviceID,VolumeName,Size,FreeSpace | ConvertTo-Json -Compress";
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      timeout: 15000,
    }));
  } catch (error) {
    throw new Error(`リムーバブルドライブの取得に失敗しました: ${String(error)}`);
  }

  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }
  const parsed: unknown = JSON.parse(trimmed);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.map((row) => {
    const r = row as { DeviceID?: string; VolumeName?: string; Size?: number; FreeSpace?: number };
    return {
      driveLetter: String(r.DeviceID ?? ""),
      volumeName: String(r.VolumeName ?? ""),
      totalBytes: Number(r.Size ?? 0),
      freeBytes: Number(r.FreeSpace ?? 0),
    };
  });
}

/**
 * 指定した音色フォルダを丸ごと、指定したドライブのルート直下にコピーする。
 * ブロック側(spresense_instrument_setup)が生成するパス("Piano/60_C4.wav"等)と
 * フォルダ名を一致させる必要がある。
 */
export function copyVoicesToDrive(driveLetter: string, voices: VoiceName[]): { copiedVoices: string[] } {
  const root = resolveAssetsRoot();
  const copiedVoices: string[] = [];
  for (const voice of voices) {
    const src = join(root, voice);
    if (!existsSync(src)) {
      continue;
    }
    const dest = join(`${driveLetter}\\`, voice);
    cpSync(src, dest, { recursive: true });
    copiedVoices.push(voice);
  }
  return { copiedVoices };
}
