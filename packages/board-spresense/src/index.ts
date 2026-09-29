import boardJson from "../board.json" with { type: "json" };
import pinsJson from "../pins.json" with { type: "json" };
import sensorAddonJson from "../sensorAddon.json" with { type: "json" };

export interface BoardDefinition {
  id: string;
  displayName: string;
  package: string;
  architecture: string;
  boardKey: string;
  fqbn: string;
  boardManagerUrl: string;
  coreId: string;
  /** アプリが自動インストールする SPRESENSE コアのバージョン(固定)。 */
  coreVersion: string;
  /** アプリが自動ダウンロードする arduino-cli 本体のバージョン(固定)。 */
  arduinoCliVersion: string;
}

export interface OnboardLed {
  id: string;
  label: string;
}

export interface PinDefinition {
  id: string;
  label: string;
}

export interface PinMap {
  onboardLeds: OnboardLed[];
  digitalPins: PinDefinition[];
  analogPins: PinDefinition[];
  pwmCapablePins: string[];
}

export const board: BoardDefinition = boardJson;
export const pins: PinMap = pinsJson as PinMap;

/**
 * arduino-cli ライブラリの依存情報。
 * `libraryManagerName` があれば `lib install <name>` で、`gitUrl` があれば
 * `lib install --git-url <url>` でインストールする(両方同時に指定はしない)。
 */
export interface LibraryDependency {
  /** `arduino-cli lib list` に表示される名前。インストール済み判定に使う。 */
  name: string;
  libraryManagerName?: string;
  /** 末尾に `#<commit-sha>` を含め、必ずコミットを固定すること。 */
  gitUrl?: string;
}

export const sensorAddonLibraries: LibraryDependency[] = sensorAddonJson.libraries;

/** `arduino-cli core install` に渡す、バージョン固定済みのターゲット文字列。 */
export const boardCoreInstallTarget = `${board.coreId}@${board.coreVersion}`;

/**
 * `arduino-cli board list` が返す検出結果が、この SPRESENSE ボード定義と一致するかを判定する。
 * FQBN のパッケージ名(`SPRESENSE:`)を最優先で見て、念のため表示名(`Spresense`)にも一致させる
 * (どちらか片方しか取れない arduino-cli のバージョン差異に備えるため)。
 * USBポートの自動選択(初回選択・後から接続したときの切り替え)に使う。
 */
export function isSpresenseDetectedBoard(detected: { fqbn?: string; boardName?: string }): boolean {
  if (detected.fqbn?.startsWith(`${board.package}:`)) {
    return true;
  }
  return detected.boardName?.toLowerCase().includes("spresense") ?? false;
}
