import { auth, currentUser } from "@clerk/nextjs/server";
import { getAllBooks } from "@/lib/actions/book.actions";
import {
  getUserSessions,
  SessionHistoryItem,
} from "@/lib/actions/session.actions";
import Welcome from "@/components/welcome/Welcome";
import ProgressView from "@/components/progress/ProgressView";
import { IBook } from "@/types";

const SpacePage = async () => {
  const user = await currentUser();

  const booksResult = await getAllBooks();
  const books = (booksResult.success ? (booksResult.data as IBook[]) ?? [] : []);

  const sessionsResult = await getUserSessions(40);
  const sessions = sessionsResult.success
    ? (sessionsResult.data as SessionHistoryItem[])
    : [];

  return <ProgressView books={books} sessions={sessions} firstName={user?.firstName ?? null} />;
};

const HomePage = async () => {
  const { userId } = await auth();

  return (
    <main className="mx-auto w-full max-w-[1580px] px-3 pt-[108px] pb-16 sm:px-4 sm:pt-[116px] acid-bg">
      {userId ? <SpacePage /> : <Welcome />}
    </main>
  );
};

export default HomePage;
