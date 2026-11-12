import { auth, currentUser } from "@clerk/nextjs/server";
import Welcome from "@/components/welcome/Welcome";
import { getActiveStudySource } from "@/lib/actions/study-progress.actions";

const HomePage = async () => {
  const { userId } = await auth();

  let userFirstName: string | null = null;
  let activeStudy = null;

  if (userId) {
    try {
      const [user, activeSourceRes] = await Promise.all([
        currentUser(),
        getActiveStudySource(),
      ]);

      userFirstName =
        user?.firstName ||
        user?.fullName ||
        user?.username ||
        (user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ?? null);

      if (activeSourceRes.success && activeSourceRes.data) {
        activeStudy = activeSourceRes.data;
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
      />
    </main>
  );
};

export default HomePage;
