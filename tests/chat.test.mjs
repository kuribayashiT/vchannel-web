import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/chat.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
new Function("exports", "module", compiled)(mod.exports, mod);
const { groupPostsByParent } = mod.exports;

function post(postNo, parentNo, content = "") {
  return {
    id: String(postNo),
    threadId: "thread",
    author: "a",
    content,
    postNo,
    parentNo,
    isBot: false,
    createdAt: null,
  };
}

test("groups replies under top-level parent including reply-to-reply chains", () => {
  const groups = groupPostsByParent([
    post(1, 0),
    post(2, 1),
    post(3, 2),
    post(4, 0),
    post(5, 4),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.parent.postNo, g.replies.map((r) => r.postNo)]),
    [
      [1, [2, 3]],
      [4, [5]],
    ],
  );
});

test("treats unknown parent references as top-level posts", () => {
  const groups = groupPostsByParent([post(10, 999), post(11, 10)]);
  assert.deepEqual(
    groups.map((g) => [g.parent.postNo, g.replies.map((r) => r.postNo)]),
    [[10, [11]]],
  );
});
