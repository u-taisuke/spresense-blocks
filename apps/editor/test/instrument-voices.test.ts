import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import {
  installBlocks as installInstrumentBlocks,
  installMessages as installInstrumentMessages,
} from "@spresense-blocks/block-pack-instrument";

/**
 * 「ゆる楽器」の音色は、次の4か所で名前がそろっている必要がある。どれか1つを変え忘れると、
 * 選べるのに音が鳴らない(SDカードにコピーされない、音源ファイルが無い)音色ができてしまう。
 *   - ブロックの「音色」ドロップダウン(packages/block-packs/instrument/src/blocks.ts)
 *   - SDカードにコピーする音色の一覧(apps/editor/src/main/sdcard.ts の AVAILABLE_VOICES)
 *   - 同梱の音源フォルダ(apps/editor/resources/instrument-sounds/<音色>/)
 *   - 「音源コピー」画面の表示名(apps/editor/src/renderer/src/SdCardPanel.tsx)
 */
const EDITOR_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOUNDS_DIR = join(EDITOR_DIR, "resources", "instrument-sounds");

/** blocks.ts の NOTE_OPTIONS / generators.ts の NOTE_TABLE と同じ14音。 */
const NOTE_FILES = [
  "48_C3", "50_D3", "52_E3", "53_F3", "55_G3", "57_A3", "59_B3",
  "60_C4", "62_D4", "64_E4", "65_F4", "67_G4", "69_A4", "71_B4",
].map((name) => `${name}.wav`);

function blockVoiceOptions(): string[] {
  const workspace = new Blockly.Workspace();
  const block = workspace.newBlock("spresense_instrument_setup");
  const field = block.getField("VOICE") as Blockly.FieldDropdown;
  return field.getOptions(false).map(([, value]) => value);
}

function availableVoicesInSdcardTs(): string[] {
  const source = readFileSync(join(EDITOR_DIR, "src", "main", "sdcard.ts"), "utf8");
  const match = source.match(/AVAILABLE_VOICES = \[([^\]]*)\]/);
  return [...(match?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("ゆる楽器の音色", () => {
  beforeAll(() => {
    if (!Blockly.Blocks["spresense_instrument_setup"]) {
      installInstrumentMessages();
      installInstrumentBlocks();
    }
  });

  it("offers the same voices in the block and in the SD card copy list", () => {
    expect(blockVoiceOptions()).toEqual(availableVoicesInSdcardTs());
    expect(blockVoiceOptions()).toEqual(["Piano", "Sax", "Organ", "Glock", "Chip"]);
  });

  it("uses folder names that are safe on FAT-formatted SD cards (8 alphanumeric characters or fewer)", () => {
    for (const voice of availableVoicesInSdcardTs()) {
      expect(voice, voice).toMatch(/^[A-Za-z0-9]{1,8}$/);
    }
  });

  it("bundles all 14 notes for every voice, as 48kHz/16bit/2ch PCM WAV files", () => {
    for (const voice of availableVoicesInSdcardTs()) {
      const files = readdirSync(join(SOUNDS_DIR, voice)).sort();
      expect(files, voice).toEqual([...NOTE_FILES].sort());
      for (const file of files) {
        const header = readFileSync(join(SOUNDS_DIR, voice, file)).subarray(0, 36);
        const label = `${voice}/${file}`;
        expect(header.toString("ascii", 0, 4), label).toBe("RIFF");
        expect(header.toString("ascii", 8, 12), label).toBe("WAVE");
        expect(header.readUInt16LE(20), `${label} format`).toBe(1); // PCM
        expect(header.readUInt16LE(22), `${label} channels`).toBe(2);
        expect(header.readUInt32LE(24), `${label} sample rate`).toBe(48000);
        expect(header.readUInt16LE(34), `${label} bit depth`).toBe(16);
      }
    }
  });

  it("has a Japanese label for every voice on the SD card copy screen", () => {
    const panel = readFileSync(join(EDITOR_DIR, "src", "renderer", "src", "SdCardPanel.tsx"), "utf8");
    for (const voice of availableVoicesInSdcardTs()) {
      expect(panel, voice).toMatch(new RegExp(`\\b${voice}: "[^"]+"`));
    }
  });
});
