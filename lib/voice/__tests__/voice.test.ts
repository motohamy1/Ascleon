import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const mockAuth = vi.fn();
const mockCheckVoiceBudget = vi.fn();
const mockCreateAuthToken = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/usage.server", () => ({
  checkVoiceBudget: (userId: string) => mockCheckVoiceBudget(userId),
}));

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  return {
    ...actual,
    GoogleGenAI: class {
      authTokens = {
        create: (args: unknown) => mockCreateAuthToken(args),
      };
    },
  };
});

describe("POST /api/voice/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "AIzaSy-secret-server-key-never-expose";
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockCheckVoiceBudget.mockResolvedValue({ allowed: true });
  });

  it("never leaks GEMINI_API_KEY or directApiKey when authTokens.create fails", async () => {
    mockCreateAuthToken.mockRejectedValueOnce(new Error("IAM permission denied"));
    const { POST } = await import("@/app/api/voice/token/route");

    const req = new Request("http://localhost/api/voice/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookTitle: "MRCP", pageNumber: 195 }),
    });

    const res = await POST(req as never);
    const bodyText = await res.text();
    const json = JSON.parse(bodyText);

    expect(res.status).toBe(502);
    expect(json.directApiKey).toBeUndefined();
    expect(bodyText).not.toContain("AIzaSy-secret-server-key-never-expose");
  });

  it("configures low-sensitivity server VAD, compression, and no inputAudioTranscription by default", async () => {
    mockCreateAuthToken.mockResolvedValueOnce({ name: "auth_tokens/ephem_123" });
    const { POST } = await import("@/app/api/voice/token/route");

    const req = new Request("http://localhost/api/voice/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookTitle: "MRCP", pageNumber: 195, noisyPlace: false }),
    });

    const res = await POST(req as never);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.token).toBe("auth_tokens/ephem_123");
    expect(json.directApiKey).toBeUndefined();

    const callArg = mockCreateAuthToken.mock.calls[0][0] as {
      config: { liveConnectConstraints: { config: Record<string, unknown> } };
    };
    const liveCfg = callArg.config.liveConnectConstraints.config;
    expect(liveCfg.contextWindowCompression).toEqual({ slidingWindow: {} });
    expect(liveCfg.outputAudioTranscription).toEqual({});
    expect(liveCfg.inputAudioTranscription).toBeUndefined();
    expect(liveCfg.realtimeInputConfig).toEqual({
      automaticActivityDetection: {
        disabled: false,
        startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
        endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
        prefixPaddingMs: 300,
        silenceDurationMs: 700,
      },
    });
  });

  it("disables automatic VAD when noisyPlace is true (hold-to-talk)", async () => {
    mockCreateAuthToken.mockResolvedValueOnce({ name: "auth_tokens/ephem_456" });
    const { POST } = await import("@/app/api/voice/token/route");

    const req = new Request("http://localhost/api/voice/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookTitle: "MRCP", pageNumber: 195, noisyPlace: true }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);

    const callArg = mockCreateAuthToken.mock.calls[0][0] as {
      config: { liveConnectConstraints: { config: Record<string, unknown> } };
    };
    const liveCfg = callArg.config.liveConnectConstraints.config;
    expect(liveCfg.realtimeInputConfig).toEqual({
      automaticActivityDetection: { disabled: true },
    });
  });
});

function loadWorkletClass(relativePath: string) {
  const fullPath = path.resolve(process.cwd(), relativePath);
  const code = fs.readFileSync(fullPath, "utf8");
  let registeredClass: (new () => {
    port: { onmessage?: (e: { data: unknown }) => void; postMessage: (d: unknown) => void };
    process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
  }) | null = null;

  class BaseProcessor {
    port = {
      onmessage: undefined as ((e: { data: unknown }) => void) | undefined,
      postMessage: () => {},
    };
  }

  const fn = new Function("AudioWorkletProcessor", "sampleRate", "registerProcessor", code);
  fn(
    BaseProcessor,
    16000,
    (_name: string, cls: typeof registeredClass) => {
      registeredClass = cls;
    }
  );
  return registeredClass!;
}

describe("AudioWorklet DSP processors", () => {
  it("pcm-recorder streams fixed 20ms (320-sample) chunks without gating quiet speech", () => {
    const Recorder = loadWorkletClass("public/worklets/pcm-recorder.js");
    const proc = new Recorder();
    const posted: Array<{ type: string; buffer?: ArrayBuffer }> = [];
    proc.port.postMessage = (d) => posted.push(d as { type: string; buffer?: ArrayBuffer });

    // Feed 640 samples of quiet speech (0.01 amplitude, well below old 0.025 gate)
    const quietSpeech = new Float32Array(640).fill(0.01);
    proc.process([[quietSpeech]], []);

    const audioMsgs = posted.filter((m) => m.type === "audio");
    expect(audioMsgs).toHaveLength(2);
    expect(audioMsgs[0].buffer?.byteLength).toBe(640); // 320 samples * 2 bytes

    const pcm = new Int16Array(audioMsgs[0].buffer!);
    expect(pcm[0]).toBeGreaterThan(0); // Not zeroed out by a gate
  });

  it("pcm-player buffers 100ms before playback, drains on turn end, and flushes cleanly", () => {
    const Player = loadWorkletClass("public/worklets/pcm-player.js");
    const proc = new Player();
    const states: Array<{ type: string; playing?: boolean; underruns?: number }> = [];
    proc.port.postMessage = (d) =>
      states.push(d as { type: string; playing?: boolean; underruns?: number });

    // Send 1200 samples (50ms < 100ms prebuffer) -> should stay silent while buffering
    const smallChunk = new Int16Array(1200).fill(10000);
    proc.port.onmessage?.({ data: { type: "audio", buffer: smallChunk.buffer } });

    const out1 = new Float32Array(128);
    proc.process([], [[out1]]);
    expect(out1[0]).toBe(0);

    // Send another 1200 samples -> reaches 2400 (100ms), starts playing
    const chunk2 = new Int16Array(1200).fill(10000);
    proc.port.onmessage?.({ data: { type: "audio", buffer: chunk2.buffer } });

    const out2 = new Float32Array(128);
    proc.process([], [[out2]]);
    expect(out2[0]).toBeGreaterThan(0.2);

    // Flush mid-playback -> fades out and stops immediately
    proc.port.onmessage?.({ data: { command: "flush" } });
    const out3 = new Float32Array(128);
    proc.process([], [[out3]]);
    expect(out3[100]).toBe(0);
    expect(states.some((s) => s.type === "playback_state" && s.playing === false)).toBe(true);
  });
});
