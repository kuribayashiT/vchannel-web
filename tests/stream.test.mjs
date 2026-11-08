import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/stream.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const streamModule = { exports: {} };
new Function("exports", "module", compiled)(
  streamModule.exports,
  streamModule,
);
const { groupByTab } = streamModule.exports;

test("live uses every source item in source order regardless of timestamps", () => {
  const videos = [
    { videoId: "no-start", actualStartTime: "", actualEndTime: "", comparisonDay: "" },
    { videoId: "old", actualStartTime: "2020-01-01", actualEndTime: "2020-01-02", comparisonDay: "2020-01-01T00:00:00Z" },
    { videoId: "live", actualStartTime: "2026-01-01", actualEndTime: "", comparisonDay: "2026-01-01T00:00:00Z" },
  ];

  const groups = groupByTab(videos, new Date("2026-01-01T00:00:00Z"));
  assert.deepEqual(groups.live.map((video) => video.videoId), ["no-start", "old", "live"]);
  assert.deepEqual(groups.past.map((video) => video.videoId), ["old"]);
  assert.deepEqual(groups.today.map((video) => video.videoId), ["live"]);
  assert.notStrictEqual(groups.live, videos);
});

test("live respects an empty or pre-filtered source list", () => {
  const videos = [{ videoId: "selected", comparisonDay: "" }];
  assert.deepEqual(groupByTab([]).live, []);
  assert.deepEqual(groupByTab(videos).live, videos);
});
