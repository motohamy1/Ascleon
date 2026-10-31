"use client";

// Create hooks/useVapi.ts: the core hook. Initializes Vapi SDK, manages call lifecycle (idle, connecting, starting, listening, thinking, speaking), tracks messages array + currentMessage streaming, handles duration timer with maxDuration enforcement, session tracking via server actions

import { useState, useEffect, useRef, useCallback } from "react";
import Vapi from "@vapi-ai/web";
import { useAuth } from "@clerk/nextjs";

import { usePlan } from "@/hooks/usePlan";
import { ASSISTANT_ID, DEFAULT_VOICE, VOICE_SETTINGS } from "@/lib/constants";
import { getVoice } from "@/lib/utils";
import { IBook, Messages } from "@/types";
import {
  startVoiceSession,
  endVoiceSession,
} from "@/lib/actions/session.actions";

export function useLatestRef<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

const VAPI_API_KEY = process.env.NEXT_PUBLIC_VAPI_API_KEY;
const TIMER_INTERVAL_MS = 1000;
const SECONDS_PER_MINUTE = 60;
function describeVapiError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") {
    return String(error ?? "Unknown Vapi error");
  }

  const value = error as Record<string, unknown>;
  const nestedError = value.error;
  const nestedMessage =
    typeof nestedError === "string"
      ? nestedError
      : nestedError instanceof Error
        ? nestedError.message
        : nestedError &&
            typeof nestedError === "object" &&
            "message" in nestedError &&
            typeof nestedError.message === "string"
          ? nestedError.message
          : undefined;

  return [value.type, value.stage, value.message, nestedMessage]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(": ") || "Unknown Vapi error";
}

export type CallStatus =
  | "idle"
  | "connecting"
  | "starting"
  | "listening"
  | "thinking"
  | "speaking";

export interface VapiContextOptions {
  currentSegmentIndex?: number;
  currentSegmentContent?: string;
  selectedText?: string;
}

