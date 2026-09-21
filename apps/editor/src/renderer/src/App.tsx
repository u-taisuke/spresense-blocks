import { useCallback, useEffect, useRef, useState } from "react";
import { BlocklyWorkspace, type BlocklyWorkspaceHandle } from "./BlocklyWorkspace";
import { PortSelect } from "./PortSelect";
import type { DetectedBoard } from "@spresense-blocks/arduino-cli-bridge";
import { board, isSpresenseDetectedBoard } from "@spresense-blocks/board-spresense";
import { PROJECT_SCHEMA_VERSION, type ProjectFile } from "./project";

// SPRESENSEを後から挿したときの自動検出のためのポーリング間隔。
// `arduino-cli board list` 自体が数秒かかるため、固定間隔のsetIntervalではなく
// 「前回の完了を待ってから次を予約する」方式にし、二重実行による
// ArduinoCliBusyError の連発を避ける。
const PORT_WATCH_INTERVAL_MS = 2000;

export function App(): React.JSX.Element {
  const [code, setCode] = useState("");
  const [ports, setPorts] = useState<DetectedBoard[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [isRefreshingPorts, setIsRefreshingPorts] = useState(false);
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const blocklyRef = useRef<BlocklyWorkspaceHandle>(null);
  const busyRef = useRef(busy);
  const previousPortIdsRef = useRef<string[]>([]);
  // 「検索中に、もう一度検索が呼ばれる」状況(React StrictModeでの二重初期化、
  // ドロップダウンを開いた直後にバックグラウンド監視が重なる、等)に備えて、
  // 実行中の検索があれば新しく arduino-cli を起動せず、その Promise に相乗りする。
  // main プロセス側のシングルフライト保護(ArduinoCliClient)は最後の砦であり、
  // ここでの重複自体をそもそも起こさないための対策。
  const inFlightRefreshRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    return window.spresense.onLog((entry) => {
      setLog((prev) => prev + entry.chunk);
    });
  }, []);

  const refreshPorts = useCallback((options?: { silent?: boolean }): Promise<void> => {
    if (inFlightRefreshRef.current) {
      return inFlightRefreshRef.current;
    }

    const promise = (async () => {
      setIsRefreshingPorts(true);
      try {
        const boards = await window.spresense.listBoards();
        const previousPortIds = previousPortIdsRef.current;
        previousPortIdsRef.current = boards.map((b) => b.port);
        setPorts(boards);

        setSelectedPort((prev) => {
          // 前回は無かった(=今回新しく挿された)SPRESENSEがあれば、それを最優先で選ぶ。
          // これで「最初の自動選択」と「後から挿したときの自動切り替え」の両方をカバーできる
          // (アプリ起動直後は previousPortIds が空なので、既に挿さっているSPRESENSEも
          // 「新しく見つかった」扱いになり、そのまま初回の自動選択として働く)。
          const newlyAppearedSpresense = boards.find(
            (b) => isSpresenseDetectedBoard(b) && !previousPortIds.includes(b.port)
          );
          if (newlyAppearedSpresense) {
            return newlyAppearedSpresense.port;
          }
          // 選択中のポートがまだ一覧にあればそのまま維持する(ユーザーが手で選んだ場合を尊重)。
          if (prev && boards.some((b) => b.port === prev)) {
            return prev;
          }
          // 選択が無効になった(抜かれた等)場合は、SPRESENSEを優先しつつ先頭にフォールバックする。
          return boards.find(isSpresenseDetectedBoard)?.port ?? boards[0]?.port ?? "";
        });
      } catch (error) {
        if (!options?.silent) {
          setLog((prev) => `${prev}\nポート一覧の取得に失敗しました: ${String(error)}\n`);
        }
      } finally {
        setIsRefreshingPorts(false);
      }
    })();

    inFlightRefreshRef.current = promise;
    promise.finally(() => {
      inFlightRefreshRef.current = null;
    });
    return promise;
  }, []);

  // 起動直後に一度読み込んだあと、SPRESENSEを後から挿したときも自動検出できるように
  // バックグラウンドで見張り続ける(ドロップダウンを開かなくても反映される)。
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const watch = async (): Promise<void> => {
      // コンパイル・書き込み中は arduino-cli が既に実行中(シングルフライト)なので
      // 監視をスキップし、無駄なエラーを起こさないようにする。
      if (!busyRef.current) {
        await refreshPorts({ silent: true });
      }
      if (!cancelled) {
        timeoutId = setTimeout(watch, PORT_WATCH_INTERVAL_MS);
      }
    };

    refreshPorts();
    timeoutId = setTimeout(watch, PORT_WATCH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [refreshPorts]);

  const handleSave = useCallback(async () => {
    const state = blocklyRef.current?.getState();
    if (!state) {
      return;
    }
    const project: ProjectFile = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      boardId: board.id,
      workspace: state,
    };
    try {
      const savedPath = await window.spresense.saveProject(project, currentFilePath);
      if (savedPath) {
        setCurrentFilePath(savedPath);
        setLog((prev) => `${prev}\n保存しました: ${savedPath}\n`);
      }
    } catch (error) {
      setLog((prev) => `${prev}\n保存に失敗しました: ${String(error)}\n`);
    }
  }, [currentFilePath]);

  const handleOpen = useCallback(async () => {
    try {
      const result = await window.spresense.openProject();
      if (!result) {
        return;
      }
      const project = result.data as ProjectFile;
      blocklyRef.current?.loadState(project.workspace);
      setCurrentFilePath(result.path);
      setLog((prev) => `${prev}\n開きました: ${result.path}\n`);
    } catch (error) {
      setLog((prev) => `${prev}\n開けませんでした: ${String(error)}\n`);
    }
  }, []);

  const handleBuild = useCallback(async () => {
    if (!selectedPort) {
      window.alert("USBポートが選ばれていません。SPRESENSEをUSBで接続してからポートを選んでください。");
      return;
    }
    setBusy(true);
    setLog("");
    try {
      await window.spresense.compileAndUpload(code, selectedPort);
      setLog((prev) => `${prev}\n書き込みが完了しました。SPRESENSEの動きを確認してください。\n`);
    } catch (error) {
      setLog((prev) => `${prev}\nエラーが発生しました: ${String(error)}\n`);
    } finally {
      setBusy(false);
    }
  }, [code, selectedPort]);

  const fileName = currentFilePath?.split(/[/\\]/).pop() ?? "(名前未設定)";

  return (
    <div className="app">
      <header className="toolbar">
        <span className="title">Spresense Blocks</span>
        <span className="file-name" title={currentFilePath ?? ""}>
          {fileName}
        </span>
        <button type="button" onClick={handleOpen} disabled={busy}>
          開く
        </button>
        <button type="button" onClick={handleSave} disabled={busy}>
          保存
        </button>
        <PortSelect
          ports={ports}
          selectedPort={selectedPort}
          isRefreshing={isRefreshingPorts}
          disabled={busy}
          onOpen={() => refreshPorts()}
          onSelect={setSelectedPort}
        />
        <button type="button" className="primary" onClick={handleBuild} disabled={busy}>
          {busy ? "書き込み中..." : "コンパイル & 書き込み"}
        </button>
      </header>
      <main className="main">
        <BlocklyWorkspace ref={blocklyRef} onCodeChange={setCode} />
        <pre className="log">{log || "ここにビルドログが表示されます。"}</pre>
      </main>
    </div>
  );
}
