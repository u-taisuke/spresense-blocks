import { app, dialog, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import type { SampleInfo } from "./content.js";

export const USB_DRIVER_HELP_URL = "https://developer.sony.com/develop/spresense/";

/**
 * メニューバーからレンダラーに依頼する操作。レンダラー側は、ツールバーのボタンと同じ処理を呼ぶ
 * (preload の onMenuAction で受け取る)。
 */
export type MenuAction =
  | { type: "open" }
  | { type: "save" }
  | { type: "openSample"; file: string }
  | { type: "showSamples" }
  | { type: "showTutorial" }
  | { type: "toggleCode" };

/**
 * アプリのメニューバー(日本語)を組み立てる。
 * Electron既定の英語メニュー(File/Edit/View/Window/Help)の代わりに使う。
 * 「編集」「表示」の項目は既定メニューと同じ role を使っているので、
 * コピー・貼り付けや拡大・縮小などの挙動は既定メニューのときと変わらない。
 */
export function buildAppMenu(getWindow: () => BrowserWindow | null, samples: SampleInfo[]): Menu {
  const send = (action: MenuAction): void => {
    getWindow()?.webContents.send("menu:action", action);
  };

  const sampleItems: MenuItemConstructorOptions[] = samples.map((sample) => {
    const number = sample.file.match(/^(\d+)_/)?.[1];
    return {
      label: number ? `${number}  ${sample.title}` : sample.title,
      click: () => send({ type: "openSample", file: sample.file }),
    };
  });

  const template: MenuItemConstructorOptions[] = [
    {
      label: "ファイル",
      submenu: [
        { label: "開く…", accelerator: "CmdOrCtrl+O", click: () => send({ type: "open" }) },
        { label: "保存", accelerator: "CmdOrCtrl+S", click: () => send({ type: "save" }) },
        { type: "separator" },
        { label: "終了", role: "quit" },
      ],
    },
    {
      label: "編集",
      submenu: [
        { label: "元に戻す", role: "undo" },
        { label: "やり直す", role: "redo" },
        { type: "separator" },
        { label: "切り取り", role: "cut" },
        { label: "コピー", role: "copy" },
        { label: "貼り付け", role: "paste" },
        { label: "すべて選択", role: "selectAll" },
      ],
    },
    {
      label: "表示",
      submenu: [
        {
          label: "C++コードを表示 / 隠す",
          accelerator: "CmdOrCtrl+Shift+C",
          // レンダラー側でも Ctrl+Shift+C を受け取っているため、ここではショートカットの表示だけにする
          // (メニュー側でも登録すると、1回押しただけで2回切り替わってしまう)。
          registerAccelerator: false,
          click: () => send({ type: "toggleCode" }),
        },
        { type: "separator" },
        { label: "拡大", role: "zoomIn" },
        { label: "縮小", role: "zoomOut" },
        { label: "元の大きさ", role: "resetZoom" },
        { type: "separator" },
        { label: "全画面表示", role: "togglefullscreen" },
        { type: "separator" },
        { label: "開発者ツール", role: "toggleDevTools" },
      ],
    },
    {
      label: "サンプル",
      submenu: [
        { label: "サンプル一覧を開く…", click: () => send({ type: "showSamples" }) },
        { type: "separator" },
        ...sampleItems,
      ],
    },
    {
      label: "ヘルプ",
      submenu: [
        { label: "チュートリアル", accelerator: "F1", click: () => send({ type: "showTutorial" }) },
        { type: "separator" },
        { label: "USBが認識されないとき", click: () => shell.openExternal(USB_DRIVER_HELP_URL) },
        { type: "separator" },
        {
          label: "バージョン情報",
          click: () => {
            const win = getWindow();
            const options = {
              type: "info" as const,
              title: "バージョン情報",
              message: `Spresense Blocks ${app.getVersion()}`,
              detail: "SPRESENSEをブロックでプログラミングできるアプリです。",
            };
            if (win) {
              dialog.showMessageBox(win, options);
            } else {
              dialog.showMessageBox(options);
            }
          },
        },
      ],
    },
  ];

  if (process.platform === "darwin") {
    template.unshift({ role: "appMenu" });
  }

  return Menu.buildFromTemplate(template);
}
