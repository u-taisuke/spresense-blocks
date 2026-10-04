import * as Blockly from "blockly/core";

/**
 * ブロックの入力欄(数字・文字の欄とドロップダウン)を、Tabキーで順番に移れるようにする。
 *
 * Blockly にも標準で「文字・数字の欄で Tab を押すと次の欄へ移る」機能(BlockSvg.tab)はあるが、
 * ドロップダウンは対象外で、ひとつながりのブロックの最後で止まり、ブロックを選んだだけの状態からは
 * 入力欄に入れない。そこで、次のように動く独自の Tab 移動に置き換える。
 *
 * - 順番は「読む順」: 作業エリアのブロックのかたまりを上から(同じ高さなら左から)、
 *   各ブロックの中は左から右へ、中に入れたブロックは上から下へたどる(collectEditableFields)。
 * - 最後の欄の次は最初の欄へ戻る。Shift+Tab は逆順。
 * - ブロックを選んだ状態で Tab を押すと、そのブロックの最初の欄(Shift+Tab なら最後の欄)を開く。
 * - ドロップダウンを開いているときも Tab で次の欄へ移れる(選択中の値はそのまま)。
 */

/** Tab で移る対象にする入力欄かどうか。表示されていて、今編集できる欄だけを対象にする。 */
function isTabTarget(field: Blockly.Field): boolean {
  const isInputLike =
    field instanceof Blockly.FieldTextInput ||
    field instanceof Blockly.FieldNumber ||
    field instanceof Blockly.FieldDropdown;
  return isInputLike && field.isVisible() && field.isCurrentlyEditable();
}

/** 1つのブロックと、その中・下につながるブロックの入力欄を、読む順に out へ追加する。 */
function collectFromBlock(block: Blockly.Block, out: Blockly.Field[]): void {
  for (const input of block.inputList) {
    // 入力(input)の欄は、その入力につながるブロックより左(手前)に表示される。
    for (const field of input.fieldRow) {
      if (isTabTarget(field)) {
        out.push(field);
      }
    }
    const child = input.connection?.targetBlock();
    if (child) {
      // 値ブロック(「もし〜なら」の条件など)はその場に、文のブロック(「ずっと」の中身など)は下に並ぶ。
      collectFromBlock(child, out);
    }
  }
  const next = block.getNextBlock();
  if (next) {
    collectFromBlock(next, out);
  }
}

/** 作業エリア全体の入力欄を、読む順(上から下、左から右)に並べて返す。 */
export function collectEditableFields(workspace: Blockly.Workspace): Blockly.Field[] {
  const fields: Blockly.Field[] = [];
  // getTopBlocks(true) は、かたまりを上から(同じ高さなら左から)の順に並べて返す。
  for (const top of workspace.getTopBlocks(true)) {
    collectFromBlock(top, fields);
  }
  return fields;
}

/** 基準の欄から forward 方向に1つ進んだ欄(端では反対側に戻る)。 */
export function adjacentField(
  fields: Blockly.Field[],
  from: Blockly.Field,
  forward: boolean
): Blockly.Field | null {
  if (fields.length === 0) {
    return null;
  }
  const index = fields.indexOf(from);
  if (index < 0) {
    return forward ? fields[0] : fields[fields.length - 1];
  }
  return fields[(index + (forward ? 1 : -1) + fields.length) % fields.length];
}

/** 選んでいるブロックから Tab を押したときに開く欄。そのブロック(と中のブロック)の最初/最後の欄。 */
export function fieldForSelectedBlock(
  fields: Blockly.Field[],
  block: Blockly.Block,
  forward: boolean
): Blockly.Field | null {
  const inBlock = (field: Blockly.Field): boolean => {
    const owner = field.getSourceBlock();
    return !!owner && (owner === block || isDescendant(owner, block));
  };
  const own = fields.filter(inBlock);
  if (own.length > 0) {
    return forward ? own[0] : own[own.length - 1];
  }
  // 「ずっと」のように入力欄が無いブロックなら、全体の最初/最後の欄。
  return fields.length > 0 ? (forward ? fields[0] : fields[fields.length - 1]) : null;
}

function isDescendant(block: Blockly.Block, ancestor: Blockly.Block): boolean {
  for (let parent = block.getParent(); parent; parent = parent.getParent()) {
    if (parent === ancestor) {
      return true;
    }
  }
  return false;
}

/** 直前に編集を始めた欄。ドロップダウンをEnterで決めた後などに、Tab をその続きから進めるために使う。 */
let lastShownField: Blockly.Field | null = null;
let patched = false;

