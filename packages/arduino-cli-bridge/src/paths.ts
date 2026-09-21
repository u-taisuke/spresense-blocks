/**
 * arduino-cli 実行バイナリの解決。
 *
 * Phase 0 では「開発機に arduino-cli がインストール済みで PATH が通っている」ことを前提にする
 * （実装計画のPhase 0スコープ: ブートストラップはまだ作らない）。
 * Phase 2 で OS別にバンドルしたバイナリを Electron の resources ディレクトリから
 * 解決するロジックに差し替える（このファイルの責務を変えずに中身だけ拡張する）。
 */
export function resolveArduinoCliPath(): string {
  const override = process.env.SPRESENSE_BLOCKS_ARDUINO_CLI_PATH;
  if (override) {
    return override;
  }
  return process.platform === "win32" ? "arduino-cli.exe" : "arduino-cli";
}
