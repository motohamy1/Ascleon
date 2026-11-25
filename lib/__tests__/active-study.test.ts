import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const mockAuth = vi.fn();
const mockConnectToDatabase = vi.fn();
const mockStudyProgressFind = vi.fn();
const mockVoiceSessionFind = vi.fn();
const mockBookFind = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/database/mongoose", () => ({
  connectToDatabase: () => mockConnectToDatabase(),
}));

vi.mock("@/database/models/study-progress.model", () => ({
  default: {
    find: (...args: unknown[]) => mockStudyProgressFind(...args),
  },
}));

vi.mock("@/database/models/voice-session.model", () => ({
  default: {
    find: (...args: unknown[]) => mockVoiceSessionFind(...args),
  },
}));

vi.mock("@/database/models/book.model", () => ({
  default: {
    find: (...args: unknown[]) => mockBookFind(...args),
  },
}));

function makeQueryChain<T>(result: T) {
  const chain = {
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: async () => result,
  };
  return chain;
}

describe("getActiveStudySource consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockConnectToDatabase.mockResolvedValue(undefined);
  });

  it("prioritizes most recent StudyProgress over older VoiceSession", async () => {
    mockStudyProgressFind.mockReturnValue(
      makeQueryChain([
        {
          bookSlug: "cardiology-notes",
          lastStudiedPage: 12,
          totalPages: 40,
          progressPercent: 30,
          activeIntent: "morph",
        },
      ]),
    );
    mockVoiceSessionFind.mockReturnValue(
      makeQueryChain([{ bookId: "book_voice_id" }]),
    );
    mockBookFind.mockReturnValue(
      makeQueryChain([
        {
          _id: "book_voice_id",
          title: "Voice Session Book",
          slug: "voice-session-book",
          author: "Dr. A",
          totalPages: 100,
          readingStatus: "in_progress",
        },
        {
          _id: "book_cardio_id",
          title: "Cardiology Notes",
          slug: "cardiology-notes",
          author: "Dr. B",
          totalPages: 40,
          readingStatus: "in_progress",
        },
      ]),
    );

    const { getActiveStudySource } = await import("@/lib/actions/study-progress.actions");
    const res = await getActiveStudySource();

    expect(res.success).toBe(true);
    expect(res.data?.slug).toBe("cardiology-notes");
    expect(res.data?.lastStudiedPage).toBe(12);
    expect(res.data?.progressPercent).toBe(30);
    expect(res.data?.activeIntent).toBe("morph");
  });

  it("skips deleted-book StudyProgress and resolves next valid StudyProgress or VoiceSession", async () => {
    mockStudyProgressFind.mockReturnValue(
      makeQueryChain([
        {
          bookSlug: "deleted-book",
          lastStudiedPage: 5,
          totalPages: 20,
          progressPercent: 25,
        },
        {
          bookSlug: "renal-guide",
          lastStudiedPage: 8,
          totalPages: 16,
          progressPercent: 50,
          activeIntent: "quiz",
        },
      ]),
    );
    mockVoiceSessionFind.mockReturnValue(makeQueryChain([]));
    mockBookFind.mockReturnValue(
      makeQueryChain([
        {
          _id: "book_renal_id",
          title: "Renal Guide",
          slug: "renal-guide",
          totalPages: 16,
          readingStatus: "in_progress",
        },
      ]),
    );

    const { getActiveStudySource } = await import("@/lib/actions/study-progress.actions");
    const res = await getActiveStudySource();

    expect(res.success).toBe(true);
    expect(res.data?.slug).toBe("renal-guide");
    expect(res.data?.progressPercent).toBe(50);
  });

  it("keeps Home, Library, Study Hub, and Active Space aligned on getActiveStudySource", () => {
    const pages = [
      "app/(root)/page.tsx",
      "app/(root)/library/page.tsx",
      "app/(root)/study-hub/page.tsx",
      "app/(root)/space/active/page.tsx",
    ];
    for (const rel of pages) {
      const content = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(content, `${rel} should use getActiveStudySource`).toContain("getActiveStudySource");
    }
  });
});
