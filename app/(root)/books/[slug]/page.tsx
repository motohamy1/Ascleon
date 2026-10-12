import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getBookBySlug, getBookSegments } from "@/lib/actions/book.actions";
import BookExperience from "@/components/reader/BookExperience";
import { sampleBooks } from "@/lib/constants";
import { IBook, IBookSegmentData } from "@/types";

export default async function BookDetailsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { userId } = await auth();

  const { slug } = await params;
  const result = await getBookBySlug(slug);

  let book: IBook | null =
    result.success && result.data ? (result.data as IBook) : null;

  // Fallback to sample book if not in DB
  if (!book) {
    const foundSample = sampleBooks.find((b) => b.slug === slug);
    if (foundSample) {
      book = foundSample as unknown as IBook;
    }
  }

  if (!book) {
    redirect("/");
  }

  let segments: IBookSegmentData[] = [];
  if (result.success && result.data?._id) {
    const segResult = await getBookSegments(result.data._id);
    if (segResult.success && segResult.data) {
      segments = segResult.data;
    }
  }

  return (
    <BookExperience
      book={book}
      segments={segments}
      isAuthenticated={Boolean(userId)}
    />
  );
}
