import chrome from "sinon-chrome";
import sinon from "sinon";
import { afterEach, beforeEach } from "vitest";

// sinon-chromeが提供するグローバルchrome APIフェイクを、テスト実行環境へ注入する。
(globalThis as unknown as { chrome: typeof chrome }).chrome = chrome;

// sinon-chrome(v3.0.1)はManifest V3で追加されたchrome.action・
// chrome.scriptingを持たない。本拡張機能が使う分だけ最小限の手書きスタブを
// 追加する。chrome.flush()の対象外なので、履歴・振る舞いのリセットは
// beforeEachで個別に行う。
export interface ScriptingActionExtras {
  scripting: {
    executeScript: sinon.SinonStub;
  };
  action: {
    setBadgeText: sinon.SinonStub;
    setTitle: sinon.SinonStub;
    onClicked: {
      addListener: sinon.SinonStub;
    };
  };
}

export const chromeExtra = chrome as unknown as ScriptingActionExtras;
chromeExtra.scripting = {
  executeScript: sinon.stub(),
};
chromeExtra.action = {
  setBadgeText: sinon.stub(),
  setTitle: sinon.stub(),
  onClicked: {
    addListener: sinon.stub(),
  },
};

beforeEach(() => {
  chrome.flush();
  chromeExtra.scripting.executeScript.reset();
  chromeExtra.scripting.executeScript.resolves([{ result: [] }]);
  chromeExtra.action.setBadgeText.reset();
  chromeExtra.action.setBadgeText.resolves(undefined);
  chromeExtra.action.setTitle.reset();
  chromeExtra.action.setTitle.resolves(undefined);
  chromeExtra.action.onClicked.addListener.reset();
});

afterEach(() => {
  chrome.flush();
});
