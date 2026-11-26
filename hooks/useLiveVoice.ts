"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { StudyLanguage, joinStreamingTranscript } from "@/lib/language";
import { DEFAULT_LIVE_VOICE } from "@/lib/voice-config";

export interface LiveVoiceMessage {
  id: string;
  role: "mentor";
  text: string;
  time: string;
  interrupted?: boolean;
}

export interface VisualTriggerEvent {
  conceptName: string;
  action: "highlight_concept" | "open_morph" | string;
  explanation?: string;
}

export interface UseLiveVoiceOptions {
  bookTitle: string;
  pageNumber: number;
  pageText: string;
  selectedText?: string;
  authoritativeReferences?: unknown[];
  language?: StudyLanguage;
  voiceName?: string;
  noisyPlace?: boolean;
  isMuted?: boolean;
  isOutputMuted?: boolean;
  onVisualTrigger?: (event: VisualTriggerEvent) => void;
}

export type LiveVoiceStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "reconnecting"
  | "error";

interface CachedToken {
  key: string;
  token: string;
  model: string;
  systemInstruction: string;
  noisyPlace: boolean;
  fetchedAt: number;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function createAudioContext(desiredSampleRate: number): AudioContext {
  const AudioCtx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
  try {
    return new AudioCtx({ sampleRate: desiredSampleRate });
  } catch {
    return new AudioCtx();
  }
}

function getConstrainedNetworkLimitBytes(): number {
  if (typeof navigator === "undefined") return 65_536;
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  };
  const eff = nav.connection?.effectiveType;
  if (nav.connection?.saveData || eff === "slow-2g" || eff === "2g" || eff === "3g") {
    return 24_576;
  }
  return 65_536;
}

