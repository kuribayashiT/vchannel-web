import type { Metadata } from "next";
import Link from "next/link";

const PAGE_TITLE = "利用規約";
const PAGE_DESCRIPTION =
  "Vちゃんねるの利用規約です。掲示板の利用ルール、免責事項、著作権、規約変更について定めています。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/terms" },
  openGraph: { title: PAGE_TITLE, description: PAGE_DESCRIPTION, url: "/terms" },
  twitter: { title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">利用規約</h1>

      <div className="space-y-6 text-sm leading-7">
        <section>
          <h2 className="mb-2 text-base font-bold">適用</h2>
          <p>
            本規約は、Vちゃんねる（以下「当サイト」）の利用に関する条件を定めるものです。ユーザーは本規約に同意したうえで、当サイトを利用するものとします。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">掲示板の利用について</h2>
          <p>
            掲示板では、他者への敬意をもってご利用ください。以下に該当する投稿は禁止します。
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>誹謗中傷、名誉毀損、嫌がらせにあたる内容</li>
            <li>個人情報の投稿、詮索、なりすまし行為</li>
            <li>スパム、宣伝目的の連投、違法または不快なコンテンツ</li>
            <li>性的な内容</li>
            <li>差別的な表現</li>
            <li>他サイトへの誘導・宣伝</li>
          </ul>
          <p className="mt-2">
            運営者が不適切と判断した投稿は、予告なく削除または非表示にする場合があります。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">免責事項</h2>
          <p>
            当サイトに掲載する配信情報・ランキング・ニュース等の正確性、完全性、最新性を保証するものではありません。外部リンク先の内容・サービスについて、当サイトは責任を負いません。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">著作権</h2>
          <p>
            当サイトに掲載される画像、動画、名称、ロゴ等の権利は、各権利者に帰属します。権利者からの申し出があった場合は、確認のうえ速やかに対応します。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">規約の変更</h2>
          <p>
            当サイトは、必要に応じて本規約を変更できるものとします。変更後の規約は、当サイト上に掲載した時点で効力を生じます。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">お問い合わせ</h2>
          <p>
            本規約に関するお問い合わせは
            <Link href="/contact" className="ml-1 text-blue-600 underline hover:text-blue-500 dark:text-blue-400">
              お問い合わせページ
            </Link>
            からご連絡ください。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">制定日</h2>
          <p>2026-11-17</p>
        </section>
      </div>
    </main>
  );
}
