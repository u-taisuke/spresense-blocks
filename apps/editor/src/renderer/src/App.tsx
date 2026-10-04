import { useCallback, useEffect, useRef, useState } from "react";
import { BlocklyWorkspace, type BlocklyWorkspaceHandle } from "./BlocklyWorkspace";
import { CodeView } from "./CodeView";
import { useConfirmDialog } from "./ConfirmDialog";
import { Icon } from "./Icon";
import { LearnPanel } from "./LearnPanel";
import { TutorialView } from "./TutorialView";
import { PortSelect } from "./PortSelect";
import { SdCardPanel } from "./SdCardPanel";
import { SetupScreen } from "./SetupScreen";
import type { DetectedBoard } from "@spresense-blocks/arduino-cli-bridge";
import { board, isSpresenseDetectedBoard } from "@spresense-blocks/board-spresense";
import { PROJECT_SCHEMA_VERSION, type ProjectFile } from "./project";

// SPRESENSEを後から挿したときの自動検出のためのポーリング間隔。
// `arduino-cli board list` 自体が数秒かかるため、固定間隔のsetIntervalではなく
// 「前回の完了を待ってから次を予約する」方式にし、無駄な二重実行を避ける。
// なお、このポーリングとユーザーの「コンパイル & 書き込み」がたまたま重なっても、
// ArduinoCliClient側がコマンドをキューするため失敗はしない(片方がもう片方の完了を待つだけ)。
const PORT_WATCH_INTERVAL_MS = 2000;

const USB_DRIVER_HELP_URL = "https://developer.sony.com/develop/spresense/";

/** 右パネル上部のバナーに表示する、書き込みの状態。 */
type BuildStatus =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "success" }
  | { kind: "error"; message: string };

type SidePanelTab = "log" | "code";

/**
 * arduino-cli / SPRESENSEコアのセットアップが終わるまでは SetupScreen を表示し、
 * 終わってから初めて実際のブロックエディタ(Editor)をマウントする。
 * こうしないと、まだ arduino-cli 本体が存在しない状態でポート検索等のIPCが先に走ってしまう。
 */
export function App(): React.JSX.Element {
  const [setupReady, setSetupReady] = useState(false);
  const [setupMessage, setSetupMessage] = useState("準備しています…");
  const [setupError, setSetupError] = useState<string | null>(null);

  const runSetup = useCallback(() => {
    setSetupError(null);
    window.spresense.runSetup().then((result) => {
      if (result.ok) {
        setSetupReady(true);
      } else {
        setSetupError(result.error);
      }
    });
  }, []);

  useEffect(() => {
    const unsubscribe = window.spresense.onSetupProgress((event) => {
      setSetupMessage(event.message);
    });
    runSetup();
    return unsubscribe;
  }, [runSetup]);

  if (!setupReady) {
    return <SetupScreen message={setupMessage} error={setupError} onRetry={runSetup} />;
  }

  return <Editor />;
}

