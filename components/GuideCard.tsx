import Link from "next/link";
import { CardLinkStatus } from "@/components/CardLinkStatus";
import type { Guide } from "@/lib/guide";

export function GuideCard({ guide }: { guide: Guide }) {
  return (
    <article className="group relative rounded-xl border border-zinc-200 bg-white p-4 transition duration-150 hover:border-blue-400 has-[[data-pending=true]]:opacity-70 has-[:active]:scale-[0.99] has-[:active]:bg-zinc-50 touch-manipulation dark:border-zinc-800 dark:bg-zinc-900 dark:has-[:active]:bg-zinc-800">
      <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
        {guide.category}
        <span className="mx-2 text-zinc-400" aria-hidden>
          ·
        </span>
        <time dateTime={guide.publishedAt}>{guide.publishedAt}</time>
      </p>
      <h3 className="mt-2 text-base font-bold">
        <Link
          href={`/guide/${guide.slug}`}
          className="hover:text-blue-700 after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-blue-500 focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-white dark:hover:text-blue-300 dark:focus-visible:after:ring-offset-zinc-900"
        >
          {guide.title}
          <CardLinkStatus className="absolute bottom-4 right-4" />
        </Link>
      </h3>
      <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {guide.description}
      </p>
    </article>
  );
}
