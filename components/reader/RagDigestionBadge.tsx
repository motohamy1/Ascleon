"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { CheckCircle2, RefreshCw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface RagDigestionBadgeProps {
  bookId: string;
  initialStatus?: string;
  initialProgress?: number;
  onBlueprintUpdated?: (newBlueprint: any) => void;
  className?: string;
}

export function RagDigestionBadge({
  bookId,
  initialStatus = "completed",
  initialProgress = 100,
  onBlueprintUpdated,
  className,
}: RagDigestionBadgeProps) {
  const [status, setStatus] = useState<string>(initialStatus);
  const [progress, setProgress] = useState<number>(initialProgress);
  const [stage, setStage] = useState<string>("RAG Index Ready");
  const [domain, setDomain] = useState<string>("");
  const [retryNonce, setRetryNonce] = useState(0);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoHealedRef = useRef<boolean>(false);

  const triggerReindex = useCallback(async () => {
    try {
      await fetch("/api/books/ingest-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
    } catch {
      // Non-fatal
    }
  }, [bookId]);

  useEffect(() => {
    let isMounted = true;

    const startPolling = () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(checkStatus, 3000);
    };

    async function checkStatus() {
      try {
        const res = await fetch(`/api/books/${bookId}/ingestion-status`);
        if (!res.ok) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          if (isMounted) setStatus(res.status === 404 ? "unavailable" : "failed");
          return;
        }
        const data = await res.json();
        if (!isMounted) return;

        if (data.needsReindex && !autoHealedRef.current) {
          autoHealedRef.current = true;
          setStatus("processing");
          setProgress(10);
          setStage("Indexing study pages for RAG...");
          await triggerReindex();
          startPolling();
          return;
        }

        setStatus(data.status || "completed");
        setProgress(data.progress ?? 100);
        setStage(data.stage || "completed");
        if (data.domain) setDomain(data.domain);

        if (data.status === "completed") {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          if (onBlueprintUpdated && data.blueprint) {
            onBlueprintUpdated(data.blueprint);
          }
        } else if (data.status === "processing" || data.status === "pending") {
          if (!pollTimerRef.current) startPolling();
        }
      } catch {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        if (isMounted) setStatus("failed");
      }
    }

    if (
      initialStatus === "processing" ||
      initialStatus === "pending" ||
      initialProgress < 100
    ) {
      checkStatus();
      startPolling();
    } else {
      checkStatus();
    }

    return () => {
      isMounted = false;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [bookId, initialStatus, initialProgress, onBlueprintUpdated, retryNonce, triggerReindex]);

  const isFailed = status === "failed" || status === "unavailable" || status === "stale";
  const isCompleted = !isFailed && (status === "completed" || progress >= 100);

  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border transition-all duration-300 shadow-xs",
        isCompleted
          ? "border-[#43a08f]/40 bg-[#43a08f]/15 text-[var(--study-teal-text,#1f6e60)]"
          : isFailed
          ? "border-red-500/40 bg-red-500/12 text-red-600 dark:text-red-300"
          : "border-[color:var(--orange)]/40 bg-[color:var(--orange)]/15 text-[var(--study-text)] animate-pulse",
        className
      )}
      title={stage}
    >
      {isCompleted ? (
        <>
          <CheckCircle2 className="size-3 text-[#43a08f] shrink-0" />
          <span className="font-mono uppercase tracking-wider text-[9.5px] whitespace-nowrap">RAG Ready</span>
          {domain && domain.trim().toLowerCase() !== "general" && (
            <span className="hidden sm:inline max-w-[96px] truncate opacity-80 border-l border-current/25 pl-1 font-sans">
              {domain}
            </span>
          )}
        </>
      ) : isFailed ? (
        <>
          <AlertCircle className="size-3 text-red-500 shrink-0" />
          <span className="whitespace-nowrap">{status === "unavailable" ? "Index Unavailable" : "Sync Needed"}</span>
          <button
            type="button"
            onClick={() => {
              autoHealedRef.current = true;
              setStatus("processing");
              setProgress(10);
              setStage("Re-indexing book pages...");
              triggerReindex().finally(() => setRetryNonce((n) => n + 1));
            }}
            className="ml-1 inline-flex items-center gap-1 rounded-full border border-red-500/35 bg-red-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-red-700 dark:text-red-200 hover:bg-red-500/25 cursor-pointer shrink-0"
            title="Trigger RAG page indexing"
          >
            <RefreshCw className="size-2.5" />
            <span>Retry</span>
          </button>
        </>
      ) : (
        <>
          <RefreshCw className="size-3 animate-spin text-[color:var(--orange)]" />
          <span className="font-mono">{progress}%</span>
          <span className="hidden md:inline max-w-[120px] truncate opacity-90">{stage}</span>
        </>
      )}
    </div>
  );
}
