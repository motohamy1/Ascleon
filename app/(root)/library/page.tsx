import Link from 'next/link';
import { ArrowUpRight, Library as LibraryIcon } from 'lucide-react';
import { getAllBooks } from '@/lib/actions/book.actions';
import PersonalLibrary from '@/components/library/PersonalLibrary';
import Search from '@/components/Search';
import { sampleBooks } from '@/lib/constants';
import { IBook } from '@/types';

interface LibraryPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const LibraryPage = async ({ searchParams }: LibraryPageProps) => {
  const params = await searchParams;
  const searchQuery = typeof params.search === 'string' ? params.search : undefined;

  const bookResults = await getAllBooks(searchQuery);
  const dbBooks = bookResults.success
    ? (bookResults.data as IBook[]) ?? []
    : [];

  const books: IBook[] =
    dbBooks.length > 0
      ? dbBooks
      : !searchQuery
        ? (sampleBooks as unknown as IBook[])
        : [];

  return (
    <main className="mx-auto w-full max-w-[1580px] px-3 pt-[108px] pb-16 sm:px-4 sm:pt-[116px] acid-bg">
      <div className="rounded-[32px] bg-[color:var(--ink)] p-3 shadow-frame sm:p-4">
        <header className="flex flex-col gap-4 rounded-[22px] bg-[color:var(--cream)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="flex items-center gap-5">
            <h1 className="display text-[40px] text-[color:var(--ink)] sm:text-[52px]">
              Library
            </h1>
            <span className="meta-label flex items-center gap-2 rounded-full border-2 border-[color:var(--ink)] px-3 py-1.5 text-[color:var(--ink)]">
              <LibraryIcon className="size-3.5" />
              {books.length} books
            </span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Search />
            <Link
              href="/books/new"
              className="group flex shrink-0 items-center justify-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[color:var(--ink)] shadow-chip transition-transform hover:-translate-y-0.5"
            >
              Add book
              <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </header>

        <div className="mt-3 rounded-[18px] bg-[color:var(--panel)] p-3 sm:p-5">
          <PersonalLibrary initialBooks={books} />
        </div>
      </div>
    </main>
  );
};

export default LibraryPage;
