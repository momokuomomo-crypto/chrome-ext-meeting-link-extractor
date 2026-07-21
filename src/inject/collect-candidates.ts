import type { CollectMode } from "../types";

// この関数はchrome.scripting.executeScriptにより文字列化され、対象ページの
// コンテキストで再実行される。外側のクロージャ変数は一切参照できないため、
// 必要な値はすべて仮引数（args経由）として受け取る。他モジュールをimport
// して参照することもできないため、このファイル単体で完結させる
// （姉妹拡張で確立済みの方針）。
//
// DOM収集のみを行い、会議URLのサービス別判定・正規表現・重複排除ロジックは
// 一切含まない（Stage2で確定：自己完結性の制約と、テーブル駆動単体テスト
// 可能な検証ロジックとを両立させるためのアーキテクチャ分離）。
export function collectCandidates(mode: CollectMode): string[] {
  function walkInOrder(root: Node): string[] {
    const sources: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (text && text.trim().length > 0) {
          sources.push(text);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === "A") {
        // .href（IDLプロパティ）ではなくgetAttribute("href")を使う。.hrefは
        // 相対URL・空文字・"#"であっても現在ページの絶対URLへ解決して
        // しまうため、href="#"のような無関係なリンクが現在ページのURLと
        // して誤って収集され得る（Stage5実装レビューで発見）。
        const href = (node as Element).getAttribute("href");
        if (href) {
          sources.push(href);
        }
      }
      node = walker.nextNode();
    }
    return sources;
  }

  if (mode === "page") {
    return walkInOrder(document.body);
  }

  // 選択範囲モード：選択が空・折りたたまれている場合はページ全体へ
  // フォールバックする（Stage2で確定）。
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return walkInOrder(document.body);
  }

  // Range.cloneContents()は選択範囲内だけを正しく切り取ったフラグメントを
  // 返す（テキストノードは選択境界で分割された状態でコピーされる）ため、
  // 選択範囲外の内容を誤って含めない。
  const range = selection.getRangeAt(0);
  const fragment = range.cloneContents();
  return walkInOrder(fragment);
}
