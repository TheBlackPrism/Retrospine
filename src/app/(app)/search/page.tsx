import type { Metadata } from "next";
import { SearchView } from "@/components/search/search-view";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage(props: PageProps<"/search">) {
  await requireSession();
  const params = await props.searchParams;
  const initialQuery = typeof params.q === "string" ? params.q : "";
  return (
    <div className="space-y-4">
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        Search
      </h1>
      <SearchView initialQuery={initialQuery} />
    </div>
  );
}
