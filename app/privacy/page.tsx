import Link from "next/link";

export const metadata = { title: "プライバシーポリシー・広告について" };

const CONTACT_EMAIL = "vchannel.com.info@gmail.com";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">
        プライバシーポリシー・広告について
      </h1>

      <div className="space-y-6 text-sm leading-7">
        <section>
          <h2 className="mb-2 text-base font-bold">広告の掲載について</h2>
          <p>
            当サイトでは、第三者が提供するアフィリエイトプログラムや広告配信サービスを利用して商品・サービスを紹介することがあります。リンク経由で商品が購入された場合などに、当サイトに報酬が支払われることがあります。広告であることが分かるよう「PR」と表記します。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">アクセス解析</h2>
          <p>
            当サイトでは、サービス改善のために Vercel Analytics を利用しています。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">ローカルストレージ</h2>
          <p>
            当サイトでは、お気に入り動画や事務所選択の設定を、端末内のローカルストレージに保存しています。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">お問い合わせ</h2>
          <p>
            お問い合わせは
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="ml-1 text-blue-600 underline hover:text-blue-500 dark:text-blue-400"
            >
              {CONTACT_EMAIL}
            </a>
            までご連絡ください。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">制定日</h2>
          <p>2026-11-09</p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">改定日</h2>
          <p>2026-11-11</p>
        </section>
      </div>

      <p className="mt-8 text-sm">
        <Link href="/settings" className="text-blue-600 hover:underline dark:text-blue-400">
          設定ページに戻る
        </Link>
      </p>
    </main>
  );
}
