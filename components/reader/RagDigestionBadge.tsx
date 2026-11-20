"use client";

import React, { useEffect, useState, useRef } from "react";
import { Sparkles, CheckCircle2, RefreshCw, AlertCircle, Layers } from "lucide-react";
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

  useEffect(() => {
    let isMounted = true;

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

        setStatus(data.status || "completed");
        setProgress(data.progress ?? 100);
        setStage(data.stage || "completed");
        if (data.domain) setDomain(data.domain);

        if (data.status === "completed") {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          if (onBlueprintUpdated && data.blueprint) {
            onBlueprintUpdated(data.blueprint);
          }
        }
      } catch (e) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        if (isMounted) setStatus("failed");
      }
    }

    if (initialStatus === "processing" || initialStatus === "pending" || initialProgress < 100) {
      checkStatus();
      pollTimerRef.current = setInterval(checkStatus, 3000);
    } else {
      checkStatus();
    }

    return () => {
      isMounted = false;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [bookId, initialStatus, initialProgress, onBlueprintUpdated, retryNonce]);

  const isFailed = status === "failed" || status === "unavailable";
  const isCompleted = !isFailed && (status === "completed" || progress >= 100);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border transition-all duration-300 shadow-xs",
        isCompleted
          ? "border-[#43a08f]/40 bg-[#43a08f]/15 text-[#7fd8c9]"
          : isFailed
          ? "border-red-500/40 bg-red-500/10 text-red-200"
          : "border-[color:var(--orange)]/40 bg-[color:var(--orange)]/15 text-[color:var(--cream)] animate-pulse",
        className
      )}
      title={stage}
    >
      {isCompleted ? (
        <>
          <CheckCircle2 className="size-3 text-[#43a08f]" />
          <span className="font-mono uppercase tracking-wider text-[9.5px]">RAG Ready</span>
          {domain && domain.trim().toLowerCase() !== "general" && (
            <span className="hidden sm:inline opacity-80 border-l border-white/20 pl-1 font-sans">
              {domain}
            </span>
          )}
        </>
      ) : isFailed ? (
        <>
          <AlertCircle className="size-3 text-red-400 shrink-0" />
          <span>{status === "unavailable" ? "Index Unavailable" : "Sync Failed"}</span>
          <button
            type="button"
            onClick={() => {
              setStatus("processing");
              setStage("Retrying index check...");
              setRetryNonce((n) => n + 1);
            }}
            className="ml-1 inline-flex items-center gap-1 rounded-full border border-red-300/35 bg-red-400/15 px-1.5 py-0.5 text-[9.5px] font-bold text-red-100 hover:bg-red-400/25 cursor-pointer"
            title="Retry ingestion status check"
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