export function useVapi(book: IBook, contextOptions?: VapiContextOptions) {
  const { userId } = useAuth();
  const { limits } = usePlan();

  const [status, setStatus] = useState<CallStatus>("idle");
  const [messages, setMessages] = useState<Messages[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [currentUserMessage, setCurrentUserMessage] = useState("");
  const [duration, setDuration] = useState(0);
  const [limitError, setLimitError] = useState<string | null>(null);
  const [isBillingError, setIsBillingError] = useState(false);

  const vapiRef = useRef<InstanceType<typeof Vapi> | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isStoppingRef = useRef(false);

  const contextRef = useLatestRef(contextOptions);

  const getVapi = useCallback(() => {
    if (!vapiRef.current) {
      if (!VAPI_API_KEY) {
        throw new Error(
          "NEXT_PUBLIC_VAPI_API_KEY environment variable is not set",
        );
      }
      vapiRef.current = new Vapi(VAPI_API_KEY);
    }
    return vapiRef.current;
  }, []);

  const cleanupVapi = useCallback(() => {
    if (vapiRef.current) {
      try {
        vapiRef.current.stop();
      } catch (e) {
        // Ignore cleanup errors
      }
      vapiRef.current = null;
    }
  }, []);

  const voice = book.persona || DEFAULT_VOICE;

  // Keep refs in sync with latest values for use in callbacks
  const maxDurationSeconds = limits?.maxDurationPerSession
    ? limits.maxDurationPerSession * 60
    : 15 * 60;
  const maxDurationRef = useLatestRef(maxDurationSeconds);
  const durationRef = useLatestRef(duration);

  // Set up Vapi event listeners
  useEffect(() => {
    const handlers = {
      "call-start-progress": (event: { stage: string; status: string }) => {
        if (event.status === "failed") {
          console.error("Call start progress failed:", event);
          setStatus("idle");
          setLimitError(`Voice call setup failed at stage: ${event.stage}`);
        }
      },

      "call-start": () => {
        isStoppingRef.current = false;
        setStatus("speaking");
        startTimeRef.current = Date.now();

        // Start duration timer
        timerRef.current = setInterval(() => {
          if (startTimeRef.current) {
            const elapsed = Math.floor(
              (Date.now() - startTimeRef.current) / TIMER_INTERVAL_MS,
            );
            setDuration(elapsed);

            // Enforce max duration from plan limits
            if (elapsed >= maxDurationRef.current) {
              isStoppingRef.current = true;
              getVapi().stop();
              setStatus("idle");
              setLimitError(
                `Session reached plan limit of ${Math.floor(maxDurationRef.current / SECONDS_PER_MINUTE)} minutes.`,
              );
            }
          }
        }, TIMER_INTERVAL_MS);
      },

      "call-end": () => {
        setStatus("idle");
        setCurrentMessage("");
        setCurrentUserMessage("");

        // Stop timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        // End session tracking
        if (sessionIdRef.current) {
          endVoiceSession(sessionIdRef.current, durationRef.current).catch(
            (err: Error) => console.error("Failed to end voice session:", err),
          );
          sessionIdRef.current = null;
        }

        startTimeRef.current = null;

        // Reset Vapi instance for next call
        cleanupVapi();
      },

      "speech-start": () => {
        if (!isStoppingRef.current) {
          setStatus("speaking");
        }
      },
      "speech-end": () => {
        if (!isStoppingRef.current) {
          // After AI finishes speaking, user can talk
          setStatus("listening");
        }
      },

      message: (message: {
        type: string;
        role: string;
        transcriptType: string;
        transcript: string;
        status?: string;
        endedReason?: string;
      }) => {
        if (message.type === "status-update" && message.status === "ended") {
          if (!isStoppingRef.current) {
            const reason = message.endedReason || "unknown reason";
            console.error("Vapi call ended:", reason);
            setLimitError(`Voice service ended the call (${reason}). Try again later.`);
          }
          return;
        }

        if (message.type !== "transcript") return;

        // User partial → update live transcript
        if (message.role === "user" && message.transcriptType === "partial") {
          setCurrentUserMessage(message.transcript);
          return;
        }

        // User final → clear streaming, set thinking, add to messages
        if (message.role === "user" && message.transcriptType === "final") {
          setCurrentUserMessage("");

          if (!isStoppingRef.current) {
            setStatus("thinking");
          }

          setMessages((prev) => {
            const isDupe = prev.some(
              (m) =>
                m.role === message.role && m.content === message.transcript,
            );
            return isDupe
              ? prev
              : [...prev, { role: message.role, content: message.transcript }];
          });
          return;
        }

        // Assistant partial → update live transcript
        if (
          message.role === "assistant" &&
          message.transcriptType === "partial"
        ) {
          setCurrentMessage(message.transcript);
          return;
        }

        // Assistant final → clear streaming, add to messages
        if (message.role === "assistant" && message.transcriptType === "final") {
          setCurrentMessage("");

          setMessages((prev) => {
            const isDupe = prev.some(
              (m) =>
                m.role === message.role && m.content === message.transcript,
            );
            return isDupe
              ? prev
              : [...prev, { role: message.role, content: message.transcript }];
          });
          return;
        }
      },

      error: (error: unknown) => {
        const errorMessage = describeVapiError(error);
        console.error("Vapi error:", errorMessage);
        // Don't reset isStoppingRef here - delayed events may still fire
        setStatus("idle");
        setCurrentMessage("");
        setCurrentUserMessage("");

        // Stop timer on error
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        // End session tracking on error
        if (sessionIdRef.current) {
          endVoiceSession(sessionIdRef.current, durationRef.current).catch((err: Error) =>
              console.error("Failed to end voice session on error:", err),
          );
          sessionIdRef.current = null;
        }

        // Show user-friendly error message
        const normalizedError = errorMessage.toLowerCase();
        if (
          normalizedError.includes("timeout") ||
          normalizedError.includes("silence")
        ) {
          setLimitError(
            "Session ended due to inactivity. Click the mic to start again.",
          );
        } else if (
          normalizedError.includes("network") ||
          normalizedError.includes("connection")
        ) {
          setLimitError(
            "Connection lost. Please check your internet and try again.",
          );
        } else if (
          normalizedError.includes("meeting has ended") ||
          normalizedError.includes("ejection")
        ) {
          setLimitError(`Voice call ended: ${errorMessage}`);
        } else if (normalizedError === "unknown vapi error") {
          setLimitError(
            "Session ended. Click the mic to start again.",
          );
        } else {
          setLimitError(
            "Session ended unexpectedly. Click the mic to start again.",
          );
        }

        startTimeRef.current = null;

        // Reset Vapi instance for next call
        cleanupVapi();
      },
    };

    // Register all handlers
    Object.entries(handlers).forEach(([event, handler]) => {
      getVapi().on(event as keyof typeof handlers, handler as () => void);
    });

    return () => {
      // End active session on unmount
      if (sessionIdRef.current) {
        getVapi().stop();
        endVoiceSession(sessionIdRef.current, durationRef.current).catch(
          (err: Error) =>
            console.error("Failed to end voice session on unmount:", err),
        );
        sessionIdRef.current = null;
      }
      // Cleanup handlers
      Object.entries(handlers).forEach(([event, handler]) => {
        getVapi().off(event as keyof typeof handlers, handler as () => void);
      });
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const start = useCallback(async (customGreeting?: string) => {
    if (!userId) {
      setLimitError("Please sign in to start a voice session.");
      return;
    }

    setLimitError(null);
    setIsBillingError(false);
    setStatus("connecting");

    try {
      // Check session limits and create session record
      const result = await startVoiceSession(userId, book._id);

      if (!result.success) {
        setLimitError(
          result.error || "Session limit reached. Please upgrade your plan.",
        );
        setIsBillingError(!!result.isBillingError);
        setStatus("idle");
        return;
      }

      sessionIdRef.current = result.sessionId || null;

      const currentCtx = contextRef.current;
      const sectionNum = (currentCtx?.currentSegmentIndex ?? 0) + 1;
      const hasSelection = !!currentCtx?.selectedText;

      const defaultGreeting = hasSelection
        ? `Hello! I see you've highlighted: "${currentCtx!.selectedText!.slice(0, 90)}...". Let's explore the clinical mechanism behind this. What would you like to examine first?`
        : `Hello, I'm your bedside Socratic clinical mentor for "${book.title}". We're on Section ${sectionNum}. Would you like me to walk through the auscultation mechanics, or shall we do a quick oral viva?`;

      const firstMessage = customGreeting || defaultGreeting;

      await getVapi().start(ASSISTANT_ID, {
        firstMessage,
        variableValues: {
          title: book.title,
          author: book.author,
          bookId: book._id,
          currentSection: String(sectionNum),
          selectedText: currentCtx?.selectedText || "",
          activeContent: currentCtx?.currentSegmentContent?.slice(0, 800) || "",
        },
        voice: {
          provider: "11labs" as const,
          voiceId: getVoice(voice).id,
          model: "eleven_turbo_v2_5" as const,
          stability: VOICE_SETTINGS.stability,
          similarityBoost: VOICE_SETTINGS.similarityBoost,
          style: VOICE_SETTINGS.style,
          useSpeakerBoost: VOICE_SETTINGS.useSpeakerBoost,
        },
      });
    } catch (err) {
      console.error("Failed to start call:", err);
      setStatus("idle");
      setLimitError("Failed to start voice session. Please try again.");
    }
  }, [book._id, book.title, book.author, voice, userId, contextRef]);

  const stop = useCallback(() => {
    isStoppingRef.current = true;
    getVapi().stop();
  }, []);

  const clearError = useCallback(() => {
    setLimitError(null);
    setIsBillingError(false);
  }, []);

  const isActive =
    status === "starting" ||
    status === "listening" ||
    status === "thinking" ||
    status === "speaking";

  return {
    status,
    isActive,
    messages,
    currentMessage,
    currentUserMessage,
    duration,
    start,
    stop,
    limitError,
    isBillingError,
    maxDurationSeconds,
    clearError,
  };
}
export default useVapi;
