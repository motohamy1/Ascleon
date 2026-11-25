import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { connectToDatabase } from "@/database/mongoose";
import StudyPlan from "@/database/models/study-plan.model";
import { serializeStudyPlan } from "@/lib/study-plan/utils";
import { getUserBooks } from "@/lib/actions/book.actions";
import { getActiveStudySource } from "@/lib/actions/study-progress.actions";
import ProgressView from "@/components/progress/ProgressView";
import { IBook } from "@/types";

export const metadata: Metadata = {
  title: "Study Hub",
  description: "Track your active medical study progress and exam roadmaps.",
};

export default async function StudyHubPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/");
  }

  await connectToDatabase();

  const [user, booksResult, activeStudyRes, planDocs] = await Promise.all([
    currentUser(),
    getUserBooks(),
    getActiveStudySource(),
    StudyPlan.find({ clerkId: userId }).sort({ updatedAt: -1 }).limit(20).lean(),
  ]);

  const books = booksResult.success ? ((booksResult.data as IBook[]) ?? []) : [];
  const initialPlans = planDocs.map(serializeStudyPlan);

  return (
    <main className="mx-auto w-full max-w-[1840px] 2xl:max-w-[2160px] min-h-[calc(100vh-120px)] px-3.5 pt-[94px] pb-16 sm:px-6 md:px-8 lg:px-10 xl:px-12 sm:pt-[102px] acid-bg transition-all">
      <ProgressView
        books={books}
        firstName={user?.firstName ?? null}
        activeStudy={activeStudyRes.success ? activeStudyRes.data : null}
        initialPlans={initialPlans}
      />
    </main>
  );
}
