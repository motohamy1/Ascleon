import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getActiveStudySource } from '@/lib/actions/study-progress.actions';

const ActiveSpacePage = async () => {
  const { userId } = await auth();
  if (!userId) redirect('/');

  const activeStudyRes = await getActiveStudySource();
  const activeStudy = activeStudyRes.success ? activeStudyRes.data : null;

  if (activeStudy?.slug) {
    redirect(`/books/${activeStudy.slug}`);
  }

  // If no books are on the shelf yet, direct the user to their library to upload one
  redirect('/library');
};

export default ActiveSpacePage;