function Editor(): React.JSX.Element {
  const [code, setCode] = useState("");
  const [ports, setPorts] = useState<DetectedBoard[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [isRefreshingPorts, setIsRefreshingPorts] = useState(false);
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  // サンプルを開いたときなど、まだファイルに保存していないプログラムの表示名(例: 「サンプル: Lチカ」)。
  const [untitledLabel, setUntitledLabel] = useState("名前未設定");
  const [sdCardPanelOpen, setSdCardPanelOpen] = useState(false);
  const [learnPanelOpen, setLearnPanelOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>("log");
  const [buildStatus, setBuildStatus] = useState<BuildStatus>({ kind: "idle" });
  const blocklyRef = useRef<BlocklyWorkspaceHandle>(null);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  // 「保存していない変更があるか」を、生成されるC++コードが最後に保存・読込したときから
  // 変わったかどうかで判断する(ブロックの位置を動かしただけの変更は対象外になるが、
  // 別のプログラムを開く前の確認としては十分)。
  const codeRef = useRef("");
  const savedCodeRef = useRef<string | null>(null);
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

  // 右パネルの「メッセージ」と「C++コード」のタブ。ツールバーのボタンに加えて、Ctrl+Shift+Cでも切り替えられる。
  const toggleCodeTab = useCallback(() => {
    setSidePanelTab((prev) => (prev === "code" ? "log" : "code"));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        toggleCodeTab();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleCodeTab]);

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

  const handleCodeChange = useCallback((nextCode: string) => {
    codeRef.current = nextCode;
    if (savedCodeRef.current === null) {
      // 起動直後の(「ずっと」だけが置いてある)状態を、変更なしの基準にする。
      savedCodeRef.current = nextCode;
    }
    setCode(nextCode);
  }, []);

  const markSaved = (): void => {
    savedCodeRef.current = codeRef.current;
  };

  /** 保存していない変更があれば、別のプログラムに置き換えてよいか確認する。 */
  const confirmDiscardChanges = async (): Promise<boolean> => {
    if (savedCodeRef.current === null || codeRef.current === savedCodeRef.current) {
      return true;
    }
    return confirm({
      title: "保存していない変更があります",
      message: "今のプログラムは保存されていません。開くと、今のプログラムは消えてしまいます。\n開いてもよいですか？",
      confirmLabel: "開く",
    });
  };

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
        markSaved();
        setLog((prev) => `${prev}\n保存しました: ${savedPath}\n`);
      }
    } catch (error) {
      setLog((prev) => `${prev}\n保存に失敗しました: ${String(error)}\n`);
    }
  }, [currentFilePath]);

  const handleOpen = useCallback(async () => {
    if (!(await confirmDiscardChanges())) {
      return;
    }
    try {
      const result = await window.spresense.openProject();
      if (!result) {
        return;
      }
      const project = result.data as ProjectFile;
      blocklyRef.current?.loadState(project.workspace);
      markSaved();
      setCurrentFilePath(result.path);
      setLog((prev) => `${prev}\n開きました: ${result.path}\n`);
    } catch (error) {
      setLog((prev) => `${prev}\n開けませんでした: ${String(error)}\n`);
    }
  }, []);

  const handleOpenSample = useCallback(async (file: string) => {
    if (!(await confirmDiscardChanges())) {
      return;
    }
    try {
      const result = await window.spresense.openSample(file);
      const project = result.data as ProjectFile;
      blocklyRef.current?.loadState(project.workspace);
      markSaved();
      // 同梱のサンプルファイル自体を上書きしないよう、保存先は未定(保存時にダイアログを出す)にする。
      setCurrentFilePath(null);
      setUntitledLabel(`サンプル: ${result.info.title}`);
      setLearnPanelOpen(false);
      setTutorialOpen(false);
      setLog((prev) => `${prev}\nサンプル「${result.info.title}」を開きました。必要なもの: ${result.info.hardware}\n`);
    } catch (error) {
      setLog((prev) => `${prev}\nサンプルを開けませんでした: ${String(error)}\n`);
    }
  }, []);

  // メニューバーの項目は、ツールバーのボタンと同じ処理を呼ぶ。
  // 最新の handleSave(保存先を覚えている)を使うため、ref経由で呼び出す。
  const menuHandlersRef = useRef({ handleOpen, handleSave, handleOpenSample, toggleCodeTab });
  menuHandlersRef.current = { handleOpen, handleSave, handleOpenSample, toggleCodeTab };
  useEffect(() => {
    return window.spresense.onMenuAction((action) => {
      const handlers = menuHandlersRef.current;
      switch (action.type) {
        case "open":
          handlers.handleOpen();
          break;
        case "save":
          handlers.handleSave();
          break;
        case "openSample":
          handlers.handleOpenSample(action.file);
          break;
        case "showSamples":
          setTutorialOpen(false);
          setLearnPanelOpen(true);
          break;
        case "showTutorial":
          setLearnPanelOpen(false);
          setTutorialOpen(true);
          break;
        case "toggleCode":
          handlers.toggleCodeTab();
          break;
      }
    });
  }, []);

  const handleBuild = useCallback(async () => {
    setSidePanelTab("log");
    if (!selectedPort) {
      setBuildStatus({
        kind: "error",
        message: "USBポートが選ばれていません。SPRESENSEをUSBで接続してから、ポートを選んでください。",
      });
      return;
    }
    // 選んだポートがSPRESENSEとして認識されていない(別の機器、または抜かれた後のポート)ときは、
    // 間違った機器に書き込もうとしていないか、本当に書き込むかを確認する。
    const selectedBoard = ports.find((p) => p.port === selectedPort);
    if (!selectedBoard || !isSpresenseDetectedBoard(selectedBoard)) {
      const portLabel = selectedBoard?.boardName ? `${selectedPort}(${selectedBoard.boardName})` : selectedPort;
      const confirmed = await confirm({
        title: "SPRESENSEが見つかりません",
        message:
          `選ばれているポート「${portLabel}」は、SPRESENSEとして認識されていません。\n` +
          "SPRESENSEがUSBケーブルでつながっているか、ポートの選択が正しいかを確認してください。\n\n" +
          "このまま書き込みますか？",
        confirmLabel: "書き込む",
      });
      if (!confirmed) {
        return;
      }
    }
    setBusy(true);
    setBuildStatus({ kind: "busy" });
    setLog("");
    try {
      await window.spresense.compileAndUpload(code, selectedPort);
      setLog((prev) => `${prev}\n書き込みが完了しました。SPRESENSEの動きを確認してください。\n`);
      setBuildStatus({ kind: "success" });
    } catch (error) {
      setLog((prev) => `${prev}\nエラーが発生しました: ${String(error)}\n`);
      setBuildStatus({
        kind: "error",
        message: "エラーが発生しました。下のメッセージを確認してください。",
      });
    } finally {
      setBusy(false);
    }
  }, [code, selectedPort, ports, confirm]);

  const fileName = currentFilePath?.split(/[/\\]/).pop() ?? untitledLabel;

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Spresense Blocks</span>
        </div>
        <span className="file-chip" title={currentFilePath ?? `${fileName}(まだ保存していません)`}>
          <Icon name="file" size={14} />
          <span className="file-chip-name">{fileName}</span>
        </span>

        <div className="toolbar-group">
          <button type="button" className="tool-button" onClick={handleOpen} disabled={busy} title="保存したプログラムを開きます">
            <Icon name="open" />
            <span className="tool-label">開く</span>
          </button>
          <button type="button" className="tool-button" onClick={handleSave} disabled={busy} title="プログラムをファイルに保存します">
            <Icon name="save" />
            <span className="tool-label">保存</span>
          </button>
        </div>

        <div className="toolbar-spacer" />

        <div className="toolbar-group">
          <PortSelect
            ports={ports}
            selectedPort={selectedPort}
            isRefreshing={isRefreshingPorts}
            disabled={busy}
            onOpen={() => refreshPorts()}
            onSelect={setSelectedPort}
          />
          <button
            type="button"
            className="write-button"
            onClick={handleBuild}
            disabled={busy}
            title="ブロックをプログラムに変換(コンパイル)して、SPRESENSEに書き込みます"
          >
            {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="upload" />}
            <span>{busy ? "書き込み中…" : "書き込む"}</span>
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button
            type="button"
            className="tool-button"
            onClick={() => setLearnPanelOpen(true)}
            title="サンプルプログラムを開いたり、チュートリアル(使い方)を読んだりできます"
          >
            <Icon name="book" />
            <span className="tool-label">サンプル・使い方</span>
          </button>
          <button
            type="button"
            className="tool-button"
            onClick={() => setSdCardPanelOpen(true)}
            title="「ゆる楽器」で使う音源をSDカードにコピーします"
          >
            <Icon name="music" />
            <span className="tool-label">音源コピー</span>
          </button>
          <button
            type="button"
            className={`tool-button${sidePanelTab === "code" ? " is-active" : ""}`}
            onClick={toggleCodeTab}
            aria-pressed={sidePanelTab === "code"}
            title="ブロックから作られたC++のプログラムを表示します(Ctrl+Shift+C)"
          >
            <Icon name="code" />
            <span className="tool-label">コード</span>
          </button>
          <button
            type="button"
            className="tool-button"
            onClick={() => window.spresense.openExternal(USB_DRIVER_HELP_URL)}
            title="USBが認識されないとき: SPRESENSEのドライバーなどの案内ページを開きます"
            aria-label="USBが認識されないとき"
          >
            <Icon name="help" />
          </button>
        </div>
      </header>

      <main className="main">
        <BlocklyWorkspace ref={blocklyRef} onCodeChange={handleCodeChange} />
        <aside className="side-panel">
          <div className="side-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={sidePanelTab === "log"}
              className={`side-tab${sidePanelTab === "log" ? " is-active" : ""}`}
              onClick={() => setSidePanelTab("log")}
            >
              メッセージ
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sidePanelTab === "code"}
              className={`side-tab${sidePanelTab === "code" ? " is-active" : ""}`}
              onClick={() => setSidePanelTab("code")}
            >
              C++コード
            </button>
          </div>
          {sidePanelTab === "log" ? (
            <>
              <StatusBanner
                status={buildStatus}
                onOpenUsbHelp={() => window.spresense.openExternal(USB_DRIVER_HELP_URL)}
              />
              <pre className="log">{log.replace(/^\n+/, "") || "「書き込む」を押すと、ここに進み具合やエラーが表示されます。"}</pre>
            </>
          ) : (
            <CodeView code={code} />
          )}
        </aside>
      </main>
      {sdCardPanelOpen && <SdCardPanel onClose={() => setSdCardPanelOpen(false)} />}
      {learnPanelOpen && (
        <LearnPanel
          onClose={() => setLearnPanelOpen(false)}
          onOpenTutorial={() => {
            setLearnPanelOpen(false);
            setTutorialOpen(true);
          }}
          onOpenSample={handleOpenSample}
        />
      )}
      {confirmDialog}
      {tutorialOpen && <TutorialView onClose={() => setTutorialOpen(false)} onOpenSample={handleOpenSample} />}
    </div>
  );
}

