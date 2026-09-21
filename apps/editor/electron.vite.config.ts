import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// @spresense-blocks/* は npm workspaces で node_modules にシンボリックリンクされる
// TypeScript ソースのままのパッケージなので、外部化(externalize)せず Vite に
// バンドル・トランスパイルさせる。外部化すると Electron の Node ランタイムが
// .ts ファイルを直接 import しようとして落ちるため。
const workspacePackages = [
  "@spresense-blocks/arduino-cli-bridge",
  "@spresense-blocks/board-spresense",
  "@spresense-blocks/codegen-core",
  "@spresense-blocks/block-pack-core-io",
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [react()],
  },
});
