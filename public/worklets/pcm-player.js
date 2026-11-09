/**
 * AudioWorkletProcessor: PCM Player
 * Receives 24,000 Hz 16-bit linear PCM chunks from Gemini 3.8 Live.
 * Queues them and plays seamlessly through the browser output.
 * On interruption ("flush" command), immediately empties all queued audio for sub-millisecond barge-in.
 * Reports real-time playback RMS levels back to the main thread.
 */
class PcmPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.currentOffset = 0;
    this.rmsSum = 0;
    this.rmsCount = 0;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      // Handle flush command on interruption
      if (data.command === "flush" || data.type === "flush" || data === "flush") {
        this.queue = [];
        this.currentOffset = 0;
        this.port.postMessage({ type: "level", rms: 0 });
        return;
      }

      // Handle raw ArrayBuffer OR { type: 'audio', buffer: ArrayBuffer }
      let rawBuffer = null;
      if (data instanceof ArrayBuffer) {
        rawBuffer = data;
      } else if (data.buffer instanceof ArrayBuffer) {
        rawBuffer = data.buffer;
      }

      if (rawBuffer && rawBuffer.byteLength > 0) {
        const int16 = new Int16Array(rawBuffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
          float32[i] = int16[i] / 32768.0;
        }
        this.queue.push(float32);
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const channel = output[0];
    const bufferSize = channel.length;
    let written = 0;

    while (written < bufferSize && this.queue.length > 0) {
      const currentChunk = this.queue[0];
      const remainingInChunk = currentChunk.length - this.currentOffset;
      const needed = bufferSize - written;
      const toCopy = Math.min(remainingInChunk, needed);

      for (let i = 0; i < toCopy; i++) {
        channel[written + i] = currentChunk[this.currentOffset + i];
      }

      written += toCopy;
      this.currentOffset += toCopy;

      if (this.currentOffset >= currentChunk.length) {
        this.queue.shift();
        this.currentOffset = 0;
      }
    }

    // Fill remaining output frame with silence if queue ran dry
    while (written < bufferSize) {
      channel[written++] = 0;
    }

    // Compute live audio RMS energy for visualizer
    let sumSquares = 0;
    for (let k = 0; k < bufferSize; k++) {
      const v = channel[k];
      sumSquares += v * v;
    }
    this.rmsSum += sumSquares;
    this.rmsCount += bufferSize;

    // Report playback level approximately every ~1000 samples (~40ms at 24kHz)
    if (this.rmsCount >= 1000) {
      const rawRms = Math.sqrt(this.rmsSum / this.rmsCount);
      this.port.postMessage({
        type: "level",
        rms: Math.min(1, rawRms * 2.5),
        rawRms: rawRms,
      });
      this.rmsSum = 0;
      this.rmsCount = 0;
    }

    // Duplicate to right channel if stereo
    if (output[1]) {
      for (let i = 0; i < bufferSize; i++) {
        output[1][i] = channel[i];
      }
    }

    return true;
  }
}

registerProcessor("pcm-player-processor", PcmPlayerProcessor);
