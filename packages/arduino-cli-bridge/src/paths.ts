import { join } from "node:path";

/**
 * arduino-cli 関連のファイルをどこに置くかを一元管理する。
 *
 * すべて `appDataDir`(呼び出し側が渡す、アプリ専用のデータディレクトリ。Electronなら
 * `app.getPath('userData')` を想定)の下に閉じ込める。これにより、
 * ユーザーが元々持っている Arduino IDE の設定(`~/.arduino15` 等)には一切触れない。
 */

/** arduino-cli 本体の実行ファイルパス(まだ無ければこれからダウンロードして置く場所)。 */
export function getArduinoCliBinaryPath(appDataDir: string): string {
  const fileName = process.platform === "win32" ? "arduino-cli.exe" : "arduino-cli";
  return join(appDataDir, "arduino-cli", fileName);
}

/** arduino-cli に渡す `--config-file` のパス。中身は installer 側で書き出す。 */
export function getArduinoCliConfigPath(appDataDir: string): string {
  return join(appDataDir, "arduino-cli-config.yaml");
}

/** arduino-cli の `directories.data`(ボードコア・ツール等のインストール先)。 */
export function getArduinoDataDir(appDataDir: string): string {
  return join(appDataDir, "arduino-cli-data");
}

/** arduino-cli の `directories.user`(スケッチ・ライブラリ用。本アプリでは主に未使用だが必須設定)。 */
export function getArduinoUserDir(appDataDir: string): string {
  return join(appDataDir, "arduino-sketches");
}

/**
 * arduino-cli 実行バイナリの解決。
 *
 * 優先順位:
 * 1. 環境変数 `SPRESENSE_BLOCKS_ARDUINO_CLI_PATH`(開発時の上書き用)
 * 2. `appDataDir` が渡されていれば、アプリが自動インストールした先
 * 3. (フォールバック)PATH が通っている前提の素の実行ファイル名
 */
export function resolveArduinoCliPath(appDataDir?: string): string {
  const override = process.env.SPRESENSE_BLOCKS_ARDUINO_CLI_PATH;
  if (override) {
    return override;
  }
  if (appDataDir) {
    return getArduinoCliBinaryPath(appDataDir);
  }
  return process.platform === "win32" ? "arduino-cli.exe" : "arduino-cli";
}
