// קולט שמע, ממיר לקצב הדגימה הרצוי ושולח חבילות Int16 קטנות (בערך 20ms)
class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions;
    this.outRate = o.outRate;
    this.channels = o.channels;
    this.step = sampleRate / this.outRate; // כמה דגימות קלט לכל דגימת פלט
    this.pos = 0; // מיקום חלקי בתוך החבילה הנוכחית
    this.prev = new Float32Array(this.channels);
    this.chunkFrames = Math.round(this.outRate * 0.02);
    this.buf = new Int16Array(this.chunkFrames * this.channels);
    this.fill = 0;
    this.peak = 0;
    this.levelCounter = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const n = input[0].length;
    const chans = [];
    for (let c = 0; c < this.channels; c++) chans.push(input[Math.min(c, input.length - 1)]);
    // אם צריך מונו, ממצעים את כל הערוצים
    if (this.channels === 1 && input.length > 1) {
      const mix = new Float32Array(n);
      for (let c = 0; c < input.length; c++) for (let i = 0; i < n; i++) mix[i] += input[c][i] / input.length;
      chans[0] = mix;
    }
    while (this.pos < n) {
      const i0 = Math.floor(this.pos);
      const frac = this.pos - i0;
      for (let c = 0; c < this.channels; c++) {
        const a = i0 - 1 < 0 ? this.prev[c] : chans[c][i0 - 1];
        const b = chans[c][i0];
        let v = a + (b - a) * frac;
        if (v > 1) v = 1; else if (v < -1) v = -1;
        const abs = v < 0 ? -v : v;
        if (abs > this.peak) this.peak = abs;
        this.buf[this.fill++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
      if (this.fill >= this.buf.length) {
        this.port.postMessage(this.buf.buffer, [this.buf.buffer]);
        this.buf = new Int16Array(this.chunkFrames * this.channels);
        this.fill = 0;
        if (++this.levelCounter >= 5) {
          this.port.postMessage({ level: this.peak });
          this.peak = 0;
          this.levelCounter = 0;
        }
      }
      this.pos += this.step;
    }
    this.pos -= n;
    for (let c = 0; c < this.channels; c++) this.prev[c] = chans[c][n - 1];
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
