/**
 * AudioWorkletProcessor: PCM Player
 * Receives 24,000 Hz 16-bit linear PCM chunks from Gemini Live.
 * Uses a jitter buffer (~100ms pre-roll) to eliminate initial robotic crackles/underruns,
 * applies a short fade-out on flush to avoid clicks, and reports true playback state & underruns.
 */
class PcmPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.currentOffset = 0;
    this.bufferedSamples = 0;
    this.prebufferSamples = 2400; // 100ms at 24kHz
    this.isBuffering = true;
    this.isPlaying = false;
    this.isDraining = false;
    this.fadeOutRemaining = 0;
    this.fadeOutTotal = 64;
    this.lastSample = 0;
    this.underrunCount = 0;
    this.rmsSum = 0;
    this.rmsCount = 0;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.command === "flush" || data.type === "flush" || data === "flush") {
        this.queue = [];
        this.currentOffset = 0;
        this.bufferedSamples = 0;
        this.isBuffering = true;
        this.isDraining = false;
        this.fadeOutRemaining = this.isPlaying ? this.fadeOutTotal : 0;
        if (this.isPlaying) {
          this.isPlaying = false;
          this.port.postMessage({ type: "playback_state", playing: false, rms: 0, underruns: this.underrunCount });
        }
        return;
      }

      if (data.command === "drain") {
        this.isDraining = true;
        if (this.bufferedSamples > 0 && this.isBuffering) {
          this.isBuffering = false;
        }
        return;
      }

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
        this.bufferedSamples += float32.length;
        this.isDraining = false;

        if (this.isBuffering && this.bufferedSamples >= this.prebufferSamples) {
          this.isBuffering = false;
        }
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const channel = output[0];
    const bufferSize = channel.length;
    let written = 0;

    if (this.fadeOutRemaining > 0) {
      while (written < bufferSize && this.fadeOutRemaining > 0) {
        const gain = this.fadeOutRemaining / this.fadeOutTotal;
        channel[written++] = this.lastSample * gain;
        this.fadeOutRemaining--;
      }
      this.lastSample = 0;
    }

    if (!this.isBuffering) {
      while (written < bufferSize && this.queue.length > 0) {
        const currentChunk = this.queue[0];
        const remainingInChunk = currentChunk.length - this.currentOffset;
        const needed = bufferSize - written;
        const toCopy = Math.min(remainingInChunk, needed);

        for (let i = 0; i < toCopy; i++) {
          const sample = currentChunk[this.currentOffset + i];
          channel[written + i] = sample;
          this.lastSample = sample;
        }

        written += toCopy;
        this.currentOffset += toCopy;
        this.bufferedSamples -= toCopy;

        if (this.currentOffset >= currentChunk.length) {
          this.queue.shift();
          this.currentOffset = 0;
        }
      }

      if (written > 0 && !this.isPlaying) {
        this.isPlaying = true;
        this.port.postMessage({ type: "playback_state", playing: true, rms: 0, underruns: this.underrunCount });
      }

      // If queue ran dry mid-turn (not draining), count underrun and re-buffer cleanly
      if (written < bufferSize && this.queue.length === 0) {
        if (this.isPlaying && !this.isDraining) {
          this.underrunCount++;
          this.isBuffering = true;
        } else if (this.isPlaying && this.isDraining) {
          this.isPlaying = false;
          this.isDraining = false;
          this.isBuffering = true;
          this.port.postMessage({ type: "playback_state", playing: false, rms: 0, underruns: this.underrunCount });
        }
      }
    }

    while (written < bufferSize) {
      channel[written++] = 0;
    }

    let sumSquares = 0;
    for (let k = 0; k < bufferSize; k++) {
      const v = channel[k];
      sumSquares += v * v;
    }
    this.rmsSum += sumSquares;
    this.rmsCount += bufferSize;

    // Report playback level approximately every ~40ms (1000 samples at 24kHz)
    if (this.rmsCount >= 1000) {
      const rawRms = Math.sqrt(this.rmsSum / this.rmsCount);
      this.port.postMessage({
        type: "level",
        rms: this.isPlaying ? Math.min(1, rawRms * 2.5) : 0,
      });
      this.rmsSum = 0;
      this.rmsCount = 0;
    }

    if (output[1]) {
      for (let i = 0; i < bufferSize; i++) {
        output[1][i] = channel[i];
      }
    }

    return true;
  }
}

registerProcessor("pcm-player-processor", PcmPlayerProcessor);
