import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getUserBooks } from '@/lib/actions/book.actions';
import {
  getUserSessions,
  SessionHistoryItem,
} from '@/lib/actions/session.actions';
import { getLatestUserStudyProgress } from '@/lib/actions/study-progress.actions';
import { IBook } from '@/types';

const ActiveSpacePage = async () => {
  const { userId } = await auth();
  if (!userId) redirect('/');

  const [sessionsResult, booksResult, progressResult] = await Promise.all([
    getUserSessions(3),
    getUserBooks(),
    getLatestUserStudyProgress(),
  ]);

  const sessions = sessionsResult.success
    ? (sessionsResult.data as SessionHistoryItem[])
    : [];

  const books = (booksResult.success ? (booksResult.data as IBook[]) ?? [] : []);

  // Resume target: book from most recent study progress > latest voice session > in_progress book > newest book
  const latestStudySlug = progressResult?.data?.bookSlug;
  const lastSessionSlug = sessions[0]?.bookSlug;
  const targetBook =
    (latestStudySlug ? books.find((b) => b.slug === latestStudySlug) : null) ||
    (lastSessionSlug ? books.find((b) => b.slug === lastSessionSlug) : null) ||
    books.find((b) => b.readingStatus === 'in_progress') ||
    books[0] ||
    null;

  if (targetBook) {
    redirect(`/books/${targetBook.slug}`);
  }

  // If no books are on the shelf yet, direct the user to their library to upload one
  redirect('/library');
};

export default ActiveSpacePage;
