import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as Blockly from "blockly/core";
import * as jaLocale from "blockly/msg/ja"; // Blockly の日本語UIメッセージ(コンテキストメニュー等)
import {
  installBlocks,
  installMessages,
  toolbox as coreIoToolboxCategories,
  generateSketch,
} from "@spresense-blocks/block-pack-core-io";
import { SketchBuilder } from "@spresense-blocks/codegen-core";

Blockly.setLocale(jaLocale as unknown as { [key: string]: string });
installMessages();
installBlocks();

// 各ブロックパックはツールボックス・カテゴリを(複数持つ場合もあるため)配列で提供する。
// 新しいパックを追加するときは、ここに ...パック名Categories を足していく。
const toolbox = {
  kind: "categoryToolbox",
  contents: [...coreIoToolboxCategories],
} as const;

// generateSketch は毎回 builder.reset() してから組み立てるので、使い回して問題ない。
const sketchBuilder = new SketchBuilder();

export interface BlocklyWorkspaceProps {
  onCodeChange: (code: string) => void;
}

/** プロジェクトの保存/読込のために、親コンポーネントからワークスペースの状態を出し入れする窓口。 */
export interface BlocklyWorkspaceHandle {
  getState(): unknown;
  /** 現在のワークスペースを空にしてから、渡した状態を読み込む。 */
  loadState(state: unknown): void;
}

export const BlocklyWorkspace = forwardRef<BlocklyWorkspaceHandle, BlocklyWorkspaceProps>(
  function BlocklyWorkspace({ onCodeChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
    const onCodeChangeRef = useRef(onCodeChange);
    onCodeChangeRef.current = onCodeChange;

    useImperativeHandle(
      ref,
      () => ({
        getState: () => {
          const workspace = workspaceRef.current;
          return workspace ? Blockly.serialization.workspaces.save(workspace) : null;
        },
        loadState: (state) => {
          const workspace = workspaceRef.current;
          if (!workspace) {
            return;
          }
          workspace.clear();
          Blockly.serialization.workspaces.load(state as never, workspace);
          onCodeChangeRef.current(generateSketch(workspace, sketchBuilder));
        },
      }),
      []
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const workspace = Blockly.inject(container, {
        toolbox: toolbox as unknown as Blockly.utils.toolbox.ToolboxDefinition,
        // Google のサーバー(blockly-demo.appspot.com)から画像/効果音を取得しようとするのを防ぎ、
        // オフラインのローカル環境でも完結させるため、同梱した media アセットを指す。
        media: "./blockly-media/",
        trashcan: true,
        zoom: { controls: true, wheel: true, startScale: 1.0 },
        grid: { spacing: 24, length: 2, colour: "#ddd", snap: true },
      });
      workspaceRef.current = workspace;

      const regenerate = (): void => {
        onCodeChangeRef.current(generateSketch(workspace, sketchBuilder));
      };
      workspace.addChangeListener(regenerate);
      regenerate();

      // 初回は「ずっと」ブロックを1つ置いておく(空の画面から始めさせない)。
      if (workspace.getTopBlocks(false).length === 0) {
        const forever = workspace.newBlock("spresense_forever");
        forever.initSvg();
        forever.render();
        regenerate();
      }

      const handleResize = (): void => Blockly.svgResize(workspace);
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        workspace.removeChangeListener(regenerate);
        workspace.dispose();
        workspaceRef.current = null;
      };
    }, []);

    return <div ref={containerRef} className="blockly-container" />;
  }
);
