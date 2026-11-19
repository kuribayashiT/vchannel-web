import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

export const GUIDE_CATEGORIES = [
  "事務所紹介",
  "データ解説",
  "使い方・入門",
] as const;

export type GuideCategory = (typeof GUIDE_CATEGORIES)[number];

export type Guide = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  category: GuideCategory;
  relatedVtubers?: string[];
  html: string;
};

const GUIDE_DIR = path.join(process.cwd(), "content", "guide");
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toISOString().slice(0, 10) === value;
}

function parseGuide(filename: string): Guide {
  const slug = filename.slice(0, -".md".length);
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid guide slug in filename: ${filename}`);
  }

  const source = readFileSync(path.join(GUIDE_DIR, filename), "utf8");
  const { data, content } = matter(source);
  if (
    typeof data.title !== "string" ||
    !data.title.trim() ||
    typeof data.description !== "string" ||
    !data.description.trim() ||
    !isDate(data.publishedAt) ||
    (data.updatedAt !== undefined && !isDate(data.updatedAt)) ||
    !GUIDE_CATEGORIES.includes(data.category)
  ) {
    throw new Error(`Invalid frontmatter in guide: ${filename}`);
  }

  if (
    data.relatedVtubers !== undefined &&
    (!Array.isArray(data.relatedVtubers) ||
      !data.relatedVtubers.every(
        (channelId: unknown) =>
          typeof channelId === "string" && channelId.trim().length > 0,
      ))
  ) {
    throw new Error(`Invalid relatedVtubers in guide: ${filename}`);
  }

  const guide: Guide = {
    slug,
    title: data.title.trim(),
    description: data.description.trim(),
    publishedAt: data.publishedAt,
    category: data.category,
    html: marked.parse(content, { async: false }),
  };
  if (data.updatedAt) guide.updatedAt = data.updatedAt;
  if (data.relatedVtubers) guide.relatedVtubers = data.relatedVtubers;
  return guide;
}

export function getAllGuides(): Guide[] {
  return readdirSync(GUIDE_DIR)
    .filter((filename) => filename.endsWith(".md"))
    .map(parseGuide)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function getGuide(slug: string): Guide | undefined {
  return getAllGuides().find((guide) => guide.slug === slug);
}
