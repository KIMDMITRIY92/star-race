// Музыка и звуки без файлов: космический эмбиент синтезируется в браузере (Web Audio API).
// Браузер разрешает звук только после нажатия пользователя — поэтому start() вызываем из обработчика клика.
export type Sfx = "impact" | "child" | "wedding" | "replace" | "overtake" | "crisis" | "study" | "retire" | "join" | "divorce";

const CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 66]]; // Am7 · Fmaj7 · Cmaj7 · G(add)
const PENTA = [69, 72, 74, 76, 79, 81, 84];
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private pad!: GainNode;
  private delay!: DelayNode;
  private voices: OscillatorNode[] = [];
  private tap: MediaStreamAudioDestinationNode | null = null;
  private timer = 0;
  private chord = 0;
  on = false;

  start() {
    if (this.on) return;
    try {
      if (!this.ctx) this.build();
      void this.ctx!.resume();
      this.on = true;
      this.master.gain.cancelScheduledValues(this.ctx!.currentTime);
      this.master.gain.setTargetAtTime(0.5, this.ctx!.currentTime, 1.2);
      this.nextChord();
      this.timer = window.setInterval(() => this.tick(), 900);
    } catch { this.on = false; }
  }
  stop() {
    if (!this.ctx || !this.on) return;
    this.on = false; clearInterval(this.timer);
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }
  // звук для записи ролика
  stream(): MediaStream | null {
    if (!this.ctx || !this.on) return null;
    if (!this.tap) { this.tap = this.ctx.createMediaStreamDestination(); this.master.connect(this.tap); }
    return this.tap.stream;
  }
  destroy() { this.stop(); void this.ctx?.close(); this.ctx = null; }

  private build() {
    const ctx = new AudioContext(); this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); this.master.connect(comp).connect(ctx.destination);
    // эхо для колокольчиков
    this.delay = ctx.createDelay(1.5); this.delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.38; const wet = ctx.createGain(); wet.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay); this.delay.connect(wet).connect(this.master);
    // мягкий пэд: 4 пары слегка расстроенных голосов через фильтр
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900; lp.Q.value = 0.6;
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.07; lfoG.gain.value = 350; lfo.connect(lfoG).connect(lp.frequency); lfo.start();
    this.pad = ctx.createGain(); this.pad.gain.value = 0.16; this.pad.connect(lp).connect(this.master);
    for (let i = 0; i < 8; i++) {
      const o = ctx.createOscillator(); o.type = i % 2 ? "triangle" : "sawtooth"; o.detune.value = i % 2 ? 7 : -7;
      const g = ctx.createGain(); g.gain.value = i % 2 ? 0.5 : 0.18; o.connect(g).connect(this.pad); o.start(); this.voices.push(o);
    }
    // глубокий бас-гул
    const sub = ctx.createOscillator(), sg = ctx.createGain(); sub.type = "sine"; sub.frequency.value = hz(33); sg.gain.value = 0.12; sub.connect(sg).connect(this.master); sub.start();
  }
  private nextChord() {
    const ctx = this.ctx!, ch = CHORDS[this.chord % CHORDS.length], t = ctx.currentTime;
    this.voices.forEach((o, i) => o.frequency.setTargetAtTime(hz(ch[Math.floor(i / 2)] - 12), t, 1.8));
    this.chord++;
  }
  private beats = 0;
  private tick() {
    if (!this.ctx) return;
    this.beats++;
    if (this.beats % 9 === 0) this.nextChord();
    if (Math.random() < 0.55) this.bell(PENTA[Math.floor(Math.random() * PENTA.length)], 0.05 + Math.random() * 0.04);
  }
  private bell(m: number, vol: number, at = 0, len = 2.2) {
    const ctx = this.ctx!, t = ctx.currentTime + at;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = hz(m); o2.type = "sine"; o2.frequency.value = hz(m) * 2.76;
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2).connect(g); g.connect(this.master); g.connect(this.delay);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.start(t); o2.start(t); o.stop(t + len); o2.stop(t + len);
  }
  private noise(len: number, f0: number, f1: number, vol: number, type: BiquadFilterType = "bandpass") {
    const ctx = this.ctx!, t = ctx.currentTime, n = Math.floor(ctx.sampleRate * len);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = 1.2; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + len);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(this.master); src.start(t);
  }
  private thump(f: number, len: number, vol: number) {
    const ctx = this.ctx!, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.35, t + len);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + len);
  }

  sfx(k: Sfx) {
    if (!this.on || !this.ctx) return;
    switch (k) {
      case "impact": this.thump(90, 0.7, 0.55); this.noise(0.6, 2500, 200, 0.35, "lowpass"); break;
      case "crisis": this.thump(55, 2.2, 0.4); this.noise(2, 400, 80, 0.2, "lowpass"); break;
      case "replace": this.noise(0.9, 300, 4000, 0.22); this.thump(140, 0.4, 0.35); break;
      case "overtake": this.bell(81, 0.07); this.bell(88, 0.05, 0.12); break;
      case "child": [76, 79, 84, 88].forEach((m, i) => this.bell(m, 0.09, i * 0.11, 2.6)); break;
      case "wedding": this.bell(72, 0.09); this.bell(79, 0.08, 0.2); this.bell(84, 0.07, 0.4, 3); break;
      case "study": [72, 76, 79].forEach((m, i) => this.bell(m, 0.07, i * 0.09)); break;
      case "retire": this.bell(60, 0.08, 0, 3.5); this.bell(64, 0.06, 0.15, 3.5); break;
      case "join": this.noise(0.6, 800, 3000, 0.12); this.bell(84, 0.08, 0.1); break;
      case "divorce": this.bell(69, 0.06); this.bell(65, 0.05, 0.25); break;
    }
  }
}
