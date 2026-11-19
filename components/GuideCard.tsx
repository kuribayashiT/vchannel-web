import Link from "next/link";
import type { Guide } from "@/lib/guide";

export function GuideCard({ guide }: { guide: Guide }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
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
          className="hover:text-blue-700 dark:hover:text-blue-300"
        >
          {guide.title}
        </Link>
      </h3>
      <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {guide.description}
      </p>
    </article>
  );
}
