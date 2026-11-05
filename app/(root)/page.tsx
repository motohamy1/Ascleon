import { auth, currentUser } from "@clerk/nextjs/server";
import { getUserBooks } from "@/lib/actions/book.actions";
import {
  getUserSessions,
  SessionHistoryItem,
} from "@/lib/actions/session.actions";
import { getLatestUserStudyProgress } from "@/lib/actions/study-progress.actions";
import Welcome from "@/components/welcome/Welcome";
import ProgressView from "@/components/progress/ProgressView";
import { IBook } from "@/types";

const SpacePage = async () => {
  const [user, booksResult, sessionsResult, progressResult] = await Promise.all([
    currentUser(),
    getUserBooks(),
    getUserSessions(40),
    getLatestUserStudyProgress(),
  ]);

  const books = (booksResult.success ? (booksResult.data as IBook[]) ?? [] : []);
  const sessions = sessionsResult.success
    ? (sessionsResult.data as SessionHistoryItem[])
    : [];

  return (
    <ProgressView
      books={books}
      sessions={sessions}
      firstName={user?.firstName ?? null}
      latestStudyProgress={progressResult?.data || null}
    />
  );
};

const HomePage = async () => {
  const { userId } = await auth();

  return (
    <main className="mx-auto w-full max-w-[1840px] 2xl:max-w-[2160px] min-h-[calc(100vh-120px)] px-3.5 pt-[94px] pb-16 sm:px-6 md:px-8 lg:px-10 xl:px-12 sm:pt-[102px] acid-bg transition-all">
      {userId ? <SpacePage /> : <Welcome />}
    </main>
  );
};

export default HomePage;
