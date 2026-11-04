/**
 * AudioWorkletProcessor: PCM Recorder
 * Anti-aliased downsampler from hardware AudioContext sampleRate to 16,000 Hz 16-bit linear PCM.
 * Computes RMS audio energy for live visualizer meters and streams raw ArrayBuffer chunks
 * to the main thread for streaming to Gemini 3.8 Live.
 */
class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.buffer = [];
    this.isRecording = true;
    this.phase = 0;
    this.rmsSum = 0;
    this.rmsCount = 0;

    this.port.onmessage = (event) => {
      if (event.data?.command === "stop") {
        this.isRecording = false;
        this.buffer = [];
        this.phase = 0;
      } else if (event.data?.command === "start") {
        this.isRecording = true;
        this.buffer = [];
        this.phase = 0;
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!this.isRecording) return true;

    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const channelData = input[0];
    const sourceSampleRate = sampleRate; // global in AudioWorkletGlobalScope

    // Compute live audio energy (RMS)
    let sumSquares = 0;
    for (let k = 0; k < channelData.length; k++) {
      const v = channelData[k];
      sumSquares += v * v;
    }
    this.rmsSum += sumSquares;
    this.rmsCount += channelData.length;

    // Report mic level approximately every ~1000 input samples (~20ms at 48kHz)
    if (this.rmsCount >= 1000) {
      const rawRms = Math.sqrt(this.rmsSum / this.rmsCount);
      // Scaled level for visual meter (capped at 1.0) and true physical rawRms for noise gating
      this.port.postMessage({
        type: "level",
        rms: Math.min(1, rawRms * 2.5),
        rawRms: rawRms,
      });
      this.rmsSum = 0;
      this.rmsCount = 0;
    }

    // Anti-aliased downsampling to 16kHz
    if (Math.abs(sourceSampleRate - this.targetSampleRate) < 1) {
      for (let i = 0; i < channelData.length; i++) {
        this.buffer.push(channelData[i]);
      }
    } else {
      const ratio = sourceSampleRate / this.targetSampleRate;
      let pos = this.phase;
      const len = channelData.length;

      while (pos < len) {
        const nextPos = pos + ratio;
        const start = Math.floor(pos);
        const end = Math.min(len, Math.floor(nextPos));

        // Box averaging across the downsample interval to eliminate high-frequency distortion
        let sum = 0;
        let count = 0;
        for (let i = start; i < end; i++) {
          sum += channelData[i];
          count++;
        }
        const sampleVal = count > 0 ? sum / count : channelData[start] || 0;
        this.buffer.push(sampleVal);
        pos = nextPos;
      }
      this.phase = pos - len;
    }

    // Flush in chunks of 512 samples (~32ms at 16kHz)
    const chunkSize = 512;
    while (this.buffer.length >= chunkSize) {
      const chunk = this.buffer.splice(0, chunkSize);
      const pcm16 = new Int16Array(chunk.length);
      let chunkSquareSum = 0;
      for (let j = 0; j < chunk.length; j++) {
        const s = Math.max(-1, Math.min(1, chunk[j]));
        chunkSquareSum += s * s;
        pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      const chunkRms = Math.sqrt(chunkSquareSum / chunk.length);
      this.port.postMessage(
        { type: "audio", buffer: pcm16.buffer, chunkRms },
        [pcm16.buffer]
      );
    }

    return true;
  }
}

registerProcessor("pcm-recorder-processor", PcmRecorderProcessor);
