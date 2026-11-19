import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, OPERATOR_NAME } from "@/lib/site";

const PAGE_TITLE = "プライバシーポリシー";
const PAGE_DESCRIPTION =
  "Vちゃんねるのプライバシーポリシーです。広告配信（Google AdSense）、Cookie、アクセス解析、個人情報の取り扱いについて説明します。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/privacy" },
};

const LINK_CLASS =
  "text-blue-600 underline hover:text-blue-500 dark:text-blue-400";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">
        プライバシーポリシー
      </h1>

      <div className="space-y-6 text-sm leading-7">
        <section>
          <h2 className="mb-2 text-base font-bold">運営者</h2>
          <p>
            運営者名：{OPERATOR_NAME}
            <br />
            連絡先：
            <a href={`mailto:${CONTACT_EMAIL}`} className={`ml-1 ${LINK_CLASS}`}>
              {CONTACT_EMAIL}
            </a>
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">広告の掲載について</h2>
          <p>
            当サイトでは、第三者が提供するアフィリエイトプログラムや広告配信サービスを利用して商品・サービスを紹介することがあります。リンク経由で商品が購入された場合などに、当サイトに報酬が支払われることがあります。広告であることが分かるよう「PR」と表記します。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">
            広告配信について（Google AdSense）
          </h2>
          <p>
            当サイトは、第三者配信の広告サービス「Google AdSense」を利用しています（利用予定を含みます）。
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Google などの第三者配信事業者は、Cookie を使用して、ユーザーが当サイトや他のウェブサイトに過去にアクセスした際の情報に基づいて広告を配信します。
            </li>
            <li>
              Google が広告 Cookie を使用することにより、ユーザーが当サイトや他のサイトにアクセスした際の情報に基づいて、Google やそのパートナーが適切な広告をユーザーに表示できます。
            </li>
            <li>
              ユーザーは、
              <a
                href="https://adssettings.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className={`mx-1 ${LINK_CLASS}`}
              >
                広告設定
              </a>
              でパーソナライズ広告を無効にできます。また、
              <a
                href="https://www.aboutads.info/"
                target="_blank"
                rel="noopener noreferrer"
                className={`mx-1 ${LINK_CLASS}`}
              >
                www.aboutads.info
              </a>
              にアクセスすれば、パーソナライズ広告に使われる第三者配信事業者の Cookie を無効にできます。
            </li>
          </ul>
          <p className="mt-2">
            Google の広告に関するポリシーについては、
            <a
              href="https://policies.google.com/technologies/ads"
              target="_blank"
              rel="noopener noreferrer"
              className={`mx-1 ${LINK_CLASS}`}
            >
              広告 – ポリシーと規約 – Google
            </a>
            をご確認ください。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">Cookie について</h2>
          <p>
            Cookie とは、ウェブサイトを訪問した際にブラウザに保存される小さなデータです。広告配信やアクセス解析などのために利用されることがあります。Cookie にはお名前やメールアドレスなど、個人を直接特定する情報は含まれません。
          </p>
          <p className="mt-2">
            ブラウザの設定により、Cookie の受け入れを無効にすることができます。ただし、無効にすると一部の機能が正しく動作しない場合があります。
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
          <h2 className="mb-2 text-base font-bold">個人情報の取り扱い</h2>
          <p>
            お問い合わせのメールで受け取った情報（メールアドレス、お名前、お問い合わせ内容など）は、返信と対応のためだけに使用し、それ以外の目的では使用しません。法令に基づく場合を除き、本人の同意なく第三者に提供することはありません。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">掲示板への投稿</h2>
          <p>
            掲示板に投稿された名前・本文は、誰でも閲覧できる形で公開されます。個人情報（本名、住所、電話番号、メールアドレスなど）は書き込まないでください。詳しくは
            <Link href="/terms" className={`mx-1 ${LINK_CLASS}`}>
              利用規約
            </Link>
            をご確認ください。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">免責事項</h2>
          <p>
            当サイトからリンクしている外部サイトの内容やサービスについて、当サイトは責任を負いません。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">お問い合わせ</h2>
          <p>
            お問い合わせは
            <a href={`mailto:${CONTACT_EMAIL}`} className={`ml-1 ${LINK_CLASS}`}>
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
          <p>2026-11-17</p>
        </section>
      </div>

      <p className="mt-8 text-sm">
        <Link
          href="/settings"
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          設定ページに戻る
        </Link>
      </p>
    </main>
  );
}
