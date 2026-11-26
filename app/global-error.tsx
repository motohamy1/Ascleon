"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[GlobalError]", error);
    }
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex min-h-screen items-center justify-center bg-[#FAFAF8] px-4">
          <div className="max-w-md rounded-2xl border-2 border-[#212a3b] bg-white p-6 text-center shadow-lg">
            <h1 className="text-2xl font-bold text-[#212a3b]">Application Error</h1>
            <p className="mt-2 text-sm text-[#3d485e]">
              Something unexpected interrupted this page. Your study data is safe—please try again.
            </p>
            {error.digest && (
              <p className="mt-2 text-xs text-[#3d485e]/70">
                Reference: <span className="font-mono">{error.digest}</span>
              </p>
            )}
            <button
              onClick={reset}
              className="mt-4 cursor-pointer rounded-lg bg-[#212a3b] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d485e]"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
