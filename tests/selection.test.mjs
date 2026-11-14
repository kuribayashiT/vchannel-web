import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadModule(path, overrides = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const loadedModule = { exports: {} };
  const load = (name) => (name in overrides ? overrides[name] : require(name));
  new Function("exports", "require", "module", compiled)(loadedModule.exports, load, loadedModule);
  return loadedModule.exports;
}

const offices = [{ name: "事務所A", members: [{ name: "配信者A", channelId: "a" }] }];

test("empty selection toggles to only the chosen scope and full selection normalizes to empty", () => {
  const { toggleChannelSelection } = loadModule("../hooks/useSelection.ts");
  assert.deepEqual(toggleChannelSelection([], ["a", "b"], ["a", "b", "c"]), [
    "a",
    "b",
  ]);
  assert.deepEqual(toggleChannelSelection([], ["b"], ["a", "b", "c"]), ["b"]);
  assert.deepEqual(toggleChannelSelection(["a", "b"], ["a", "b"], ["a", "b", "c"]), []);
  assert.deepEqual(toggleChannelSelection(["a", "b"], ["c"], ["a", "b", "c"]), []);
  assert.deepEqual(toggleChannelSelection(["a"], ["b"], ["a", "b", "c"]), ["a", "b"]);
});

test("empty filter selection renders every office and member as checked", () => {
  const Selector = loadModule("../components/OfficeSelector.tsx", {
    react: {
      ...React,
      useState: (initial) => [
        initial instanceof Set ? new Set(["事務所A"]) : initial,
        () => {},
      ],
    },
    "@/components/SafeImage": { SafeImage: () => null },
    "@/hooks/useSelection": {
      toggleChannelSelection: (current, ids) => [...new Set([...current, ...ids])],
    },
    "@/lib/search": { normalizeForSearch: (value) => value.toLowerCase() },
  }).OfficeSelector;
  const html = renderToStaticMarkup(
    React.createElement(Selector, {
      offices: [
        {
          name: "事務所A",
          members: [
            { name: "配信者A", channelId: "a" },
            { name: "配信者B", channelId: "b" },
          ],
        },
      ],
      selected: [],
      onChange: () => {},
    }),
  );
  assert.match(html, /すべて表示/);
  assert.match(html, /事務所やVTuberをタップすると、そこだけに絞り込みます/);
  assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 4);
  assert.doesNotMatch(html, /全選択|選択解除/);
});

function renderShell(menuOpen, selected) {
  const MockLink = ({ children, href }) => React.createElement("a", { href }, children);
  const Empty = () => null;
  const Selector = ({ offices: items, selected: ids }) =>
    React.createElement("div", { "data-testid": "selector" }, `${items[0].name}:${ids.join(",")}`);
  const shell = loadModule("../components/AppShell.tsx", {
    react: { ...React, useState: () => [menuOpen, () => {}] },
    "next/link": { __esModule: true, default: MockLink },
    "lucide-react": { X: Empty, CalendarDays: Empty, Settings: Empty, SlidersHorizontal: Empty, Star: Empty },
    "@/components/BottomNav": { BottomNav: Empty, TopNav: Empty },
    "@/components/LinkPendingIndicator": {
      LinkPendingIndicator: ({ children }) => children,
    },
    "@/components/YouTubePlayer": { YouTubePlayer: Empty },
    "@/components/OfficeSelector": { OfficeSelector: Selector },
    "@/hooks/useSelection": { useSelectedChannels: () => ({ channelIds: selected, setChannelIds: () => {} }) },
  });
  return renderToStaticMarkup(React.createElement(shell.AppShell, { offices }, "本文"));
}

test("first visit renders content without an onboarding dialog", () => {
  const html = renderShell(false, []);
  assert.match(html, /本文/);
  assert.match(html, /aria-label="フィルター"/);
  assert.doesNotMatch(html, /role="dialog"|ようこそ！|事務所を変更/);
});

test("shared shell does not render the metrics footer", () => {
  const html = renderShell(false, []);
  assert.doesNotMatch(html, /<footer|指標について|フッターナビゲーション/);
  assert.match(html, /本文/);
});

test("filter menu keeps the existing selection and has no separate edit button", () => {
  const html = renderShell(true, ["a"]);
  assert.match(html, /data-testid="selector">事務所A:a/);
  assert.doesNotMatch(html, /事務所を変更|role="dialog"/);
});

test("reset clears the channel filter and notifies subscribers without touching other data", () => {
  const data = new Map([
    ["selectedChannelIds", '["a"]'],
    ["onboarding_done", "true"],
    ["favorites", '["video"]'],
  ]);
  const events = [];
  const previousStorage = globalThis.localStorage;
  const previousWindow = globalThis.window;
  globalThis.localStorage = { removeItem: (key) => data.delete(key) };
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  try {
    loadModule("../hooks/useSelection.ts").resetSelection();
    assert.equal(data.has("selectedChannelIds"), false);
    assert.equal(data.get("onboarding_done"), "true");
    assert.equal(data.get("favorites"), '["video"]');
    assert.deepEqual(events, ["vchannel:local-state"]);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
