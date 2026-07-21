// この関数はchrome.scripting.executeScriptにより文字列化され、対象ページの
// コンテキストで再実行される。外側のクロージャ変数は一切参照できないため、
// 必要な値はすべて仮引数（args経由）として受け取る。他モジュールをimport
// して参照することもできないため、このファイル単体で完結させる
// （姉妹拡張「選択範囲をMarkdown引用」「選択テキスト即時コピー整形」
// 「URLクリーンコピー」で確立済みの方針）。
//
// text === nullの場合はクリップボードへ一切触れず、messageをそのまま
// 通知として表示する（該当件数0件のケース。姉妹拡張と異なり、本拡張は
// 「0件でも空文字をコピーする」のではなく「クリップボードを一切変更
// しない」設計とする）。
export function copyTextInPage(text: string | null, message: string): void {
  function showToast(msg: string): void {
    try {
      const host = document.createElement("div");
      host.style.position = "fixed";
      host.style.top = "16px";
      host.style.right = "16px";
      host.style.zIndex = "2147483647";
      const shadow = host.attachShadow({ mode: "open" });
      const box = document.createElement("div");
      // Trusted Types等の厳格なCSP下でも失敗しないよう、innerHTMLではなく
      // textContentとstyleプロパティ代入のみでDOMを構築する。
      box.textContent = msg;
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");
      box.style.background = "#111827";
      box.style.color = "#ffffff";
      box.style.padding = "8px 12px";
      box.style.borderRadius = "6px";
      box.style.fontFamily = "sans-serif";
      box.style.fontSize = "13px";
      box.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";
      shadow.appendChild(box);
      document.documentElement.appendChild(host);
      setTimeout(() => host.remove(), 2500);
    } catch {
      // トースト表示自体の失敗は、クリップボードへのコピー結果には
      // 影響させない（呼び出し元でtry/catchしている）。
    }
  }

  if (text === null) {
    showToast(message);
    return;
  }

  // document.bodyが存在しない文書やappendChild/focus/select等が例外を
  // 投げるケースでも、必ず一時要素を除去し例外を外へ漏らさない。
  function copyWithExecCommand(value: string): boolean {
    const activeElementBefore = document.activeElement as HTMLElement | null;
    const container = document.body ?? document.documentElement;
    let textarea: HTMLTextAreaElement | undefined;
    let succeeded = false;
    try {
      textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      textarea.style.left = "-9999px";
      container.appendChild(textarea);
      textarea.focus();
      textarea.select();
      succeeded = document.execCommand("copy");
    } catch {
      succeeded = false;
    } finally {
      if (textarea) {
        try {
          textarea.blur();
        } catch {
          // 無視する
        }
        try {
          textarea.remove();
        } catch {
          // 無視する
        }
      }
      try {
        if (activeElementBefore && typeof activeElementBefore.focus === "function") {
          activeElementBefore.focus();
        }
      } catch {
        // 無視する
      }
    }
    return succeeded;
  }

  void (async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = copyWithExecCommand(text);
    }
    showToast(ok ? message : "コピーできませんでした");
  })();
}
