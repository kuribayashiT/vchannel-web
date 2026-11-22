// auto-coder に渡すソースコードを「今回のタスクに関係するファイル」だけに絞るためのヘルパー。
//
// 以前は app/ と components/ の全ファイル（約 35 万文字）を毎回送っており、
// トークン使用量の大半を占めていた（2026-11-22 に変更）。
// 今は次のファイルだけを送る。
//   1. タスク本文に書かれているファイル（`対象ファイル` など）
//   2. 1 から読み込んでいる自前のファイル（`@/...` と相対パス、2 段まで）
// 加えて、プロジェクトのファイル一覧（パスのみ）を渡し、構成は分かるようにする。
import fs from 'fs';
import path from 'path';

const SOURCE_DIRS = ['app', 'components', 'lib', 'hooks', 'types'];
const SOURCE_EXT = /\.(tsx?|mjs|js|css)$/;
const RESOLVE_EXTS = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx'];
const IMPORT_DEPTH = 2;
/** 送るソースの合計の上限（文字数）。超えたら依存先のファイルから順に省く */
const MAX_CHARS = 120_000;

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** タスク本文から、存在するソースファイルのパスを取り出す */
export function filesMentionedInTask(taskBlock) {
  const found = new Set();
  const re = /[A-Za-z0-9_@\-\[\]().\/]+\.(?:tsx?|mjs|js|css)\b/g;
  for (const m of taskBlock.matchAll(re)) {
    const p = m[0].replace(/^\.\//, '');
    if (isFile(p)) found.add(p);
  }
  return [...found];
}

function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('.')) base = path.join(path.dirname(fromFile), spec);
  else return null; // npm パッケージ
  for (const ext of RESOLVE_EXTS) {
    const p = path.normalize(base + ext);
    if (isFile(p)) return p;
  }
  return null;
}

function localImports(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /(?:import|export)[\s\S]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of src.matchAll(re)) {
    const r = resolveImport(file, m[1] || m[2]);
    if (r) out.push(r);
  }
  return out;
}

/** プロジェクトのソースファイル一覧（パスのみ） */
export function sourceFileTree() {
  const list = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (SOURCE_EXT.test(name)) list.push(p);
    }
  };
  SOURCE_DIRS.forEach(walk);
  return list.join('\n');
}

/**
 * タスクに関係するファイルの中身を、プロンプト用の文字列にして返す。
 * 返り値: { context, files }（files はログ用）
 */
export function buildTaskContext(taskBlock) {
  const mentioned = filesMentionedInTask(taskBlock);
  // 幅優先で依存先をたどる。先に見つかったもの（= タスクに近いもの）を優先する
  const ordered = [...mentioned];
  const seen = new Set(mentioned);
  let frontier = mentioned;
  for (let depth = 0; depth < IMPORT_DEPTH; depth++) {
    const next = [];
    for (const f of frontier) {
      for (const dep of localImports(f)) {
        if (seen.has(dep)) continue;
        seen.add(dep);
        ordered.push(dep);
        next.push(dep);
      }
    }
    frontier = next;
  }

  const parts = [];
  const files = [];
  let total = 0;
  for (const f of ordered) {
    const content = fs.readFileSync(f, 'utf8');
    const isMentioned = mentioned.includes(f);
    // タスクに書かれたファイルは必ず入れる。依存先は上限内に収まる分だけ
    if (!isMentioned && total + content.length > MAX_CHARS) continue;
    total += content.length;
    files.push(f);
    parts.push(`### File: ${f}\n\`\`\`tsx\n${content}\n\`\`\`\n`);
  }
  return { context: parts.join('\n'), files };
}
