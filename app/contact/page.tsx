import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/lib/site";

const PAGE_TITLE = "お問い合わせ";
const PAGE_DESCRIPTION =
  "Vちゃんねるのお問い合わせ窓口です。用件ごとに件名付きメールリンクからご連絡ください。";

const CONTACT_SUBJECTS = [
  "掲載情報の修正依頼",
  "掲載内容の削除依頼（権利者の方）",
  "掲示板の投稿の通報",
  "広告・提携に関するお問い合わせ",
  "その他のお問い合わせ",
] as const;

function buildMailto(subject: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/contact" },
  openGraph: { title: PAGE_TITLE, description: PAGE_DESCRIPTION, url: "/contact" },
  twitter: { title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">お問い合わせ</h1>

      <p className="mb-4 text-sm leading-7 text-zinc-700 dark:text-zinc-300">
        ご用件に近い項目を選ぶと、件名入りメールを作成できます。フォームの送信機能は設けていないため、メールでご連絡ください。
      </p>

      <div className="space-y-3">
        {CONTACT_SUBJECTS.map((subject) => (
          <a
            key={subject}
            href={buildMailto(subject)}
            className="block rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            {subject}
          </a>
        ))}
      </div>

      <section className="mt-8 space-y-2 text-sm">
        <h2 className="text-base font-bold">メールアドレス</h2>
        <p className="rounded-md bg-zinc-100 px-3 py-2 font-mono text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
          {CONTACT_EMAIL}
        </p>
      </section>

      <section className="mt-8 space-y-2 text-sm leading-7 text-zinc-700 dark:text-zinc-300">
        <h2 className="text-base font-bold">注意事項</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>内容確認のため、返信までに数日かかる場合があります。</li>
          <li>VTuber本人や所属事務所へのメッセージの取り次ぎは行っていません。</li>
        </ul>
      </section>
    </main>
  );
}
