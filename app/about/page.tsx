import type { Metadata } from "next";
import Link from "next/link";
import {
  CONTACT_EMAIL,
  OPERATOR_NAME,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";

const PAGE_TITLE = "このサイトについて（運営者情報）";
const PAGE_DESCRIPTION =
  "Vちゃんねるの運営者情報、掲載データの方針、免責事項をまとめたページです。";

export function generateMetadata(): Metadata {
  return {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    alternates: { canonical: "/about" },
    openGraph: { title: PAGE_TITLE, description: PAGE_DESCRIPTION, url: "/about" },
    twitter: { title: PAGE_TITLE, description: PAGE_DESCRIPTION },
  };
}

export default function AboutPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "AboutPage",
        name: PAGE_TITLE,
        description: PAGE_DESCRIPTION,
        url: `${SITE_URL}/about`,
        mainEntity: { "@id": `${SITE_URL}/about#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/about#organization`,
        name: SITE_NAME,
        email: CONTACT_EMAIL,
        url: SITE_URL,
      },
    ],
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">
        このサイトについて（運営者情報）
      </h1>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <div className="space-y-6 text-sm leading-7">
        <section>
          <h2 className="mb-2 text-base font-bold">Vちゃんねるとは</h2>
          <p>
            Vちゃんねるは、VTuberの配信スケジュール、登録者数ランキング、誕生日・デビュー記念日、ニュースをまとめて確認できる非公式のファンサイトです。推しの活動を追いかけたいファンが、毎日の情報収集をしやすくすることを目的に運営しています。
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <Link href="/" className="text-blue-600 underline hover:text-blue-500 dark:text-blue-400">
                配信ページ
              </Link>
              ：配信中・配信予定・過去アーカイブを確認できます。
            </li>
            <li>
              <Link href="/ranking" className="text-blue-600 underline hover:text-blue-500 dark:text-blue-400">
                ランキング
              </Link>
              ：登録者数や週間再生数などを比較できます。
            </li>
            <li>
              <Link href="/events" className="text-blue-600 underline hover:text-blue-500 dark:text-blue-400">
                イベント
              </Link>
              ：誕生日・デビュー記念日を日付ごとに確認できます。
            </li>
            <li>
              <Link href="/news" className="text-blue-600 underline hover:text-blue-500 dark:text-blue-400">
                ニュース
              </Link>
              ：VTuber関連の話題をまとめてチェックできます。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">掲載データについて</h2>
          <p>
            掲載データは、YouTubeの公開データなどをもとに定期的に集計しています。配信情報は数分〜1時間程度の間隔で更新され、登録者数は1日1回更新します。数値は集計時点のものであり、公式発表や各サービス上の最新表示と差が出る場合があります。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">運営者</h2>
          <p>{OPERATOR_NAME}</p>
          <p>
            連絡先：
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="ml-1 text-blue-600 underline hover:text-blue-500 dark:text-blue-400"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
          <p>
            お問い合わせ窓口は
            <Link href="/contact" className="ml-1 text-blue-600 underline hover:text-blue-500 dark:text-blue-400">
              お問い合わせページ
            </Link>
            でも案内しています。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">免責事項・権利について</h2>
          <p>
            当サイトは非公式ファンサイトであり、各VTuber・所属事務所・関係企業とは関係ありません。掲載している画像・動画・名称等の権利は、各権利者に帰属します。掲載内容の修正・削除のご依頼は
            <Link href="/contact" className="ml-1 text-blue-600 underline hover:text-blue-500 dark:text-blue-400">
              お問い合わせ
            </Link>
            からご連絡ください。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">広告について</h2>
          <p>
            当サイトでは、アフィリエイト（PR表記を含む）および広告配信サービスを利用しています。詳細は
            <Link href="/privacy" className="ml-1 text-blue-600 underline hover:text-blue-500 dark:text-blue-400">
              プライバシーポリシー
            </Link>
            をご確認ください。
          </p>
        </section>
      </div>
    </main>
  );
}
