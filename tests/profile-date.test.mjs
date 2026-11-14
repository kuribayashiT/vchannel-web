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
  new Function("exports", "require", "module", compiled)(
    loadedModule.exports,
    load,
    loadedModule,
  );
  return loadedModule.exports;
}

test("profile dates parse supported formats and reject invalid calendar days", () => {
  const { parseDebut, parseMonthDay } = loadModule("../lib/profile-date.ts");
  assert.deepEqual(parseMonthDay("05-15"), { month: 5, day: 15 });
  assert.deepEqual(parseMonthDay("05/23"), { month: 5, day: 23 });
  assert.deepEqual(parseMonthDay("5/3"), { month: 5, day: 3 });
  assert.deepEqual(parseMonthDay("2018/05/15"), { month: 5, day: 15 });
  assert.deepEqual(parseMonthDay("2018-05-15"), { month: 5, day: 15 });
  assert.deepEqual(parseMonthDay("2018年5月15日"), { month: 5, day: 15 });
  assert.deepEqual(parseMonthDay("2.29"), { month: 2, day: 29 });
  assert.equal(parseMonthDay("2/30"), null);
  assert.equal(parseMonthDay("13/1"), null);
  assert.equal(parseMonthDay(""), null);
  assert.deepEqual(parseDebut("2018/3/22"), {
    year: 2018,
    month: 3,
    day: 22,
  });
  assert.deepEqual(parseDebut("2018/09/07"), {
    year: 2018,
    month: 9,
    day: 7,
  });
  assert.deepEqual(parseDebut("2018-09-07"), {
    year: 2018,
    month: 9,
    day: 7,
  });
  assert.deepEqual(parseDebut("9/7"), { month: 9, day: 7 });
});

test("profile countdowns use JST dates and handle birthdays and anniversaries", () => {
  const { getProfileDateCountdown } = loadModule("../lib/profile-date.ts");
  assert.deepEqual(
    getProfileDateCountdown(
      { month: 5, day: 15 },
      "birthday",
      { year: 2026, month: 5, day: 15 },
    ),
    { text: "", badge: "今日は誕生日！", tone: "amber" },
  );
  assert.deepEqual(
    getProfileDateCountdown(
      { month: 2, day: 29 },
      "birthday",
      { year: 2025, month: 2, day: 28 },
    ),
    { text: "あと 1 日", badge: "もうすぐ", tone: "violet" },
  );
  assert.deepEqual(
    getProfileDateCountdown(
      { year: 2017, month: 11, day: 20 },
      "debut",
      { year: 2026, month: 11, day: 14 },
    ),
    { text: "もうすぐ 9周年（あと 6 日）" },
  );
  assert.deepEqual(
    getProfileDateCountdown(
      { year: 2017, month: 9, day: 7 },
      "debut",
      { year: 2026, month: 9, day: 7 },
    ),
    { text: "", badge: "今日で 9周年！", tone: "amber" },
  );
  assert.deepEqual(
    getProfileDateCountdown(
      { year: 2026, month: 9, day: 7 },
      "debut",
      { year: 2026, month: 10, day: 1 },
    ),
    { text: "今年デビュー" },
  );
  assert.deepEqual(
    getProfileDateCountdown(
      { month: 9, day: 7 },
      "debut",
      { year: 2026, month: 9, day: 1 },
    ),
    { text: "あと 6 日" },
  );
});

test("detail profile dates render event links only when data exists", () => {
  const Empty = () => null;
  const DetailView = loadModule("../components/VTuberTabs.tsx", {
    "@/lib/url": { smallAvatar: () => "" },
    "lucide-react": {
      Cake: Empty,
      ChevronDown: Empty,
      PartyPopper: Empty,
      Search: Empty,
    },
    "next/link": {
      __esModule: true,
      default: ({ href, children, ...props }) =>
        React.createElement("a", { href, ...props }, children),
    },
    "@/components/AffiliateLinks": { AffiliateLinks: Empty },
    "@/components/DateCountdown": {
      DateCountdown: () => React.createElement("span", null, "相対表示"),
    },
    "@/components/Skeleton": {
      VTuberDetailSkeleton: Empty,
      VTuberTabsSkeleton: Empty,
    },
    "@/components/VideoCard": { VideoCard: Empty },
    "@/hooks/useSelection": {
      useSelectedChannels: () => ({ channelIds: [] }),
    },
    "@/lib/format": {
      formatCompact: String,
      formatNumber: String,
    },
    "@/lib/search": { normalizeForSearch: String },
    "@/lib/events": {
      formatDateSlug: (month, day) =>
        `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    },
  }).DetailView;
  const base = {
    channelId: "channel",
    name: "VTuber",
    office: "事務所",
    officeFlg: false,
    thumbnail: "",
    subscriberCount: 1,
    viewCount: 2,
    videoCount: 3,
    title: "",
    transition: [],
    videos: [],
  };
  const withDates = renderToStaticMarkup(
    React.createElement(DetailView, {
      detail: {
        ...base,
        birthday: { month: 5, day: 15 },
        debut: { year: 2017, month: 9, day: 7 },
      },
    }),
  );
  assert.match(withDates, /href="\/events\/05-15"/);
  assert.match(withDates, /href="\/events\/09-07"/);
  assert.match(withDates, /5月15日/);
  assert.match(withDates, /2017年9月7日/);
  assert.equal((withDates.match(/相対表示/g) ?? []).length, 2);

  const withoutDates = renderToStaticMarkup(
    React.createElement(DetailView, { detail: base }),
  );
  assert.doesNotMatch(withoutDates, /誕生日|デビュー/);
});

test("date countdown stays out of server HTML until hydration completes", () => {
  const DateCountdown = loadModule("../components/DateCountdown.tsx", {
    react: {
      ...React,
      useSyncExternalStore: (_subscribe, _getSnapshot, getServerSnapshot) =>
        getServerSnapshot(),
    },
    "@/lib/events": {
      todayJstParts: () => {
        throw new Error("today should only be read after hydration");
      },
    },
    "@/lib/profile-date": {
      getProfileDateCountdown: () => ({ text: "あと 1 日" }),
    },
  }).DateCountdown;
  assert.equal(
    renderToStaticMarkup(
      React.createElement(DateCountdown, {
        date: { month: 5, day: 15 },
        kind: "birthday",
      }),
    ),
    "",
  );
});
