/**
 * AudioWorkletProcessor: PCM Recorder
 * Converts hardware microphone Float32 frames to 16,000 Hz 16-bit linear PCM.
 * Streams clean, unedited audio in fixed 20ms (320-sample) chunks to Gemini Live
 * so server-side VAD and echo/barge-in handling receive intact speech onsets and sibilants.
 */
class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.chunkSize = 320; // 20ms at 16kHz
    this.buffer = new Float32Array(this.chunkSize * 4);
    this.bufferLength = 0;
    this.isRecording = true;
    this.phase = 0;
    this.rmsSum = 0;
    this.rmsCount = 0;

    this.port.onmessage = (event) => {
      if (event.data?.command === "stop") {
        this.isRecording = false;
        this.bufferLength = 0;
        this.phase = 0;
        this.rmsSum = 0;
        this.rmsCount = 0;
        this.port.postMessage({ type: "level", rms: 0 });
      } else if (event.data?.command === "start") {
        this.isRecording = true;
        this.bufferLength = 0;
        this.phase = 0;
        this.rmsSum = 0;
        this.rmsCount = 0;
      }
    };
  }

  _appendSample(val) {
    if (this.bufferLength >= this.buffer.length) {
      const next = new Float32Array(this.buffer.length * 2);
      next.set(this.buffer);
      this.buffer = next;
    }
    this.buffer[this.bufferLength++] = val;
  }

  process(inputs) {
    if (!this.isRecording) return true;

    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const channelData = input[0];
    const sourceSampleRate = sampleRate;

    // Live RMS energy for UI visualizer (~every 40ms)
    let sumSquares = 0;
    for (let k = 0; k < channelData.length; k++) {
      const v = channelData[k];
      sumSquares += v * v;
    }
    this.rmsSum += sumSquares;
    this.rmsCount += channelData.length;

    const levelInterval = Math.max(640, Math.round(sourceSampleRate * 0.04));
    if (this.rmsCount >= levelInterval) {
      const rawRms = Math.sqrt(this.rmsSum / this.rmsCount);
      this.port.postMessage({
        type: "level",
        rms: Math.min(1, rawRms * 3.0),
      });
      this.rmsSum = 0;
      this.rmsCount = 0;
    }

    // Fast path when AudioContext already runs at 16kHz; anti-aliased box resample otherwise
    if (Math.abs(sourceSampleRate - this.targetSampleRate) < 1) {
      for (let i = 0; i < channelData.length; i++) {
        this._appendSample(channelData[i]);
      }
    } else {
      const ratio = sourceSampleRate / this.targetSampleRate;
      let pos = this.phase;
      const len = channelData.length;

      while (pos < len) {
        const nextPos = pos + ratio;
        const start = Math.floor(pos);
        const end = Math.min(len, Math.floor(nextPos));

        let sum = 0;
        let count = 0;
        for (let i = start; i < end; i++) {
          sum += channelData[i];
          count++;
        }
        const sampleVal = count > 0 ? sum / count : channelData[start] || 0;
        this._appendSample(sampleVal);
        pos = nextPos;
      }
      this.phase = pos - len;
    }

    // Flush fixed 20ms (320-sample) 16-bit PCM chunks
    while (this.bufferLength >= this.chunkSize) {
      const pcm16 = new Int16Array(this.chunkSize);
      for (let j = 0; j < this.chunkSize; j++) {
        const s = Math.max(-1, Math.min(1, this.buffer[j]));
        pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      const remaining = this.bufferLength - this.chunkSize;
      if (remaining > 0) {
        this.buffer.copyWithin(0, this.chunkSize, this.bufferLength);
      }
      this.bufferLength = remaining;

      this.port.postMessage(
        {
          type: "audio",
          buffer: pcm16.buffer,
        },
        [pcm16.buffer]
      );
    }

    return true;
  }
}

registerProcessor("pcm-recorder-processor", PcmRecorderProcessor);
