"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Smartphone } from "lucide-react";
import { resetSelection } from "@/hooks/useSelection";
import { CONTACT_EMAIL } from "@/lib/site";

const btn =
  "w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800";

const APP_STORE_URL = "https://apps.apple.com/jp/app/id1611900581";

const READING_LINKS = [
  { href: "/guide", label: "ガイド・特集" },
  { href: "/reports", label: "月間レポート" },
  { href: "/events", label: "誕生日・周年カレンダー" },
] as const;

export function SettingsList() {
  const [message, setMessage] = useState("");

  const share = async () => {
    const data = {
      title: "Vちゃんねる",
      text: "VTuberの配信スケジュール・ニュース・ランキング",
      url: window.location.origin,
    };
    try {
      if (navigator.share) {
        await navigator.share(data);
      } else {
        await navigator.clipboard.writeText(data.url);
        setMessage("リンクをコピーしました");
      }
    } catch {
      // 共有ダイアログのキャンセルは何もしない
    }
  };

  return (
    <div className="space-y-3">
      <section className="space-y-2">
        <h2 className="text-sm font-bold">読みもの</h2>
        {READING_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${btn} flex items-center justify-between gap-2`}
          >
            <span>{item.label}</span>
            <ChevronRight size={16} aria-hidden className="shrink-0" />
          </Link>
        ))}
      </section>

      <button type="button" onClick={share} className={btn}>
        共有する
      </button>
      <button
        type="button"
        onClick={() => {
          if (
            window.confirm(
              "事務所の絞り込みを解除しますか？",
            )
          ) {
            resetSelection();
          }
        }}
        className={btn}
      >
        事務所の絞り込みを解除
      </button>
      {message && (
        <p role="status" className="text-sm text-emerald-600">
          {message}
        </p>
      )}

      <section className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <h2 className="mb-2 font-bold">アプリ版</h2>
        <p className="mb-3 text-zinc-600 dark:text-zinc-400">
          iPhone アプリなら、推しの配信開始をプッシュ通知でお知らせします。
        </p>
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener"
          className={`${btn} flex items-center gap-2`}
        >
          <Smartphone size={16} aria-hidden />
          <span>App Store で見る</span>
        </a>
      </section>

      <section className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <h2 className="mb-2 font-bold">アプリ情報</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Vちゃんねるは、VTuberの配信スケジュール・ニュース・ランキングをまとめて確認できるサービスです。
          データはYouTubeなどの公開情報をもとに定期的に更新しています。
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          お気に入りや選択した事務所は、お使いのブラウザ内（localStorage）にのみ保存されます。
        </p>
        <p className="mt-3 text-xs text-zinc-500">
          お問い合わせ：
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="ml-1 text-blue-600 underline hover:text-blue-500 dark:text-blue-400"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
        <p className="mt-2">
          <Link
            href="/privacy"
            className="text-sm text-blue-600 underline hover:text-blue-500 dark:text-blue-400"
          >
            プライバシーポリシー・広告について
          </Link>
        </p>
      </section>
    </div>
  );
}
