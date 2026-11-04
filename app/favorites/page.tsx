import { FavoritesList } from "@/components/FavoritesList";

export const metadata = { title: "お気に入り", robots: { index: false } };

export default function FavoritesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-6 md:py-8">
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight">
        お気に入り
      </h1>
      <FavoritesList />
    </main>
  );
}