/** Blockly 本体の挙動を、アプリ全体で1回だけ差し替える。 */
function patchBlockly(): void {
  if (patched) {
    return;
  }
  patched = true;

  // どの方法で開いた欄でも(クリック・Tab)、最後に開いた欄を覚えておく。
  const originalShowEditor = Blockly.Field.prototype.showEditor;
  Blockly.Field.prototype.showEditor = function (this: Blockly.Field, e?: Event) {
    lastShownField = this;
    originalShowEditor.call(this, e);
  };

  // 文字・数字の欄で Tab を押したとき、Blockly は block.tab(欄, 前へ進むか) を呼ぶ。
  // これを読む順・ドロップダウン込み・端で折り返す移動に置き換える。
  Blockly.BlockSvg.prototype.tab = function (this: Blockly.BlockSvg, start: Blockly.Field, forward: boolean) {
    const next = adjacentField(collectEditableFields(this.workspace), start, forward);
    if (next) {
      openField(next);
    }
  };
}

/** 欄が見えていなければそのブロックまでスクロールしてから、欄の編集を始める。 */
function openField(field: Blockly.Field): void {
  const block = field.getSourceBlock() as Blockly.BlockSvg | null;
  if (!block) {
    return;
  }
  const workspace = block.workspace;
  const fieldRect = field.getSvgRoot()?.getBoundingClientRect();
  const viewRect = workspace.getParentSvg().getBoundingClientRect();
  const isVisible =
    !!fieldRect &&
    fieldRect.left >= viewRect.left &&
    fieldRect.right <= viewRect.right &&
    fieldRect.top >= viewRect.top &&
    fieldRect.bottom <= viewRect.bottom;
  if (!isVisible) {
    workspace.centerOnBlock(block.id);
  }
  // block.select() は見た目を変えるだけなので、選択中のブロックそのものを切り替える
  // (Enterで確定した後に Tab を押したとき、この欄の続きから進めるため)。
  Blockly.common.setSelected(block);
  field.showEditor();
}

/**
 * 作業エリアに Tab 移動を組み込む。戻り値は後片付け用の関数。
 * container はブロック作業エリアの要素(この中にフォーカスがあるときだけ、Tab を横取りする)。
 */
export function installTabNavigation(workspace: Blockly.WorkspaceSvg, container: HTMLElement): () => void {
  patchBlockly();

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Tab" || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    const forward = !event.shiftKey;

    // 1. ドロップダウンを開いているとき: 閉じて(選択中の値のまま)次の欄へ。
    if (Blockly.DropDownDiv.isVisible()) {
      const owner = Blockly.DropDownDiv.getOwner();
      if (owner && owner.getSourceBlock()?.workspace === workspace) {
        event.preventDefault();
        event.stopPropagation();
        Blockly.DropDownDiv.hideWithoutAnimation();
        const next = adjacentField(collectEditableFields(workspace), owner, forward);
        if (next) {
          openField(next);
        }
      }
      return;
    }

    // 2. 文字・数字の欄を編集中: Blockly 自身の処理(差し替えた BlockSvg.tab)に任せる。
    if (Blockly.WidgetDiv.isVisible()) {
      return;
    }

    // 3. 作業エリアにフォーカスがあるとき(ブロックを選んだ状態など): 欄を開く。
    const active = document.activeElement;
    if (!active || !(active === document.body || container.contains(active))) {
      return;
    }
    const fields = collectEditableFields(workspace);
    if (fields.length === 0) {
      return;
    }
    const selected = Blockly.getSelected();
    const selectedBlock =
      selected instanceof Blockly.BlockSvg && selected.workspace === workspace ? selected : null;

    let target: Blockly.Field | null;
    if (lastShownField && fields.includes(lastShownField) && (!selectedBlock || lastShownField.getSourceBlock() === selectedBlock)) {
      // 直前に編集した欄の続きから(ドロップダウンをEnterで決めた後に Tab を押した場合など)。
      target = adjacentField(fields, lastShownField, forward);
    } else if (selectedBlock) {
      target = fieldForSelectedBlock(fields, selectedBlock, forward);
    } else {
      target = forward ? fields[0] : fields[fields.length - 1];
    }
    if (target) {
      event.preventDefault();
      openField(target);
    }
  };

  // ドロップダウンのメニューより先に受け取るため、キャプチャ段階で登録する。
  document.addEventListener("keydown", handleKeyDown, true);
  return () => document.removeEventListener("keydown", handleKeyDown, true);
}
