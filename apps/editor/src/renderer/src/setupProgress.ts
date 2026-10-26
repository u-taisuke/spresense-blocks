/** セットアップ画面に出す詳細行の最大文字数(長いログ1行でカードが崩れないように)。 */
const MAX_DETAIL_LENGTH = 100;

/**
 * arduino-cli の生ログの断片(進捗バーの `\r` や色付けの制御文字を含む)から、
 * セットアップ画面に「いま何をしているか」として出す最後の1行を取り出す。
 * 表示する内容が無い断片なら空文字を返す。
 */
export function summarizeProgressDetail(raw: string): string {
  const lines = raw
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .split(/[\r\n]+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
  const last = lines.at(-1) ?? "";
  return last.length > MAX_DETAIL_LENGTH ? `${last.slice(0, MAX_DETAIL_LENGTH)}…` : last;
}
