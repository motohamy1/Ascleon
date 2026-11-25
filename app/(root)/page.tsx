import { auth, currentUser } from "@clerk/nextjs/server";
import Welcome from "@/components/welcome/Welcome";
import { getActiveStudySource } from "@/lib/actions/study-progress.actions";
import { getUserBooks } from "@/lib/actions/book.actions";
import { getUserSessions, SessionHistoryItem } from "@/lib/actions/session.actions";
import { IBook } from "@/types";

const HomePage = async () => {
  const { userId } = await auth();

  let userFirstName: string | null = null;
  let activeStudy = null;
  let books: IBook[] = [];
  let sessions: SessionHistoryItem[] = [];

  if (userId) {
    try {
      const [user, activeSourceRes, booksRes, sessionsRes] = await Promise.all([
        currentUser(),
        getActiveStudySource(),
        getUserBooks(),
        getUserSessions(40),
      ]);

      userFirstName =
        user?.firstName ||
        user?.fullName ||
        user?.username ||
        (user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ?? null);

      if (activeSourceRes.success && activeSourceRes.data) {
        activeStudy = activeSourceRes.data;
      }
      if (booksRes.success && booksRes.data) {
        books = booksRes.data as IBook[];
      }
      if (sessionsRes.success && sessionsRes.data) {
        sessions = sessionsRes.data as SessionHistoryItem[];
      }
    } catch (err) {
      console.error("Error retrieving user home page session:", err);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1840px] 2xl:max-w-[2160px] min-h-[calc(100vh-120px)] px-3.5 pt-[94px] pb-16 sm:px-6 md:px-8 lg:px-10 xl:px-12 sm:pt-[102px] acid-bg transition-all">
      <Welcome
        userFirstName={userFirstName}
        activeStudy={activeStudy}
        books={books}
        sessions={sessions}
      />
    </main>
  );
};

export default HomePage;