interface StatusBannerProps {
  status: BuildStatus;
  onOpenUsbHelp: () => void;
}

/**
 * 右パネル上部の、今の状態を色で示す帯。USBまわりで困りやすい「待機中」と「エラー」のときは、
 * ドライバーの案内ページへのリンクも一緒に出す(ツールバーの?ボタンと同じページ)。
 */
function StatusBanner({ status, onOpenUsbHelp }: StatusBannerProps): React.JSX.Element {
  const usbHelpLink = (
    <button type="button" className="text-link" onClick={onOpenUsbHelp}>
      USBが認識されないとき
    </button>
  );
  switch (status.kind) {
    case "busy":
      return (
        <div className="status-banner is-busy" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>書き込んでいます。USBケーブルを抜かずに待ってください。</span>
        </div>
      );
    case "success":
      return (
        <div className="status-banner is-success" role="status">
          <Icon name="check" />
          <span>書き込みが完了しました。SPRESENSEの動きを確認しましょう。</span>
        </div>
      );
    case "error":
      return (
        <div className="status-banner is-error" role="alert">
          <Icon name="alert" />
          <span>
            {status.message}
            <br />
            {usbHelpLink}
          </span>
        </div>
      );
    default:
      return (
        <div className="status-banner" role="status">
          <Icon name="usb" />
          <span>
            SPRESENSEをUSBでつないで、「書き込む」を押しましょう。
            <br />
            {usbHelpLink}
          </span>
        </div>
      );
  }
}
