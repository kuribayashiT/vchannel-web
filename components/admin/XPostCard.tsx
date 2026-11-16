"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { X_MAX_LENGTH, xIntentUrl, xWeightedLength, type XPostDraft } from "@/lib/admin/xPosts";

/** 投稿案 1 件。本文は編集でき、「X で投稿」で X の投稿画面を開く（API は使わない） */
export function XPostCard({ draft }: { draft: XPostDraft }) {
  const [text, setText] = useState(draft.text);
  const [copied, setCopied] = useState(false);
  const length = xWeightedLength(text);
  const over = length > X_MAX_LENGTH;

  return (
    <article className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex items-center gap-2">
        <h3 className="text-sm font-bold">{draft.label}</h3>
        <span className={`ml-auto text-xs tabular-nums ${over ? "font-bold text-red-600" : "text-zinc-500"}`}>
          {length} / {X_MAX_LENGTH}
        </span>
      </header>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(12, text.split("\n").length + 1)}
        className="w-full resize-y rounded-md border border-zinc-300 bg-zinc-50 p-2 text-sm leading-6 dark:border-zinc-700 dark:bg-zinc-950"
      />
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={xIntentUrl(text)}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={over}
          className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium ${
            over
              ? "pointer-events-none bg-zinc-200 text-zinc-400 dark:bg-zinc-800"
              : "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          }`}
        >
          <ExternalLink size={14} />
          X で投稿
        </a>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* クリップボード不可の環境では何もしない */
            }
          }}
          className="flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "コピーしました" : "コピー"}
        </button>
        <a
          href={draft.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto truncate text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          リンク先を確認
        </a>
      </div>
    </article>
  );
}
