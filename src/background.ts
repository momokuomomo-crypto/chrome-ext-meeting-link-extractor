import { collectCandidates } from "./inject/collect-candidates";
import { copyTextInPage } from "./inject/copy-in-page";
import { extractMeetingUrls } from "./core/extract-meeting-urls";
import type { CollectMode } from "./types";

const MENU_SELECTION_ID = "extract-meeting-urls-selection";
const MENU_PAGE_ID = "extract-meeting-urls-page";
const ERROR_BADGE_DURATION_MS = 3000;

// 拡張機能の更新時、removeAll()を挟まずcreate()を呼ぶと既存の同一IDメニュー
// と衝突し得るため、先に全削除してから登録する（姉妹拡張で確立済みの
// パターン）。
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      console.error("contextMenus.removeAll failed", chrome.runtime.lastError.message);
    }
    chrome.contextMenus.create(
      { id: MENU_SELECTION_ID, title: "選択範囲から会議URLをコピー", contexts: ["selection"] },
      () => {
        if (chrome.runtime.lastError) {
          console.error("contextMenus.create (selection) failed", chrome.runtime.lastError.message);
        }
      },
    );
    chrome.contextMenus.create({ id: MENU_PAGE_ID, title: "このページから会議URLをコピー", contexts: ["page"] }, () => {
      if (chrome.runtime.lastError) {
        console.error("contextMenus.create (page) failed", chrome.runtime.lastError.message);
      }
    });
  });
});

// バッジ・タイトルの各設定は個別にtry/catchする。片方が失敗しても
// もう片方は試行する（Stage5実装レビューで、setBadgeText失敗時に
// setTitleが一切呼ばれなくなる問題が指摘された）。
async function showInjectionError(tabId: number, message: string): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text: "×" });
  } catch {
    // 無視する（スクリプト注入自体が拒否されるページでは、chrome.action
    // APIも制限される場合があるため）。
  }
  try {
    await chrome.action.setTitle({ tabId, title: message });
  } catch {
    // 無視する
  }
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    chrome.action.setTitle({ tabId, title: "" }).catch(() => {});
  }, ERROR_BADGE_DURATION_MS);
}

async function collectMeetingUrls(tabId: number, mode: CollectMode): Promise<string[]> {
  const collectResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectCandidates,
    args: [mode],
  });
  const sources = collectResults[0]?.result ?? [];
  return extractMeetingUrls(sources);
}

async function copyResultInPage(tabId: number, urls: string[]): Promise<void> {
  if (urls.length === 0) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: copyTextInPage,
      args: [null, "会議URLが見つかりませんでした"],
    });
    return;
  }

  const text = urls.join("\n");
  const message = `${urls.length}件の会議URLをコピーしました`;
  await chrome.scripting.executeScript({
    target: { tabId },
    func: copyTextInPage,
    args: [text, message],
  });
}

// 同一タブに対する多重発火（連打・実行中の再クリック）を防ぐガード。
// 実行中は新規呼び出しを無視する（Stage5実装レビューで、排他制御が無いと
// トースト二重表示やクリップボード内容の後勝ち上書きが起こり得ると
// 指摘された）。
const inFlightTabIds = new Set<number>();

// 保護ページ等、スクリプト注入自体が拒否される場合、ページ内フィード
// バックを出す手段が無いためバッジ・アクションタイトルでエラーを表示
// する（凍結設計どおり）。収集段階とコピー段階を別々に捕捉し、診断ログ・
// ユーザー表示のどちらでどちらの段階が失敗したか区別する（Stage5実装
// レビューで、両方が一律「extraction failed」になり診断しづらいと
// 指摘された）。
async function runExtraction(tabId: number, mode: CollectMode): Promise<void> {
  if (inFlightTabIds.has(tabId)) return;
  inFlightTabIds.add(tabId);
  try {
    await runExtractionInternal(tabId, mode);
  } finally {
    inFlightTabIds.delete(tabId);
  }
}

async function runExtractionInternal(tabId: number, mode: CollectMode): Promise<void> {
  let urls: string[];
  try {
    urls = await collectMeetingUrls(tabId, mode);
  } catch (error) {
    console.error("meeting url collection failed", error);
    void showInjectionError(
      tabId,
      `会議URLの収集に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  try {
    await copyResultInPage(tabId, urls);
  } catch (error) {
    console.error("meeting url copy failed", error);
    void showInjectionError(
      tabId,
      `コピー処理に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  // 選択範囲があれば選択範囲、無ければページ全体（collectCandidates内の
  // フォールバックにより自動的に切り替わる）。
  void runExtraction(tab.id, "selection");
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id === undefined) return;
  if (info.menuItemId === MENU_SELECTION_ID) {
    void runExtraction(tab.id, "selection");
  } else if (info.menuItemId === MENU_PAGE_ID) {
    void runExtraction(tab.id, "page");
  }
});
