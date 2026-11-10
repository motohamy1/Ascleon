"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { StudyLanguage, joinStreamingTranscript, isHallucinatedNoiseTranscript } from "@/lib/language";
import { DEFAULT_LIVE_VOICE, VoiceBargeInMode } from "@/lib/voice-config";
import { WhiteboardChoreographEvent, WhiteboardWidgetControlEvent } from "@/types/whiteboard";

export interface LiveVoiceMessage {
  id: string;
  role: "user" | "mentor";
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
  authoritativeReferences?: any[];
  language?: StudyLanguage;
  voiceName?: string;
  bargeInMode?: VoiceBargeInMode;
  mode?: "viva" | "whiteboard";
  onVisualTrigger?: (event: VisualTriggerEvent) => void;
  onWhiteboardChoreograph?: (event: WhiteboardChoreographEvent) => void;
  onWhiteboardWidgetControl?: (event: WhiteboardWidgetControlEvent) => void;
  onWhiteboardBranchTopic?: (focusQuestion: string, preferredWidgetType?: string) => void;
}

export type LiveVoiceStatus =
  | "disconnected"
  | "connecting"
  | "listening"
  | "mentor_speaking"
  | "interrupted"
  | "error";

export function useLiveVoice({
  bookTitle,
  pageNumber,
  pageText,
  selectedText,
  authoritativeReferences = [],
  language = "en",
  voiceName = DEFAULT_LIVE_VOICE,
  bargeInMode: initialBargeInMode = "smart",
  mode = "viva",
  onVisualTrigger,
  onWhiteboardChoreograph,
  onWhiteboardWidgetControl,
  onWhiteboardBranchTopic,
}: UseLiveVoiceOptions) {
  const [status, setStatus] = useState<LiveVoiceStatus>("disconnected");
  const [isMuted, setIsMuted] = useState(false);
  const [bargeInMode, setBargeInMode] = useState<VoiceBargeInMode>(initialBargeInMode);
  const [messages, setMessages] = useState<LiveVoiceMessage[]>([]);
  const [currentInputTranscript, setCurrentInputTranscript] = useState("");
  const [currentOutputTranscript, setCurrentOutputTranscript] = useState("");
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeVisualTrigger, setActiveVisualTrigger] = useState<VisualTriggerEvent | null>(null);
  const [activeChoreography, setActiveChoreography] = useState<WhiteboardChoreographEvent | null>(null);
  const [activeWidgetControl, setActiveWidgetControl] = useState<WhiteboardWidgetControlEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderNodeRef = useRef<AudioWorkletNode | null>(null);
  const playerNodeRef = useRef<AudioWorkletNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);

  const statusRef = useRef<LiveVoiceStatus>("disconnected");
  const bargeInModeRef = useRef<VoiceBargeInMode>(bargeInMode);
  const inputLevelRef = useRef(0);
  const outputLevelRef = useRef(0);
  const isMutedRef = useRef(false);
  const isSetupCompleteRef = useRef(false);
  const setupPromiseResolversRef = useRef<{ resolve: (val: boolean) => void; reject: (err: any) => void } | null>(null);
  const pendingTextQueueRef = useRef<string[]>([]);
  const lastReportedPageRef = useRef<number>(pageNumber);

  const inputTranscriptAccRef = useRef("");
  const outputTranscriptAccRef = useRef("");
  const messagesRef = useRef<LiveVoiceMessage[]>([]);
  const resumptionHandleRef = useRef<string | null>(null);
  const ignoreModelAudioRef = useRef<boolean>(false);
  const isResumingRef = useRef<boolean>(false);
  const speechStreakRef = useRef<number>(0);
  const rawInputLevelRef = useRef<number>(0);
  // Adaptive Ambient Noise Floor Tracker (exponential moving average of resting room acoustics)
  const ambientNoiseFloorRef = useRef<number>(0.02);
  const rawOutputLevelRef = useRef<number>(0);
  const preRollAudioBufferRef = useRef<ArrayBuffer[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    bargeInModeRef.current = bargeInMode;
  }, [bargeInMode]);

  useEffect(() => {
    isMutedRef.current = isMuted;
    if (recorderNodeRef.current) {
      recorderNodeRef.current.port.postMessage({
        command: isMuted ? "stop" : "start",
      });
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const cleanupAudio = useCallback(() => {
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

    if (playerNodeRef.current) {
      try {
        playerNodeRef.current.disconnect();
      } catch {}
      playerNodeRef.current = null;
    }

    if (inputAudioCtxRef.current && inputAudioCtxRef.current.state !== "closed") {
      try {
        inputAudioCtxRef.current.close();
      } catch {}
      inputAudioCtxRef.current = null;
    }

    if (outputAudioCtxRef.current && outputAudioCtxRef.current.state !== "closed") {
      try {
        outputAudioCtxRef.current.close();
      } catch {}
      outputAudioCtxRef.current = null;
    }

    ambientNoiseFloorRef.current = 0.02;
    speechStreakRef.current = 0;
    rawInputLevelRef.current = 0;
    setInputLevel(0);
    setOutputLevel(0);
    isSetupCompleteRef.current = false;
  }, []);

  // Explicit user or deliberate auto barge-in interruption handler
  const interrupt = useCallback(() => {
    if (statusRef.current === "mentor_speaking") {
      // 1. Flush player output audio worklet immediately to silence speakers
      if (playerNodeRef.current) {
        playerNodeRef.current.port.postMessage({ command: "flush" });
      }
      ignoreModelAudioRef.current = true;
      outputLevelRef.current = 0;
      setOutputLevel(0);

      // 2. Commit spoken mentor fragment to transcript history
      const interruptedMentorText = outputTranscriptAccRef.current.trim();
      outputTranscriptAccRef.current = "";
      setCurrentOutputTranscript("");

      if (interruptedMentorText) {
        setMessages((prev) => [
          ...prev,
          {
            id: `mentor-interrupted-${Date.now()}`,
            role: "mentor",
            text: interruptedMentorText,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            interrupted: true,
          },
        ]);
      }

      speechStreakRef.current = 0;
      statusRef.current = "listening";
      setStatus("listening");
    }
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    cleanupAudio();
    setStatus("disconnected");
    if (setupPromiseResolversRef.current) {
      setupPromiseResolversRef.current.resolve(false);
      setupPromiseResolversRef.current = null;
    }
  }, [cleanupAudio]);

  const sendRealtimeAudio = useCallback((pcmBuffer: ArrayBuffer, chunkRms?: number, zcr?: number, crestFactor?: number) => {
    if (
      isMutedRef.current ||
      !isSetupCompleteRef.current ||
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    // Always maintain a rolling ~350ms pre-roll ring buffer (approx 10 chunks of 32ms)
    const preRoll = preRollAudioBufferRef.current;
    preRoll.push(pcmBuffer.slice(0));
    if (preRoll.length > 11) {
      preRoll.shift();
    }

    let bufferToSend = pcmBuffer;
    const mode = bargeInModeRef.current;
    const currentEnergy = typeof chunkRms === "number" ? chunkRms : rawInputLevelRef.current;
    const noiseFloor = ambientNoiseFloorRef.current;

    // 1. While the mentor is actively speaking:
    if (statusRef.current === "mentor_speaking") {
      if (mode === "shield") {
        // NOISE SHIELD: 100% silence sent to Gemini Live
        bufferToSend = new ArrayBuffer(pcmBuffer.byteLength);
      } else if (mode === "smart") {
        // SMART VOCAL FOCUS:
        // Use true raw output RMS (not inflated 4x visual meter)
        const rawDuck = rawOutputLevelRef.current * 0.8;
        const requiredThreshold = Math.max(0.045, noiseFloor * 2.2, rawDuck + 0.035);

        // Require human voice characteristics (ZCR 0.04 to 0.45 and crest factor < 6 to reject clicks/bumps)
        const isVoiceAcoustics = typeof zcr === "number" ? (zcr >= 0.04 && zcr <= 0.45 && (crestFactor || 1) < 6) : true;

        if (speechStreakRef.current < 6 || currentEnergy < requiredThreshold || !isVoiceAcoustics) {
          bufferToSend = new ArrayBuffer(pcmBuffer.byteLength);
        }
      } else {
        // SENSITIVE MODE (Headset / Quiet Space):
        const sensitiveThreshold = Math.max(0.025, noiseFloor * 1.5);
        if (speechStreakRef.current < 3 || currentEnergy < sensitiveThreshold) {
          bufferToSend = new ArrayBuffer(pcmBuffer.byteLength);
        }
      }
    } else if (statusRef.current === "listening") {
      // 2. While waiting for the user to speak:
      // Filter out low-level room noise, HVAC hum, and mic hiss
      const listeningGate = Math.max(0.025, noiseFloor * 1.5);
      if (currentEnergy < listeningGate && speechStreakRef.current === 0) {
        bufferToSend = new ArrayBuffer(pcmBuffer.byteLength);
      }
    }

    const base64Chunk = arrayBufferToBase64(bufferToSend);
    const audioFrame = {
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: base64Chunk,
        },
      },
    };
    wsRef.current.send(JSON.stringify(audioFrame));
  }, []);

  const flushPendingMessages = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    while (pendingTextQueueRef.current.length > 0) {
      const text = pendingTextQueueRef.current.shift();
      if (text) {
        const frame = {
          clientContent: {
            turns: [
              {
                role: "user",
                parts: [{ text }],
              },
            ],
            turnComplete: true,
          },
        };
        wsRef.current.send(JSON.stringify(frame));
      }
    }
  }, []);

  const connect = useCallback(async (): Promise<boolean> => {
    setErrorMessage(null);
    setStatus("connecting");
    statusRef.current = "connecting";

    const isResuming = messagesRef.current.length > 0;
    isResumingRef.current = isResuming;

    // Close any existing connection cleanly
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    cleanupAudio();

    return new Promise<boolean>(async (resolve, reject) => {
      setupPromiseResolversRef.current = { resolve, reject };

      try {
        // 1. Fetch ephemeral token & configured system prompt from server
        const tokenRes = await fetch("/api/voice/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookTitle,
            pageNumber,
            pageText,
            selectedText,
            authoritativeReferences,
            language,
            voiceName,
            mode,
            resumptionHandle: resumptionHandleRef.current,
            isResuming,
          }),
        });

        if (!tokenRes.ok) {
          const errJson = await tokenRes.json().catch(() => ({}));
          throw new Error(errJson.error || `Server returned ${tokenRes.status}`);
        }

        const tokenData = await tokenRes.json();
        const token = tokenData.token;
        const directApiKey = tokenData.directApiKey;
        const systemInstruction = tokenData.systemInstruction || "";
        if (!token && !directApiKey) {
          throw new Error("No live token or session key returned from server.");
        }

        lastReportedPageRef.current = pageNumber;

        // 2. Request microphone stream with voice-isolation audio constraints
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true },
          },
        });
        mediaStreamRef.current = stream;

        // 3. Initialize AudioContexts
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const inputCtx = new AudioCtx();
        const outputCtx = new AudioCtx({ sampleRate: 24000 });
        inputAudioCtxRef.current = inputCtx;
        outputAudioCtxRef.current = outputCtx;

        if (inputCtx.state === "suspended") await inputCtx.resume();
        if (outputCtx.state === "suspended") await outputCtx.resume();

        // 4. Load Worklets
        await inputCtx.audioWorklet.addModule("/worklets/pcm-recorder.js");
        await outputCtx.audioWorklet.addModule("/worklets/pcm-player.js");

        // Player worklet sink
        const playerNode = new AudioWorkletNode(outputCtx, "pcm-player-processor");
        playerNode.connect(outputCtx.destination);
        playerNodeRef.current = playerNode;

        // Listen for player worklet messages (live output audio RMS level for visualizer)
        playerNode.port.onmessage = (event) => {
          if (event.data?.type === "level") {
            const rms = event.data.rms || 0;
            const rawRms = typeof event.data.rawRms === "number" ? event.data.rawRms : rms;
            outputLevelRef.current = rms;
            rawOutputLevelRef.current = rawRms;
            setOutputLevel(rms);
          }
        };

        // 5. Studio Vocal Bandpass Equalizer (85Hz – 4200Hz)
        // Highpass filter cuts desk knocks, floor thumps, HVAC rumble, and deep handling noise (<85Hz)
        const highpassFilter = inputCtx.createBiquadFilter();
        highpassFilter.type = "highpass";
        highpassFilter.frequency.value = 85;
        highpassFilter.Q.value = 0.7;

        // Lowpass filter cuts keyboard clatter, mouse clicks, high-frequency coil whine, and hiss (>4200Hz)
        const lowpassFilter = inputCtx.createBiquadFilter();
        lowpassFilter.type = "lowpass";
        lowpassFilter.frequency.value = 4200;
        lowpassFilter.Q.value = 0.7;

        // Recorder worklet pipeline
        const micSource = inputCtx.createMediaStreamSource(stream);
        const recorderNode = new AudioWorkletNode(inputCtx, "pcm-recorder-processor");
        const silentGain = inputCtx.createGain();
        silentGain.gain.value = 0; // Completely muted sink to ensure Chromium pulls audio continually

        // Connect chain: micSource -> highpass -> lowpass -> recorderNode -> silentGain -> destination
        micSource.connect(highpassFilter);
        highpassFilter.connect(lowpassFilter);
        lowpassFilter.connect(recorderNode);
        recorderNode.connect(silentGain);
        silentGain.connect(inputCtx.destination);

        recorderNodeRef.current = recorderNode;
        silentGainRef.current = silentGain;

        // Listen for recorder worklet messages (live mic RMS level + PCM audio chunks)
        recorderNode.port.onmessage = (event) => {
          if (event.data?.type === "level") {
            const visualRms = event.data.rms || 0;
            const physicalRms = typeof event.data.rawRms === "number" ? event.data.rawRms : (visualRms / 2.5);
            inputLevelRef.current = visualRms;
            rawInputLevelRef.current = physicalRms;
            setInputLevel(visualRms);

            // 1. Dynamic Ambient Noise Floor Tracking (Exponential Moving Average):
            if (physicalRms < ambientNoiseFloorRef.current * 1.4) {
              ambientNoiseFloorRef.current = ambientNoiseFloorRef.current * 0.98 + physicalRms * 0.02;
            } else if (physicalRms < 0.12) {
              ambientNoiseFloorRef.current = ambientNoiseFloorRef.current * 0.995 + physicalRms * 0.005;
            }
            ambientNoiseFloorRef.current = Math.max(0.012, Math.min(0.12, ambientNoiseFloorRef.current));
            const noiseFloor = ambientNoiseFloorRef.current;
            const mode = bargeInModeRef.current;

            // 2. Determine if audio energy is genuine deliberate voice:
            let isVocalEnergy = false;
            let streakThreshold = 12;

            if (statusRef.current === "mentor_speaking") {
              if (mode === "shield") {
                isVocalEnergy = false;
              } else if (mode === "smart") {
                const rawDuck = rawOutputLevelRef.current * 0.8;
                const requiredThreshold = Math.max(0.045, noiseFloor * 2.2, rawDuck + 0.035);
                isVocalEnergy = physicalRms > requiredThreshold;
                streakThreshold = 6; // ~190ms of sustained phonation
              } else {
                const sensitiveThreshold = Math.max(0.025, noiseFloor * 1.5);
                isVocalEnergy = physicalRms > sensitiveThreshold;
                streakThreshold = 3; // ~100ms
              }
            } else {
              const listeningThreshold = Math.max(0.025, noiseFloor * 1.5);
              isVocalEnergy = physicalRms > listeningThreshold;
            }

            if (isVocalEnergy) {
              speechStreakRef.current = Math.min(25, speechStreakRef.current + 1);
            } else {
              speechStreakRef.current = Math.max(0, speechStreakRef.current - 2);
            }

            // 3. High-Precision Deliberate Barge-In Execution:
            if (
              statusRef.current === "mentor_speaking" &&
              mode !== "shield" &&
              speechStreakRef.current >= streakThreshold
            ) {
              interrupt();

              // Instantly flush pre-roll buffer so Gemini Live receives user's initial words without latency
              const preRoll = preRollAudioBufferRef.current;
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && preRoll.length > 0) {
                while (preRoll.length > 0) {
                  const chunk = preRoll.shift();
                  if (chunk) {
                    const base64Chunk = arrayBufferToBase64(chunk);
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
                  }
                }
              }
            }
          } else if (event.data?.type === "audio") {
            sendRealtimeAudio(event.data.buffer, event.data.chunkRms, event.data.zcr, event.data.crestFactor);
          } else if (event.data instanceof ArrayBuffer) {
            sendRealtimeAudio(event.data);
          }
        };

        // 6. Connect to Gemini Live WebSocket
        const wsUrl = token
          ? `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${token}`
          : `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${directApiKey}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          // Send setup frame with high-fidelity VAD tuning and resumption support
          const setupFrame = {
            setup: {
              model: tokenData.model || "models/gemini-3.8-live",
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
                automaticActivityDetection: {
                  startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
                  endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
                  prefixPaddingMs: 200,
                  silenceDurationMs: 450,
                },
              },
              sessionResumption: resumptionHandleRef.current ? { handle: resumptionHandleRef.current } : {},
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: {
                parts: [{ text: systemInstruction }],
              },
              tools: [
                {
                  functionDeclarations: [
                    {
                      name: "show_concept_on_page",
                      description:
                        "Displays a visual concept card or triggers Morph view on the reader screen while speaking, so the student can follow along visually.",
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
                    {
                      name: "whiteboard_choreograph",
                      description:
                        "Choreographs the interactive whiteboard in real-time as you speak: points the glowing laser pointer at a specific node/annotation, reveals progressive drawing steps, or displays a handwritten chalk callout.",
                      behavior: "NON_BLOCKING",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          sceneIndex: { type: "INTEGER" },
                          revealStepIndex: { type: "INTEGER" },
                          laserTargetId: { type: "STRING" },
                          chalkAnnotation: { type: "STRING" },
                        },
                      },
                    },
                    {
                      name: "whiteboard_control_widget",
                      description:
                        "Controls the live Generative Clinical UI widget on the whiteboard: toggles a pharmacological drug/intervention, highlights a differential diagnosis row, or selects a clinical algorithm branch.",
                      behavior: "NON_BLOCKING",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          activeInterventionId: { type: "STRING" },
                          toggleIntervention: { type: "BOOLEAN" },
                          activeConditionId: { type: "STRING" },
                          activeStepId: { type: "STRING" },
                        },
                      },
                    },
                    {
                      name: "whiteboard_branch_topic",
                      description:
                        "Spawns a new visual whiteboard scene when the student asks an off-topic or deep-dive clinical question.",
                      behavior: "NON_BLOCKING",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          focusQuestion: { type: "STRING" },
                          preferredWidgetType: {
                            type: "STRING",
                            enum: ["physiology_simulator", "differential_matrix", "clinical_algorithm", "source_pinboard"],
                          },
                        },
                        required: ["focusQuestion"],
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

            // Session resumption token updates
            if (data.sessionResumptionUpdate?.newHandle) {
              resumptionHandleRef.current = data.sessionResumptionUpdate.newHandle;
            }

            // 0. Setup Complete acknowledgment from Gemini Live
            if (data.setupComplete) {
              isSetupCompleteRef.current = true;
              setStatus("listening");
              statusRef.current = "listening";
              flushPendingMessages();

              // If resuming, inject recent conversation context so dialogue continues seamlessly
              if (
                isResumingRef.current &&
                messagesRef.current.length > 0 &&
                ws.readyState === WebSocket.OPEN
              ) {
                const recentHistory = messagesRef.current
                  .slice(-6)
                  .map((m) => `${m.role === "user" ? "Student" : "Ascleon Mentor"}: ${m.text}`)
                  .join("\n");
                const resumeFrame = {
                  clientContent: {
                    turns: [
                      {
                        role: "user",
                        parts: [
                          {
                            text: `[SYSTEM CONTEXT: The student paused the session and just resumed. Previous conversation context:\n${recentHistory}\nContinue the clinical tutorial naturally from where you stopped. Do not repeat any introductory greeting.]`,
                          },
                        ],
                      },
                    ],
                    turnComplete: false,
                  },
                };
                ws.send(JSON.stringify(resumeFrame));
              }

              if (setupPromiseResolversRef.current) {
                setupPromiseResolversRef.current.resolve(true);
                setupPromiseResolversRef.current = null;
              }
              return;
            }

            // Handle server content (audio, transcriptions, interruptions)
            if (data.serverContent) {
              const sc = data.serverContent;

              // 1. Interruption handling (BARGE-IN confirmation from server)
              if (sc.interrupted) {
                if (playerNodeRef.current) {
                  playerNodeRef.current.port.postMessage({ command: "flush" });
                }
                ignoreModelAudioRef.current = false;
                outputLevelRef.current = 0;
                setOutputLevel(0);

                const interruptedMentorText = outputTranscriptAccRef.current.trim();
                outputTranscriptAccRef.current = "";
                setCurrentOutputTranscript("");

                if (interruptedMentorText) {
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: `mentor-interrupted-${Date.now()}`,
                      role: "mentor",
                      text: interruptedMentorText,
                      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                      interrupted: true,
                    },
                  ]);
                }

                statusRef.current = "listening";
                setStatus("listening");
                return;
              }

              // 2. Real-time Student Speech Input Transcription (sanitized against noise hallucinations)
              if (sc.inputTranscription?.text) {
                const chunk = sc.inputTranscription.text;
                if (!isHallucinatedNoiseTranscript(chunk)) {
                  inputTranscriptAccRef.current = joinStreamingTranscript(
                    inputTranscriptAccRef.current,
                    chunk
                  );
                  setCurrentInputTranscript(inputTranscriptAccRef.current);
                }
              }

              // 3. Real-time Mentor Audio output & Transcript
              if (sc.modelTurn?.parts) {
                // If user was speaking, commit user turn now as mentor has started responding
                if (inputTranscriptAccRef.current.trim()) {
                  const completedUserText = inputTranscriptAccRef.current.trim();
                  inputTranscriptAccRef.current = "";
                  setCurrentInputTranscript("");
                  if (!isHallucinatedNoiseTranscript(completedUserText)) {
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: `user-${Date.now()}`,
                        role: "user",
                        text: completedUserText,
                        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                      },
                    ]);
                  }
                }

                // If local barge-in flagged this turn as interrupted, ignore residual audio chunks
                if (ignoreModelAudioRef.current) {
                  return;
                }

                statusRef.current = "mentor_speaking";
                setStatus("mentor_speaking");

                for (const part of sc.modelTurn.parts) {
                  // Only treat non-thought text as spoken text fragment
                  if (part.text && !part.thought) {
                    outputTranscriptAccRef.current = joinStreamingTranscript(
                      outputTranscriptAccRef.current,
                      part.text
                    );
                    setCurrentOutputTranscript(outputTranscriptAccRef.current);
                  }

                  // Audio PCM chunk (24kHz 16-bit linear PCM)
                  if (part.inlineData?.data) {
                    const binary = window.atob(part.inlineData.data);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) {
                      bytes[i] = binary.charCodeAt(i);
                    }

                    if (playerNodeRef.current) {
                      playerNodeRef.current.port.postMessage(
                        { type: "audio", buffer: bytes.buffer },
                        [bytes.buffer]
                      );
                    }
                  }
                }
              }

              // Also check direct outputTranscription field if provided
              if (sc.outputTranscription?.text && !ignoreModelAudioRef.current) {
                // If user was speaking, commit user turn now
                if (inputTranscriptAccRef.current.trim()) {
                  const completedUserText = inputTranscriptAccRef.current.trim();
                  inputTranscriptAccRef.current = "";
                  setCurrentInputTranscript("");
                  if (!isHallucinatedNoiseTranscript(completedUserText)) {
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: `user-${Date.now()}`,
                        role: "user",
                        text: completedUserText,
                        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                      },
                    ]);
                  }
                }

                const chunk = sc.outputTranscription.text;
                outputTranscriptAccRef.current = joinStreamingTranscript(
                  outputTranscriptAccRef.current,
                  chunk
                );
                setCurrentOutputTranscript(outputTranscriptAccRef.current);
              }

              // 4. Turn Complete: commit remaining turns to permanent history
              if (sc.turnComplete) {
                ignoreModelAudioRef.current = false;
                const finalUserText = inputTranscriptAccRef.current.trim();
                const finalMentorText = outputTranscriptAccRef.current.trim();

                inputTranscriptAccRef.current = "";
                outputTranscriptAccRef.current = "";
                setCurrentInputTranscript("");
                setCurrentOutputTranscript("");

                if (finalUserText || finalMentorText) {
                  setMessages((prev) => {
                    const next = [...prev];
                    const currentTime = new Date().toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    if (finalUserText && !isHallucinatedNoiseTranscript(finalUserText)) {
                      next.push({
                        id: `user-${Date.now()}`,
                        role: "user",
                        text: finalUserText,
                        time: currentTime,
                      });
                    }
                    if (finalMentorText) {
                      next.push({
                        id: `mentor-${Date.now()}`,
                        role: "mentor",
                        text: finalMentorText,
                        time: currentTime,
                      });
                    }
                    return next;
                  });
                }

                statusRef.current = "listening";
                setStatus("listening");
              }
            }

            // 5. Tool Call handling (Whiteboard choreography & Visual triggers)
            if (data.toolCall) {
              const calls = data.toolCall.functionCalls || [];
              const responses: any[] = [];

              for (const call of calls) {
                if (call.name === "show_concept_on_page") {
                  const event: VisualTriggerEvent = {
                    conceptName: call.args?.conceptName || "Concept",
                    action: call.args?.action || "highlight_concept",
                    explanation: call.args?.explanation,
                  };
                  setActiveVisualTrigger(event);
                  if (onVisualTrigger) {
                    onVisualTrigger(event);
                  }

                  responses.push({
                    response: {
                      output: {
                        status: "displayed_on_screen",
                        action: event.action,
                        concept: event.conceptName,
                      },
                    },
                    id: call.id,
                  });
                } else if (call.name === "whiteboard_choreograph") {
                  const choreoEvent: WhiteboardChoreographEvent = {
                    sceneIndex: typeof call.args?.sceneIndex === "number" ? call.args.sceneIndex : undefined,
                    revealStepIndex: typeof call.args?.revealStepIndex === "number" ? call.args.revealStepIndex : undefined,
                    laserTargetId: call.args?.laserTargetId,
                    chalkAnnotation: call.args?.chalkAnnotation,
                  };
                  setActiveChoreography(choreoEvent);
                  if (onWhiteboardChoreograph) {
                    onWhiteboardChoreograph(choreoEvent);
                  }

                  responses.push({
                    response: {
                      output: {
                        status: "choreography_applied",
                        appliedStep: choreoEvent.revealStepIndex,
                        laserTarget: choreoEvent.laserTargetId,
                      },
                    },
                    id: call.id,
                  });
                } else if (call.name === "whiteboard_control_widget") {
                  const widgetEvent: WhiteboardWidgetControlEvent = {
                    activeInterventionId: call.args?.activeInterventionId,
                    toggleIntervention: call.args?.toggleIntervention,
                    activeConditionId: call.args?.activeConditionId,
                    activeStepId: call.args?.activeStepId,
                  };
                  setActiveWidgetControl(widgetEvent);
                  if (onWhiteboardWidgetControl) {
                    onWhiteboardWidgetControl(widgetEvent);
                  }

                  responses.push({
                    response: {
                      output: {
                        status: "widget_control_applied",
                        activeIntervention: widgetEvent.activeInterventionId,
                        toggleState: widgetEvent.toggleIntervention,
                      },
                    },
                    id: call.id,
                  });
                } else if (call.name === "whiteboard_branch_topic") {
                  const focusQuestion = call.args?.focusQuestion || "Clinical Focus";
                  const preferredWidgetType = call.args?.preferredWidgetType;
                  if (onWhiteboardBranchTopic) {
                    onWhiteboardBranchTopic(focusQuestion, preferredWidgetType);
                  }

                  responses.push({
                    response: {
                      output: {
                        status: "branch_topic_scheduled",
                        focusQuestion,
                      },
                    },
                    id: call.id,
                  });
                }
              }

              if (responses.length > 0 && ws.readyState === WebSocket.OPEN) {
                const toolResponseFrame = {
                  toolResponse: {
                    functionResponses: responses,
                  },
                };
                ws.send(JSON.stringify(toolResponseFrame));
              }
            }
          } catch (err) {
            console.error("[useLiveVoice] Error parsing incoming WebSocket frame:", err);
          }
        };

        ws.onerror = (err) => {
          console.error("[useLiveVoice] WebSocket error:", err);
          setErrorMessage("Voice connection error. Please reconnect.");
          setStatus("error");
          if (setupPromiseResolversRef.current) {
            setupPromiseResolversRef.current.reject(err);
            setupPromiseResolversRef.current = null;
          }
        };

        ws.onclose = (closeEvent) => {
          cleanupAudio();
          if (closeEvent && closeEvent.code && closeEvent.code !== 1000 && closeEvent.code !== 1005) {
            console.warn("[useLiveVoice] WebSocket closed abnormally:", closeEvent.code, closeEvent.reason);
            setErrorMessage(
              closeEvent.reason
                ? `Voice session closed (${closeEvent.code}): ${closeEvent.reason}`
                : `Voice connection closed (${closeEvent.code}). Tap Retry to reconnect.`
            );
            setStatus("error");
          } else {
            setStatus("disconnected");
          }
          if (setupPromiseResolversRef.current) {
            setupPromiseResolversRef.current.resolve(false);
            setupPromiseResolversRef.current = null;
          }
        };
      } catch (err: any) {
        console.error("[useLiveVoice] Connection setup failure:", err);
        setErrorMessage(err.message || "Could not start live voice session.");
        setStatus("error");
        cleanupAudio();
        if (setupPromiseResolversRef.current) {
          setupPromiseResolversRef.current.reject(err);
          setupPromiseResolversRef.current = null;
        }
        resolve(false);
      }
    });
  }, [
    bookTitle,
    pageNumber,
    pageText,
    selectedText,
    authoritativeReferences,
    language,
    voiceName,
    mode,
    cleanupAudio,
    sendRealtimeAudio,
    flushPendingMessages,
    onVisualTrigger,
    onWhiteboardChoreograph,
    onWhiteboardWidgetControl,
    onWhiteboardBranchTopic,
  ]);

  const sendTextMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    const cleanText = text.trim();

    // Add immediately to local message log
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        text: cleanText,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);

    // If connected and setup is complete, send clientContent with turnComplete: true
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isSetupCompleteRef.current) {
      const clientContentFrame = {
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [{ text: cleanText }],
            },
          ],
          turnComplete: true,
        },
      };
      wsRef.current.send(JSON.stringify(clientContentFrame));
    } else {
      // Queue message to send as soon as setupComplete is received
      pendingTextQueueRef.current.push(cleanText);
    }
  }, []);

  // Context update only when student navigates to a new page during an active call
  const updatePageContext = useCallback((newPageText: string, newPageNumber: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !isSetupCompleteRef.current) {
      return;
    }
    // Prevent duplicate updates on initial connection
    if (lastReportedPageRef.current === newPageNumber) {
      return;
    }
    lastReportedPageRef.current = newPageNumber;

    const updateFrame = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [
              {
                text: `[SYSTEM CONTEXT UPDATE: The student is now on Page ${newPageNumber}. Active text:\n"""${newPageText.slice(
                  0,
                  1500
                )}"""\nAdapt smoothly to this section if the student asks about it.]`,
              },
            ],
          },
        ],
        turnComplete: false,
      },
    };
    wsRef.current.send(JSON.stringify(updateFrame));
  }, []);

  // Live language update if user toggles language mode mid-call
  useEffect(() => {
    if (
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN ||
      !isSetupCompleteRef.current
    ) {
      return;
    }

    const langInstruction =
      language === "ar"
        ? "Please switch your response language immediately to authentic Egyptian Colloquial Arabic (العامية المصرية) for all subsequent explanations."
        : language === "mixed"
        ? "Please switch your response language immediately to clinical Mixed Egyptian Arabic + English medical terminology for all subsequent explanations."
        : "Please switch your response language immediately to clear, academic English for all subsequent explanations.";

    const frame = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text: `[SYSTEM DIRECTIVE: ${langInstruction}]` }],
          },
        ],
        turnComplete: false,
      },
    };
    try {
      wsRef.current.send(JSON.stringify(frame));
    } catch (e) {
      console.warn("[useLiveVoice] Failed to send mid-call language directive:", e);
    }
  }, [language]);

  const sendWhiteboardContext = useCallback((deckSummary: string, autoStartNarration = false) => {
    const directive = autoStartNarration
      ? `[WHITEBOARD DIRECTOR START: The student just pressed Play on the interactive whiteboard! Here is the active whiteboard deck with exact scene indices, step indices, and node IDs:\n"""${deckSummary}"""\nBegin explaining Scene 0 immediately in your natural voice! As you introduce each node and step, invoke 'whiteboard_choreograph' with { sceneIndex, revealStepIndex, laserTargetId, chalkAnnotation } so the marker hand draws and points at each anatomical sketch in real-time sync with your words.]`
      : `[WHITEBOARD CONTEXT UPDATE: The active whiteboard illustration deck is:\n"""${deckSummary}"""\nSynchronize your vocal explanation and use the 'whiteboard_choreograph' and 'whiteboard_control_widget' tools to highlight steps and widgets on the board.]`;

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !isSetupCompleteRef.current) {
      if (autoStartNarration) {
        pendingTextQueueRef.current.push(directive);
      }
      return;
    }
    const updateFrame = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text: directive }],
          },
        ],
        turnComplete: autoStartNarration,
      },
    };
    wsRef.current.send(JSON.stringify(updateFrame));
  }, []);

  const sendWhiteboardInteraction = useCallback((interactionText: string) => {
    const promptText = `[STUDENT WHITEBOARD INTERACTION: ${interactionText}. Address this immediately and concisely in your speech while calling 'whiteboard_choreograph' to point at the relevant node.]`;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !isSetupCompleteRef.current) {
      pendingTextQueueRef.current.push(promptText);
      return;
    }
    const interactionFrame = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text: promptText }],
          },
        ],
        turnComplete: true,
      },
    };
    wsRef.current.send(JSON.stringify(interactionFrame));
  }, []);

  const resetSession = useCallback(() => {
    disconnect();
    resumptionHandleRef.current = null;
    setMessages([]);
    messagesRef.current = [];
    inputTranscriptAccRef.current = "";
    outputTranscriptAccRef.current = "";
    setCurrentInputTranscript("");
    setCurrentOutputTranscript("");
    setActiveChoreography(null);
    setActiveWidgetControl(null);
    statusRef.current = "disconnected";
    setStatus("disconnected");
  }, [disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    status,
    isConnected: status === "listening" || status === "mentor_speaking" || status === "interrupted",
    isMuted,
    toggleMute,
    connect,
    disconnect,
    resetSession,
    interrupt,
    bargeInMode,
    setBargeInMode,
    sendTextMessage,
    updatePageContext,
    sendWhiteboardContext,
    sendWhiteboardInteraction,
    messages,
    currentInputTranscript,
    currentOutputTranscript,
    inputLevel,
    outputLevel,
    errorMessage,
    activeVisualTrigger,
    activeChoreography,
    activeWidgetControl,
    clearVisualTrigger: () => setActiveVisualTrigger(null),
    clearChoreography: () => setActiveChoreography(null),
    clearWidgetControl: () => setActiveWidgetControl(null),
  };
}
