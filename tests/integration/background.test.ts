import { beforeEach, describe, expect, it, vi } from "vitest";
import chrome from "sinon-chrome";
import { chromeExtra } from "../setup";

async function loadBackgroundFresh(): Promise<void> {
  vi.resetModules();
  await import("../../src/background");
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface FakeTab {
  id?: number;
  url?: string;
}

beforeEach(() => {
  chrome.contextMenus.removeAll.callsFake((callback?: () => void) => callback?.());
  chrome.contextMenus.create.callsFake((_options: unknown, callback?: () => void) => callback?.());
});

describe("background: リスナー登録・contextMenus", () => {
  it("インポート時点で同期的にリスナーを登録する", async () => {
    await loadBackgroundFresh();
    expect(chrome.runtime.onInstalled.addListener.called).toBe(true);
    expect(chrome.contextMenus.onClicked.addListener.called).toBe(true);
    expect(chromeExtra.action.onClicked.addListener.called).toBe(true);
  });

  it("インストール時にremoveAll後、選択範囲用・ページ全体用のメニューを登録する", async () => {
    await loadBackgroundFresh();
    const installListener = chrome.runtime.onInstalled.addListener.lastCall.args[0] as () => void;
    installListener();

    expect(chrome.contextMenus.removeAll.called).toBe(true);
    expect(chrome.contextMenus.create.callCount).toBe(2);
    const selectionArgs = chrome.contextMenus.create.getCall(0).args[0];
    expect(selectionArgs.id).toBe("extract-meeting-urls-selection");
    expect(selectionArgs.contexts).toEqual(["selection"]);
    const pageArgs = chrome.contextMenus.create.getCall(1).args[0];
    expect(pageArgs.id).toBe("extract-meeting-urls-page");
    expect(pageArgs.contexts).toEqual(["page"]);
  });

  it("拡張機能アップデート相当（onInstalledを2回発火）でも重複ID登録エラーを起こさない", async () => {
    await loadBackgroundFresh();
    const installListener = chrome.runtime.onInstalled.addListener.lastCall.args[0] as () => void;

    installListener();
    installListener();

    expect(chrome.contextMenus.removeAll.callCount).toBe(2);
    expect(chrome.contextMenus.create.callCount).toBe(4);
  });
});

describe("background: ツールバーボタン・コンテキストメニューのクリック", () => {
  it("ツールバーボタンはselectionモードで2段階のexecuteScriptを呼ぶ", async () => {
    chromeExtra.scripting.executeScript
      .onCall(0)
      .resolves([{ result: ["https://zoom.us/j/123456789"] }]);
    chromeExtra.scripting.executeScript.onCall(1).resolves([{ result: undefined }]);
    await loadBackgroundFresh();

    const clickListener = chromeExtra.action.onClicked.addListener.lastCall.args[0] as (
      tab: FakeTab,
    ) => void;
    clickListener({ id: 1, url: "https://example.com/" });
    await flushAsync();

    expect(chromeExtra.scripting.executeScript.callCount).toBe(2);
    const firstCall = chromeExtra.scripting.executeScript.getCall(0).args[0];
    expect(firstCall.target).toEqual({ tabId: 1 });
    expect(firstCall.args).toEqual(["selection"]);
    const secondCall = chromeExtra.scripting.executeScript.getCall(1).args[0];
    expect(secondCall.args).toEqual(["https://zoom.us/j/123456789", "1件の会議URLをコピーしました"]);
  });

  it("0件の場合は該当メッセージ付きで2段階目のexecuteScriptを呼ぶ", async () => {
    chromeExtra.scripting.executeScript.onCall(0).resolves([{ result: [] }]);
    chromeExtra.scripting.executeScript.onCall(1).resolves([{ result: undefined }]);
    await loadBackgroundFresh();

    const clickListener = chromeExtra.action.onClicked.addListener.lastCall.args[0] as (
      tab: FakeTab,
    ) => void;
    clickListener({ id: 1, url: "https://example.com/" });
    await flushAsync();

    expect(chromeExtra.scripting.executeScript.callCount).toBe(2);
    const secondCall = chromeExtra.scripting.executeScript.getCall(1).args[0];
    expect(secondCall.args).toEqual([null, "会議URLが見つかりませんでした"]);
  });

  it("複数件の場合は改行区切りでコピーする", async () => {
    chromeExtra.scripting.executeScript
      .onCall(0)
      .resolves([{ result: ["https://zoom.us/j/123456789", "https://meet.google.com/abc-defg-hij"] }]);
    chromeExtra.scripting.executeScript.onCall(1).resolves([{ result: undefined }]);
    await loadBackgroundFresh();

    const clickListener = chromeExtra.action.onClicked.addListener.lastCall.args[0] as (
      tab: FakeTab,
    ) => void;
    clickListener({ id: 1, url: "https://example.com/" });
    await flushAsync();

    const secondCall = chromeExtra.scripting.executeScript.getCall(1).args[0];
    expect(secondCall.args[0]).toBe("https://zoom.us/j/123456789\nhttps://meet.google.com/abc-defg-hij");
    expect(secondCall.args[1]).toBe("2件の会議URLをコピーしました");
  });

  it("「このページから」メニューはpageモードでexecuteScriptを呼ぶ", async () => {
    chromeExtra.scripting.executeScript.onCall(0).resolves([{ result: [] }]);
    chromeExtra.scripting.executeScript.onCall(1).resolves([{ result: undefined }]);
    await loadBackgroundFresh();

    const menuListener = chrome.contextMenus.onClicked.addListener.lastCall.args[0] as (
      info: { menuItemId: string },
      tab: FakeTab,
    ) => void;
    menuListener({ menuItemId: "extract-meeting-urls-page" }, { id: 1 });
    await flushAsync();

    const firstCall = chromeExtra.scripting.executeScript.getCall(0).args[0];
    expect(firstCall.args).toEqual(["page"]);
  });

  it("「選択範囲から」メニューはselectionモードでexecuteScriptを呼ぶ", async () => {
    chromeExtra.scripting.executeScript.onCall(0).resolves([{ result: [] }]);
    chromeExtra.scripting.executeScript.onCall(1).resolves([{ result: undefined }]);
    await loadBackgroundFresh();

    const menuListener = chrome.contextMenus.onClicked.addListener.lastCall.args[0] as (
      info: { menuItemId: string },
      tab: FakeTab,
    ) => void;
    menuListener({ menuItemId: "extract-meeting-urls-selection" }, { id: 1 });
    await flushAsync();

    const firstCall = chromeExtra.scripting.executeScript.getCall(0).args[0];
    expect(firstCall.args).toEqual(["selection"]);
  });

  it("tab.idが無い場合は何もしない", async () => {
    await loadBackgroundFresh();

    const clickListener = chromeExtra.action.onClicked.addListener.lastCall.args[0] as (
      tab: FakeTab,
    ) => void;
    clickListener({ url: "https://example.com/" });
    await flushAsync();

    expect(chromeExtra.scripting.executeScript.called).toBe(false);
  });

  it("対象外のmenuItemIdでは何もしない", async () => {
    await loadBackgroundFresh();

    const menuListener = chrome.contextMenus.onClicked.addListener.lastCall.args[0] as (
      info: { menuItemId: string },
      tab: FakeTab,
    ) => void;
    menuListener({ menuItemId: "unrelated" }, { id: 1 });
    await flushAsync();

    expect(chromeExtra.scripting.executeScript.called).toBe(false);
  });
});

describe("background: 同一タブへの多重発火防止（Stage5実装レビューで発見）", () => {
  it("実行中に同じタブへ再度クリックされても新規呼び出しを無視する", async () => {
    let resolveCollect!: (value: unknown) => void;
    const collectPromise = new Promise((resolve) => {
      resolveCollect = resolve;
    });
    chromeExtra.scripting.executeScript.onCall(0).returns(collectPromise);
    chromeExtra.scripting.executeScript.onCall(1).resolves([{ result: undefined }]);
    await loadBackgroundFresh();

    const clickListener = chromeExtra.action.onClicked.addListener.lastCall.args[0] as (
      tab: FakeTab,
    ) => void;
    clickListener({ id: 1, url: "https://example.com/" });
    await flushAsync();
    clickListener({ id: 1, url: "https://example.com/" }); // 実行中の再クリック
    await flushAsync();

    resolveCollect([{ result: ["https://zoom.us/j/123456789"] }]);
    await flushAsync();
    await flushAsync();

    // 1回目の収集（1回）＋コピー（1回）の合計2回のみ。2回目のクリックは無視される。
    expect(chromeExtra.scripting.executeScript.callCount).toBe(2);
  });

  it("完了後の再クリックは新規に処理する", async () => {
    chromeExtra.scripting.executeScript.resolves([{ result: [] }]);
    await loadBackgroundFresh();

    const clickListener = chromeExtra.action.onClicked.addListener.lastCall.args[0] as (
      tab: FakeTab,
    ) => void;
    clickListener({ id: 1, url: "https://example.com/" });
    await flushAsync();
    clickListener({ id: 1, url: "https://example.com/" });
    await flushAsync();

    expect(chromeExtra.scripting.executeScript.callCount).toBe(4);
  });
});

describe("background: スクリプト注入失敗時の挙動", () => {
  it("1段階目のexecuteScriptが失敗した場合、バッジ・タイトルへエラーを表示する", async () => {
    chromeExtra.scripting.executeScript.rejects(new Error("Cannot access contents of the page"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await loadBackgroundFresh();

    const clickListener = chromeExtra.action.onClicked.addListener.lastCall.args[0] as (
      tab: FakeTab,
    ) => void;
    clickListener({ id: 1, url: "chrome://extensions" });
    await flushAsync();

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(chromeExtra.action.setBadgeText.calledWith({ tabId: 1, text: "×" })).toBe(true);
    expect(chromeExtra.action.setTitle.called).toBe(true);
    consoleErrorSpy.mockRestore();
  });

  it("バッジ設定自体が失敗しても例外を外へ伝播させない", async () => {
    chromeExtra.scripting.executeScript.rejects(new Error("boom"));
    chromeExtra.action.setBadgeText.rejects(new Error("badge unavailable"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await loadBackgroundFresh();

    const clickListener = chromeExtra.action.onClicked.addListener.lastCall.args[0] as (
      tab: FakeTab,
    ) => void;
    expect(() => clickListener({ id: 1, url: "chrome://extensions" })).not.toThrow();
    await flushAsync();

    consoleErrorSpy.mockRestore();
  });

  it("setBadgeTextが失敗してもsetTitleは独立して試行される（Stage5実装レビューで発見）", async () => {
    chromeExtra.scripting.executeScript.rejects(new Error("boom"));
    chromeExtra.action.setBadgeText.rejects(new Error("badge unavailable"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await loadBackgroundFresh();

    const clickListener = chromeExtra.action.onClicked.addListener.lastCall.args[0] as (
      tab: FakeTab,
    ) => void;
    clickListener({ id: 1, url: "chrome://extensions" });
    await flushAsync();

    expect(chromeExtra.action.setTitle.called).toBe(true);
    consoleErrorSpy.mockRestore();
  });

  it("収集段階の失敗とコピー段階の失敗を異なるメッセージで区別する（Stage5実装レビューで発見）", async () => {
    chromeExtra.scripting.executeScript.onCall(0).resolves([{ result: ["https://zoom.us/j/123456789"] }]);
    chromeExtra.scripting.executeScript.onCall(1).rejects(new Error("copy stage failed"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await loadBackgroundFresh();

    const clickListener = chromeExtra.action.onClicked.addListener.lastCall.args[0] as (
      tab: FakeTab,
    ) => void;
    clickListener({ id: 1, url: "https://example.com/" });
    await flushAsync();

    expect(consoleErrorSpy).toHaveBeenCalledWith("meeting url copy failed", expect.any(Error));
    const titleCall = chromeExtra.action.setTitle.getCall(0)?.args[0] as { title: string };
    expect(titleCall.title).toContain("コピー処理に失敗しました");
    consoleErrorSpy.mockRestore();
  });
});
