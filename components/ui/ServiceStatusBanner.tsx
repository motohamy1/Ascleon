"use client";

import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  Lock,
  RefreshCw,
  ServerCrash,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ParsedServiceError } from "@/lib/api-error-client";

interface ServiceStatusBannerProps {
  error: ParsedServiceError;
  onRetry?: () => void;
  onDismiss?: () => void;
  variant?: "light" | "dark";
  className?: string;
}

export function ServiceStatusBanner({
  error,
  onRetry,
  onDismiss,
  variant = "light",
  className,
}: ServiceStatusBannerProps) {
  const isDark = variant === "dark";

  const icon =
    error.kind === "credits" ? (
      <Sparkles className="h-4 w-4 shrink-0 text-[#ff4c00]" />
    ) : error.kind === "overloaded" ? (
      <ServerCrash className="h-4 w-4 shrink-0 text-amber-500" />
    ) : error.kind === "rate_limited" ? (
      <Clock className="h-4 w-4 shrink-0 text-amber-500" />
    ) : error.kind === "auth" ? (
      <Lock className="h-4 w-4 shrink-0 text-[#43a08f]" />
    ) : (
      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
    );

  const containerStyle = isDark
    ? error.kind === "credits"
      ? "border-[#ff4c00]/50 bg-[#2b1d14] text-[#F4ECE1]"
      : "border-amber-400/40 bg-[#282117] text-[#F4ECE1]"
    : error.kind === "credits"
      ? "border-[#ff4c00] bg-[#fff5f0] text-[#212a3b]"
      : error.kind === "overloaded" || error.kind === "rate_limited"
        ? "border-amber-500/70 bg-amber-50/90 text-[#212a3b]"
        : "border-rose-400/70 bg-rose-50/90 text-[#212a3b]";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-xl border-2 p-3.5 text-xs shadow-sm transition-all",
        containerStyle,
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5">{icon}</div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold tracking-tight">{error.title}</p>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss message"
                className={cn(
                  "rounded p-0.5 transition-colors cursor-pointer",
                  isDark
                    ? "text-white/50 hover:bg-white/10 hover:text-white"
                    : "text-[#212a3b]/50 hover:bg-black/5 hover:text-[#212a3b]"
                )}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p
            className={cn(
              "leading-relaxed",
              isDark ? "text-white/80" : "text-[#3d485e]"
            )}
          >
            {error.message}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {error.kind === "credits" && error.upgradeHref && (
              <Link
                href={error.upgradeHref}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#212a3b] bg-[#ff4c00] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#212a3b] transition-transform hover:-translate-y-0.5"
              >
                <Sparkles className="h-3 w-3" />
                Upgrade Plan
              </Link>
            )}
            {(error.kind === "overloaded" || error.kind === "generic") && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
                  isDark
                    ? "bg-white/15 text-white hover:bg-white/25"
                    : "bg-[#212a3b] text-white hover:bg-[#3d485e]"
                )}
              >
                <RefreshCw className="h-3 w-3" />
                Try Again
              </button>
            )}
            {error.errorId && (
              <span
                className={cn(
                  "font-mono text-[10px]",
                  isDark ? "text-white/40" : "text-[#3d485e]/60"
                )}
              >
                Ref: {error.errorId}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