export function useLiveVoice({
  bookTitle,
  pageNumber,
  pageText,
  selectedText,
  authoritativeReferences = [],
  language = "en",
  voiceName = DEFAULT_LIVE_VOICE,
  noisyPlace = false,
  isMuted: controlledMuted,
  isOutputMuted = false,
  onVisualTrigger,
}: UseLiveVoiceOptions) {
  const [status, setStatus] = useState<LiveVoiceStatus>("idle");
  const [isMuted, setIsMuted] = useState(Boolean(controlledMuted));
  const [isHoldToTalkActive, setIsHoldToTalkActive] = useState(false);
  const [messages, setMessages] = useState<LiveVoiceMessage[]>([]);
  const [currentCaption, setCurrentCaption] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeVisualTrigger, setActiveVisualTrigger] = useState<VisualTriggerEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderNodeRef = useRef<AudioWorkletNode | null>(null);
  const playerNodeRef = useRef<AudioWorkletNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);

  const statusRef = useRef<LiveVoiceStatus>("idle");
  const isMutedRef = useRef(Boolean(controlledMuted));
  const noisyPlaceRef = useRef(noisyPlace);
  const isHoldToTalkActiveRef = useRef(false);
  const isSetupCompleteRef = useRef(false);
  const manualDisconnectRef = useRef(false);
  const connectingPromiseRef = useRef<Promise<boolean> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const pendingTextQueueRef = useRef<string[]>([]);
  const lastReportedPageRef = useRef<number>(pageNumber);
  const cachedTokenRef = useRef<CachedToken | null>(null);
  const resumptionHandleRef = useRef<string | null>(null);
  const outputCaptionAccRef = useRef("");
  const sawOutputTranscriptionRef = useRef(false);
  const isPlayerPlayingRef = useRef(false);
  const turnFinishedOnServerRef = useRef(false);
  const drainWatchdogRef = useRef<number | null>(null);
  const latestPageTextRef = useRef<string>(selectedText || pageText || "");
  const latestPageNumRef = useRef<number>(pageNumber);
  const latestBookTitleRef = useRef<string>(bookTitle);
  const prevLanguageRef = useRef<StudyLanguage>(language);
  const prevVoiceNameRef = useRef<string>(voiceName);

  latestPageTextRef.current = (selectedText || pageText || "").trim();
  latestPageNumRef.current = pageNumber;
  latestBookTitleRef.current = bookTitle;

  // Visual level refs updated by worklets, read by rAF loop (zero React re-renders per frame)
  const inputLevelRef = useRef(0);
  const outputLevelRef = useRef(0);
  const visualizerElRef = useRef<HTMLElement | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Telemetry for measurement
  const metricsRef = useRef({
    connectStartedAt: 0,
    connectDurationMs: 0,
    firstAudioLatencyMs: 0,
    underrunCount: 0,
    bargeInCount: 0,
    reconnectCount: 0,
  });

  const updateStatus = useCallback((next: LiveVoiceStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const syncMetrics = useCallback(() => {
    if (typeof window !== "undefined") {
      (window as Window & { __ascleonVoiceMetrics?: typeof metricsRef.current }).__ascleonVoiceMetrics = {
        ...metricsRef.current,
      };
    }
  }, []);

  useEffect(() => {
    if (typeof controlledMuted === "boolean") {
      setIsMuted(controlledMuted);
    }
  }, [controlledMuted]);

  useEffect(() => {
    if (outputGainRef.current) {
      outputGainRef.current.gain.value = isOutputMuted ? 0 : 1;
    }
  }, [isOutputMuted]);

  useEffect(() => {
    const prevMuted = isMutedRef.current;
    isMutedRef.current = isMuted;
    if (recorderNodeRef.current) {
      recorderNodeRef.current.port.postMessage({
        command: isMuted ? "stop" : "start",
      });
    }
    if (
      !prevMuted &&
      isMuted &&
      !noisyPlaceRef.current &&
      isSetupCompleteRef.current &&
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      wsRef.current.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  // rAF loop driving orb CSS variables without React re-renders
  const startVisualizerLoop = useCallback(() => {
    if (rafIdRef.current !== null) return;
    let smoothed = 0;
    const tick = () => {
      const target =
        statusRef.current === "speaking" ? outputLevelRef.current : inputLevelRef.current;
      smoothed = smoothed * 0.72 + target * 0.28;
      const el = visualizerElRef.current;
      if (el) {
        el.style.setProperty("--voice-level", smoothed.toFixed(4));
        el.style.setProperty("--voice-scale", (1 + Math.min(0.24, smoothed * 0.34)).toFixed(4));
      }
      rafIdRef.current = window.requestAnimationFrame(tick);
    };
    rafIdRef.current = window.requestAnimationFrame(tick);
  }, []);

  const stopVisualizerLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (visualizerElRef.current) {
      visualizerElRef.current.style.setProperty("--voice-level", "0");
      visualizerElRef.current.style.setProperty("--voice-scale", "1");
    }
  }, []);

  const bindVisualizerElement = useCallback((el: HTMLElement | null) => {
    visualizerElRef.current = el;
  }, []);

  const cleanupInputAudio = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (recorderNodeRef.current) {
      try {
        recorderNodeRef.current.disconnect();
      } catch {}
      recorderNodeRef.current = null;
    }
    if (silentGainRef.current) {
      try {
        silentGainRef.current.disconnect();
      } catch {}
      silentGainRef.current = null;
    }
    if (inputAudioCtxRef.current && inputAudioCtxRef.current.state !== "closed") {
      try {
        inputAudioCtxRef.current.close();
      } catch {}
      inputAudioCtxRef.current = null;
    }
    inputLevelRef.current = 0;
    outputLevelRef.current = 0;
    isSetupCompleteRef.current = false;
  }, []);

  const cleanupAllAudio = useCallback(() => {
    cleanupInputAudio();
    if (playerNodeRef.current) {
      try {
        playerNodeRef.current.port.postMessage({ command: "flush" });
        playerNodeRef.current.disconnect();
      } catch {}
      playerNodeRef.current = null;
    }
    if (outputGainRef.current) {
      try {
        outputGainRef.current.disconnect();
      } catch {}
      outputGainRef.current = null;
    }
    if (outputAudioCtxRef.current && outputAudioCtxRef.current.state !== "closed") {
      try {
        outputAudioCtxRef.current.close();
      } catch {}
      outputAudioCtxRef.current = null;
    }
    isPlayerPlayingRef.current = false;
    turnFinishedOnServerRef.current = false;
    stopVisualizerLoop();
  }, [cleanupInputAudio, stopVisualizerLoop]);

  const commitMentorCaption = useCallback((interrupted = false) => {
    const text = outputCaptionAccRef.current.trim();
    outputCaptionAccRef.current = "";
    sawOutputTranscriptionRef.current = false;
    setCurrentCaption("");
    if (text) {
      setMessages((prev) => [
        ...prev,
        {
          id: `mentor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: "mentor",
          text,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          interrupted,
        },
      ]);
    }
  }, []);

  const flushPendingMessages = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    while (pendingTextQueueRef.current.length > 0) {
      const text = pendingTextQueueRef.current.shift();
      if (text) {
        wsRef.current.send(JSON.stringify({ realtimeInput: { text } }));
      }
    }
  }, []);

  const tokenCacheKey = `${bookTitle}|${pageNumber}|${language}|${voiceName}|${noisyPlace}|${(selectedText || "").slice(0, 80)}`;

  const fetchToken = useCallback(
    async (forceFresh = false): Promise<CachedToken> => {
      const cached = cachedTokenRef.current;
      const now = Date.now();
      if (
        !forceFresh &&
        cached &&
        cached.key === tokenCacheKey &&
        now - cached.fetchedAt < 3 * 60 * 1000
      ) {
        return cached;
      }

      const tokenRes = await fetch("/api/voice/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({
          bookTitle,
          pageNumber,
          pageText,
          selectedText,
          authoritativeReferences,
          language,
          voiceName,
          noisyPlace,
          resumptionHandle: resumptionHandleRef.current,
        }),
      });

      if (!tokenRes.ok) {
        const errJson = await tokenRes.json().catch(() => ({}));
        throw new Error(errJson.error || `Server returned ${tokenRes.status}`);
      }

      const data = await tokenRes.json();
      if (!data.token) {
        throw new Error("No ephemeral token returned from server.");
      }

      const fresh: CachedToken = {
        key: tokenCacheKey,
        token: data.token,
        model: data.model || "models/gemini-3.8-live",
        systemInstruction: data.systemInstruction || "",
        noisyPlace: Boolean(data.noisyPlace),
        fetchedAt: Date.now(),
      };
      cachedTokenRef.current = fresh;
      return fresh;
    },
    [
      tokenCacheKey,
      bookTitle,
      pageNumber,
      pageText,
      selectedText,
      authoritativeReferences,
      language,
      voiceName,
      noisyPlace,
    ]
  );

  const prefetchToken = useCallback(() => {
    if (statusRef.current !== "idle") return;
    fetchToken(false).catch(() => {});
  }, [fetchToken]);

  const sendRealtimeAudioChunk = useCallback((pcmBuffer: ArrayBuffer) => {
    if (
      isMutedRef.current ||
      !isSetupCompleteRef.current ||
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN
    ) {
      return;
    }
    if (noisyPlaceRef.current && !isHoldToTalkActiveRef.current) {
      return;
    }

    // Drop outgoing frames under WebSocket backpressure so weak mobile links don't build multi-second lag
    if (wsRef.current.bufferedAmount > getConstrainedNetworkLimitBytes()) {
      return;
    }

    const base64Chunk = arrayBufferToBase64(pcmBuffer);
    wsRef.current.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            mimeType: "audio/pcm;rate=16000",
            data: base64Chunk,
          },
        },
      })
    );
  }, []);

  const ensureOutputPipeline = useCallback(async () => {
    if (!outputAudioCtxRef.current || outputAudioCtxRef.current.state === "closed") {
      const outputCtx = createAudioContext(24000);
      outputAudioCtxRef.current = outputCtx;
      if (outputCtx.state === "suspended") {
        await outputCtx.resume();
      }
      await outputCtx.audioWorklet.addModule("/worklets/pcm-player.js");
      const playerNode = new AudioWorkletNode(outputCtx, "pcm-player-processor");
      const outputGain = outputCtx.createGain();
      outputGain.gain.value = isOutputMuted ? 0 : 1;
      playerNode.connect(outputGain);
      outputGain.connect(outputCtx.destination);
      playerNodeRef.current = playerNode;
      outputGainRef.current = outputGain;

      playerNode.port.onmessage = (event) => {
        if (event.data?.type === "level") {
          outputLevelRef.current = event.data.rms || 0;
        } else if (event.data?.type === "playback_state") {
          isPlayerPlayingRef.current = Boolean(event.data.playing);
          if (typeof event.data.underruns === "number") {
            metricsRef.current.underrunCount = event.data.underruns;
            syncMetrics();
          }
          if (!event.data.playing && turnFinishedOnServerRef.current && statusRef.current === "speaking") {
            if (drainWatchdogRef.current !== null) {
              window.clearTimeout(drainWatchdogRef.current);
              drainWatchdogRef.current = null;
            }
            turnFinishedOnServerRef.current = false;
            updateStatus("listening");
          }
        }
      };
    } else if (outputAudioCtxRef.current.state === "suspended") {
      await outputAudioCtxRef.current.resume();
    }
  }, [isOutputMuted, syncMetrics, updateStatus]);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    isHoldToTalkActiveRef.current = false;
    setIsHoldToTalkActive(false);
    if (wsRef.current) {
      try {
        wsRef.current.close(1000, "User ended session");
      } catch {}
      wsRef.current = null;
    }
    cleanupAllAudio();
    commitMentorCaption(false);
    updateStatus("idle");
  }, [cleanupAllAudio, commitMentorCaption, updateStatus]);

  const connectInternal = useCallback(
    async (isReconnect: boolean): Promise<boolean> => {
      if (connectingPromiseRef.current) {
        return connectingPromiseRef.current;
      }

      const promise = (async () => {
        manualDisconnectRef.current = false;
        setErrorMessage(null);
        updateStatus(isReconnect ? "reconnecting" : "connecting");
        if (!isReconnect) {
          metricsRef.current.connectStartedAt = performance.now();
          metricsRef.current.firstAudioLatencyMs = 0;
          metricsRef.current.underrunCount = 0;
          metricsRef.current.bargeInCount = 0;
          metricsRef.current.reconnectCount = 0;
          reconnectAttemptsRef.current = 0;
        }

        if (wsRef.current) {
          try {
            wsRef.current.close(1000, "Replacing connection");
          } catch {}
          wsRef.current = null;
        }
        cleanupInputAudio();

        try {
          // Parallelize token fetch, mic permission, and audio worklet initialization
          const [tokenInfo, stream] = await Promise.all([
            fetchToken(isReconnect),
            navigator.mediaDevices.getUserMedia({
              audio: {
                channelCount: 1,
                echoCancellation: { ideal: true },
                noiseSuppression: { ideal: true },
                autoGainControl: { ideal: true },
              },
            }),
            ensureOutputPipeline(),
          ]);

          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("ascleon:audio-exclusive", {
                detail: { source: "live-voice" },
              })
            );
          }

          // Clear cached token once consumed for WebSocket open; keep cachedTokenRef clear on reconnects
          cachedTokenRef.current = null;
          mediaStreamRef.current = stream;
          lastReportedPageRef.current = pageNumber;

          stream.getAudioTracks().forEach((track) => {
            track.onended = () => {
              if (
                !manualDisconnectRef.current &&
                wsRef.current?.readyState === WebSocket.OPEN &&
                !connectingPromiseRef.current
              ) {
                reconnectAttemptsRef.current = 0;
                connectInternal(true);
              }
            };
          });

          const inputCtx = createAudioContext(16000);
          inputAudioCtxRef.current = inputCtx;
          if (inputCtx.state === "suspended") await inputCtx.resume();
          await inputCtx.audioWorklet.addModule("/worklets/pcm-recorder.js");

          const micSource = inputCtx.createMediaStreamSource(stream);
          const recorderNode = new AudioWorkletNode(inputCtx, "pcm-recorder-processor");
          const silentGain = inputCtx.createGain();
          silentGain.gain.value = 0;

          micSource.connect(recorderNode);
          recorderNode.connect(silentGain);
          silentGain.connect(inputCtx.destination);

          recorderNodeRef.current = recorderNode;
          silentGainRef.current = silentGain;

          if (isMutedRef.current) {
            recorderNode.port.postMessage({ command: "stop" });
          }

          recorderNode.port.onmessage = (event) => {
            if (event.data?.type === "level") {
              inputLevelRef.current = event.data.rms || 0;
            } else if (event.data?.type === "audio") {
              sendRealtimeAudioChunk(event.data.buffer);
            }
          };

          startVisualizerLoop();

          const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${tokenInfo.token}`;
          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          const connected = await new Promise<boolean>((resolve, reject) => {
            let settled = false;
            const handshakeTimer = window.setTimeout(() => {
              if (!settled) {
                settled = true;
                try {
                  ws.close(4000, "Handshake timeout");
                } catch {}
                reject(new Error("Voice connection timed out. Check your internet connection and tap to retry."));
              }
            }, 12_000);

            const clearHandshakeTimer = () => window.clearTimeout(handshakeTimer);

            ws.onopen = () => {
              const automaticActivityDetection = tokenInfo.noisyPlace
                ? { disabled: true }
                : {
                    disabled: false,
                    startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
                    endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
                    prefixPaddingMs: 300,
                    silenceDurationMs: 700,
                  };

              const setupFrame = {
                setup: {
                  model: tokenInfo.model,
                  generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                      voiceConfig: {
                        prebuiltVoiceConfig: {
                          voiceName: voiceName || DEFAULT_LIVE_VOICE,
                        },
                      },
                    },
                  },
                  realtimeInputConfig: {
                    automaticActivityDetection,
                  },
                  contextWindowCompression: {
                    slidingWindow: {},
                  },
                  sessionResumption: resumptionHandleRef.current
                    ? { handle: resumptionHandleRef.current }
                    : {},
                  outputAudioTranscription: {},
                  systemInstruction: {
                    parts: [{ text: tokenInfo.systemInstruction }],
                  },
                  tools: [
                    {
                      functionDeclarations: [
                        {
                          name: "get_current_study_page",
                          description:
                            "Reads the student's current active page number, book title, and live extracted text. Call this whenever the student says continue / كمل or asks about the current page.",
                          parameters: {
                            type: "OBJECT",
                            properties: {},
                          },
                        },
                        {
                          name: "show_concept_on_page",
                          description:
                            "Displays a visual concept card or highlights a concept on the student's study reader in the background without interrupting speech.",
                          behavior: "NON_BLOCKING",
                          parameters: {
                            type: "OBJECT",
                            properties: {
                              conceptName: { type: "STRING" },
                              action: { type: "STRING", enum: ["highlight_concept", "open_morph"] },
                              explanation: { type: "STRING" },
                            },
                            required: ["conceptName", "action"],
                          },
                        },
                      ],
                    },
                  ],
                },
              };

              ws.send(JSON.stringify(setupFrame));
            };

            ws.onmessage = async (event: MessageEvent) => {
              try {
                let rawText = "";
                if (event.data instanceof Blob) {
                  rawText = await event.data.text();
                } else if (typeof event.data === "string") {
                  rawText = event.data;
                } else if (event.data instanceof ArrayBuffer) {
                  rawText = new TextDecoder().decode(event.data);
                } else {
                  rawText = String(event.data);
                }
                if (!rawText || !rawText.trim()) return;
                const data = JSON.parse(rawText);

                if (data.sessionResumptionUpdate?.resumable && data.sessionResumptionUpdate?.newHandle) {
                  resumptionHandleRef.current = data.sessionResumptionUpdate.newHandle;
                }

                if (data.goAway && !manualDisconnectRef.current) {
                  metricsRef.current.reconnectCount++;
                  syncMetrics();
                  connectInternal(true);
                  return;
                }

                if (data.setupComplete) {
                  clearHandshakeTimer();
                  isSetupCompleteRef.current = true;
                  reconnectAttemptsRef.current = 0;
                  if (!isReconnect && metricsRef.current.connectStartedAt > 0) {
                    metricsRef.current.connectDurationMs = Math.round(
                      performance.now() - metricsRef.current.connectStartedAt
                    );
                    syncMetrics();
                  }
                  updateStatus("listening");
                  flushPendingMessages();
                  if (!settled) {
                    settled = true;
                    resolve(true);
                  }
                  return;
                }

                if (data.serverContent) {
                  const sc = data.serverContent;

                  if (sc.interrupted) {
                    metricsRef.current.bargeInCount++;
                    syncMetrics();
                    if (playerNodeRef.current) {
                      playerNodeRef.current.port.postMessage({ command: "flush" });
                    }
                    isPlayerPlayingRef.current = false;
                    turnFinishedOnServerRef.current = false;
                    outputLevelRef.current = 0;
                    commitMentorCaption(true);
                    updateStatus("listening");
                    return;
                  }

                  if (sc.modelTurn?.parts) {
                    turnFinishedOnServerRef.current = false;
                    if (statusRef.current !== "speaking") {
                      updateStatus("speaking");
                    }

                    for (const part of sc.modelTurn.parts) {
                      if (part.inlineData?.data && playerNodeRef.current) {
                        if (
                          metricsRef.current.firstAudioLatencyMs === 0 &&
                          metricsRef.current.connectStartedAt > 0
                        ) {
                          metricsRef.current.firstAudioLatencyMs = Math.round(
                            performance.now() - metricsRef.current.connectStartedAt
                          );
                          syncMetrics();
                        }
                        const audioBuffer = base64ToArrayBuffer(part.inlineData.data);
                        playerNodeRef.current.port.postMessage(
                          { type: "audio", buffer: audioBuffer },
                          [audioBuffer]
                        );
                      } else if (part.text && !part.thought && !sawOutputTranscriptionRef.current) {
                        outputCaptionAccRef.current = joinStreamingTranscript(
                          outputCaptionAccRef.current,
                          part.text
                        );
                        setCurrentCaption(outputCaptionAccRef.current);
                      }
                    }
                  }

                  if (sc.outputTranscription?.text) {
                    sawOutputTranscriptionRef.current = true;
                    outputCaptionAccRef.current = joinStreamingTranscript(
                      outputCaptionAccRef.current,
                      sc.outputTranscription.text
                    );
                    setCurrentCaption(outputCaptionAccRef.current);
                  }

                  if (sc.turnComplete || sc.generationComplete) {
                    turnFinishedOnServerRef.current = true;
                    if (playerNodeRef.current) {
                      playerNodeRef.current.port.postMessage({ command: "drain" });
                    }
                    commitMentorCaption(false);
                    if (!isPlayerPlayingRef.current) {
                      turnFinishedOnServerRef.current = false;
                      updateStatus("listening");
                    } else {
                      if (drainWatchdogRef.current !== null) {
                        window.clearTimeout(drainWatchdogRef.current);
                      }
                      drainWatchdogRef.current = window.setTimeout(() => {
                        drainWatchdogRef.current = null;
                        if (turnFinishedOnServerRef.current && statusRef.current === "speaking") {
                          isPlayerPlayingRef.current = false;
                          turnFinishedOnServerRef.current = false;
                          updateStatus("listening");
                        }
                      }, 4000);
                    }
                  }
                }

                if (data.toolCall?.functionCalls) {
                  const responses: Array<{
                    id: string;
                    name: string;
                    response: { output: Record<string, string> };
                  }> = [];
                  for (const call of data.toolCall.functionCalls) {
                    if (call.name === "get_current_study_page") {
                      responses.push({
                        id: call.id,
                        name: call.name,
                        response: {
                          output: {
                            bookTitle: latestBookTitleRef.current,
                            pageNumber: String(latestPageNumRef.current),
                            pageText: latestPageTextRef.current.slice(0, 3500),
                          },
                        },
                      });
                    } else if (call.name === "show_concept_on_page") {
                      const trigger: VisualTriggerEvent = {
                        conceptName: call.args?.conceptName || "Concept",
                        action: call.args?.action || "highlight_concept",
                        explanation: call.args?.explanation,
                      };
                      setActiveVisualTrigger(trigger);
                      onVisualTrigger?.(trigger);
                      responses.push({
                        id: call.id,
                        name: call.name,
                        response: {
                          output: {
                            status: "displayed_on_screen",
                            action: trigger.action,
                            concept: trigger.conceptName,
                          },
                        },
                      });
                    }
                  }
                  if (responses.length > 0 && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
                  }
                }
              } catch (err) {
                console.error("[useLiveVoice] Frame parse error:", err);
              }
            };

            ws.onerror = (err) => {
              clearHandshakeTimer();
              console.error("[useLiveVoice] WebSocket error:", err);
              if (!settled) {
                settled = true;
                reject(new Error("Voice connection error."));
              }
            };

            ws.onclose = (closeEvent) => {
              clearHandshakeTimer();
              cleanupInputAudio();
              const isNormalClose =
                manualDisconnectRef.current ||
                closeEvent.code === 1000 ||
                closeEvent.code === 1005;

              const retryDelays = [400, 1200, 2500];
              const hadResumptionHandle = Boolean(resumptionHandleRef.current);
              const isRecoverableConstraintClose =
                closeEvent.code !== 1008 || hadResumptionHandle;
              if (
                !isNormalClose &&
                isRecoverableConstraintClose &&
                reconnectAttemptsRef.current < retryDelays.length
              ) {
                if (closeEvent.code === 1008 || closeEvent.code === 1007) {
                  resumptionHandleRef.current = null;
                  cachedTokenRef.current = null;
                }
                const attemptIdx = reconnectAttemptsRef.current;
                reconnectAttemptsRef.current += 1;
                metricsRef.current.reconnectCount += 1;
                syncMetrics();
                updateStatus("reconnecting");
                if (!settled) {
                  settled = true;
                  resolve(false);
                }
                setTimeout(() => {
                  if (!manualDisconnectRef.current) {
                    connectInternal(true);
                  }
                }, retryDelays[attemptIdx]);
                return;
              }

              if (!isNormalClose) {
                setErrorMessage(
                  closeEvent.reason
                    ? `Voice session closed (${closeEvent.code}): ${closeEvent.reason}`
                    : `Voice connection closed (${closeEvent.code}). Tap to reconnect.`
                );
                updateStatus("error");
                stopVisualizerLoop();
              } else if (!manualDisconnectRef.current) {
                updateStatus("idle");
                stopVisualizerLoop();
              }

              if (!settled) {
                settled = true;
                resolve(false);
              }
            };
          });

          return connected;
        } catch (err: unknown) {
          console.error("[useLiveVoice] Connection failure:", err);
          setErrorMessage(
            err instanceof Error ? err.message : "Could not start live voice session."
          );
          updateStatus("error");
          cleanupAllAudio();
          return false;
        } finally {
          connectingPromiseRef.current = null;
        }
      })();

      connectingPromiseRef.current = promise;
      return promise;
    },
    [
      cleanupInputAudio,
      cleanupAllAudio,
      fetchToken,
      ensureOutputPipeline,
      pageNumber,
      voiceName,
      sendRealtimeAudioChunk,
      startVisualizerLoop,
      stopVisualizerLoop,
      flushPendingMessages,
      commitMentorCaption,
      updateStatus,
      syncMetrics,
      onVisualTrigger,
    ]
  );

  const connect = useCallback(() => connectInternal(false), [connectInternal]);

  // If noisyPlace changes mid-session, reconnect seamlessly with sessionResumption
  useEffect(() => {
    const prev = noisyPlaceRef.current;
    noisyPlaceRef.current = noisyPlace;
    if (prev !== noisyPlace) {
      cachedTokenRef.current = null;
      if (
        wsRef.current?.readyState === WebSocket.OPEN &&
        statusRef.current !== "idle" &&
        statusRef.current !== "connecting"
      ) {
        connectInternal(true);
      }
    }
  }, [noisyPlace, connectInternal]);

  // Hold-to-talk controls when noisyPlace is enabled
  const startHoldToTalk = useCallback(() => {
    if (!noisyPlaceRef.current || isHoldToTalkActiveRef.current) return;
    isHoldToTalkActiveRef.current = true;
    setIsHoldToTalkActive(true);
    if (isMutedRef.current) {
      setIsMuted(false);
    }
    if (playerNodeRef.current && statusRef.current === "speaking") {
      playerNodeRef.current.port.postMessage({ command: "flush" });
    }
    if (wsRef.current?.readyState === WebSocket.OPEN && isSetupCompleteRef.current) {
      wsRef.current.send(JSON.stringify({ realtimeInput: { activityStart: {} } }));
    }
  }, []);

  const stopHoldToTalk = useCallback(() => {
    if (!isHoldToTalkActiveRef.current) return;
    isHoldToTalkActiveRef.current = false;
    setIsHoldToTalkActive(false);
    if (wsRef.current?.readyState === WebSocket.OPEN && isSetupCompleteRef.current) {
      wsRef.current.send(JSON.stringify({ realtimeInput: { activityEnd: {} } }));
    }
  }, []);

  const sendTextMessage = useCallback((text: string) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    if (wsRef.current?.readyState === WebSocket.OPEN && isSetupCompleteRef.current) {
      wsRef.current.send(JSON.stringify({ realtimeInput: { text: cleanText } }));
    } else {
      pendingTextQueueRef.current.push(cleanText);
    }
  }, []);

  const updatePageContext = useCallback((newPageText: string, newPageNumber: number) => {
    latestPageTextRef.current = (newPageText || "").trim();
    latestPageNumRef.current = newPageNumber;
    lastReportedPageRef.current = newPageNumber;
  }, []);

  useEffect(() => {
    const langChanged = prevLanguageRef.current !== language;
    const voiceChanged = prevVoiceNameRef.current !== voiceName;
    prevLanguageRef.current = language;
    prevVoiceNameRef.current = voiceName;
    if (!langChanged && !voiceChanged) return;

    cachedTokenRef.current = null;
    if (
      wsRef.current?.readyState === WebSocket.OPEN &&
      statusRef.current !== "idle" &&
      statusRef.current !== "connecting"
    ) {
      connectInternal(true);
    }
  }, [language, voiceName, connectInternal]);

  const reconnectSession = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    cachedTokenRef.current = null;
    return connectInternal(true);
  }, [connectInternal]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleExclusive = (e: Event) => {
      const detail = (e as CustomEvent<{ source?: string }>).detail;
      if (detail?.source === "living-board" && statusRef.current !== "idle") {
        setIsMuted(true);
      }
    };
    window.addEventListener("ascleon:audio-exclusive", handleExclusive);
    return () => window.removeEventListener("ascleon:audio-exclusive", handleExclusive);
  }, []);

  const resetSession = useCallback(() => {
    if (drainWatchdogRef.current !== null) {
      window.clearTimeout(drainWatchdogRef.current);
      drainWatchdogRef.current = null;
    }
    disconnect();
    resumptionHandleRef.current = null;
    cachedTokenRef.current = null;
    setMessages([]);
    setCurrentCaption("");
    setErrorMessage(null);
  }, [disconnect]);

  // Mobile backgrounding & network recovery listeners
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (inputAudioCtxRef.current?.state === "suspended") {
          inputAudioCtxRef.current.resume().catch(() => {});
        }
        if (outputAudioCtxRef.current?.state === "suspended") {
          outputAudioCtxRef.current.resume().catch(() => {});
        }
      }
    };
    const handleOnline = () => {
      if (
        !manualDisconnectRef.current &&
        statusRef.current === "error" &&
        resumptionHandleRef.current
      ) {
        reconnectAttemptsRef.current = 0;
        connectInternal(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [connectInternal]);

  useEffect(() => {
    return () => {
      manualDisconnectRef.current = true;
      if (wsRef.current) {
        try {
          wsRef.current.close(1000, "Component unmounted");
        } catch {}
        wsRef.current = null;
      }
      cleanupAllAudio();
    };
  }, [cleanupAllAudio]);

  return {
    status,
    isConnected:
      status === "listening" || status === "speaking" || status === "reconnecting",
    isMuted,
    toggleMute,
    isHoldToTalkActive,
    startHoldToTalk,
    stopHoldToTalk,
    connect,
    disconnect,
    reconnectSession,
    resetSession,
    prefetchToken,
    bindVisualizerElement,
    sendTextMessage,
    updatePageContext,
    messages,
    currentCaption,
    errorMessage,
    activeVisualTrigger,
    clearVisualTrigger: () => setActiveVisualTrigger(null),
  };
}
