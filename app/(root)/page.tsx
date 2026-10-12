import Hero from "@/components/Hero";
import { getAllBooks } from "@/lib/actions/book.actions";
import Search from "@/components/Search";
import PersonalLibrary from "@/components/library/PersonalLibrary";
import { sampleBooks } from "@/lib/constants";
import { IBook } from "@/types";

export const revalidate = 60;

interface HomeProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const Home = async ({ searchParams }: HomeProps) => {
  const params = await searchParams;
  const searchQuery = typeof params.search === "string" ? params.search : undefined;

  const bookResults = await getAllBooks(searchQuery);
  const dbBooks = bookResults.success ? (bookResults.data as IBook[]) ?? [] : [];

  // Fallback to rich sample library if no books have been uploaded yet and no search active
  const books: IBook[] =
    dbBooks.length > 0
      ? dbBooks
      : !searchQuery
        ? (sampleBooks as unknown as IBook[])
        : [];

  return (
    <main className="max-w-7xl mx-auto px-5 w-full min-h-screen bg-[#FAFAF8] pt-6 sm:pt-8 pb-20">
      <Hero />

      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="section-title text-2xl sm:text-3xl font-serif font-bold text-[#212A3B]">
              Personal Library
            </h2>
            <p className="text-xs sm:text-sm text-[#736B63] mt-0.5">
              Browse your books on the interactive shelf or grid
            </p>
          </div>
          <Search />
        </div>

        <PersonalLibrary initialBooks={books} />
      </div>
    </main>
  );
};

export default Home;
