/**
 * .sprsb プロジェクトファイルの形式。
 *
 * Blockly本体のバージョンを上げたときは、保存→読込のラウンドトリップが壊れていないか
 * 必ず確認すること(architecture.md 参照)。将来フォーマットを変える必要が出た場合は
 * schemaVersion を上げ、読込側で分岐できるようにする。
 */
export const PROJECT_SCHEMA_VERSION = 1;

export interface ProjectFile {
  schemaVersion: number;
  boardId: string;
  workspace: unknown;
}
