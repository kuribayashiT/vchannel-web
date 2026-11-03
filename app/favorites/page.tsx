import { FavoritesList } from "@/components/FavoritesList";

export const metadata = { title: "お気に入り", robots: { index: false } };

export default function FavoritesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-4">
      <h1 className="mb-4 text-xl font-bold">お気に入り</h1>
      <FavoritesList />
    </main>
  );
}
