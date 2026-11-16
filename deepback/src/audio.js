// Процедурный звук на WebAudio: никаких файлов, всё синтезируется.
export class Audio {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume ?? 0.7;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 18000;
    this.master.connect(this.filter).connect(ctx.destination);

    // шум волн
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    this.waveGain = ctx.createGain();
    this.waveGain.gain.value = 0.35;
    src.connect(lp).connect(this.waveGain).connect(this.master);
    src.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.15;
    lfo.connect(lfoG).connect(this.waveGain.gain);
    lfo.start();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  // ---------- Музыка: медленные минорные аккорды, тёплый пэд ----------
  // Ничего не загружается: ноты синтезируются. Днём светлее, ночью и под водой — глуше.
  startMusic() {
    if (!this.ctx || this.music) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = this.musicVolume ?? 0.5;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1400;
    tone.Q.value = 0.4;
    // простая «реверберация»: задержка с обратной связью
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.43;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    tone.connect(out);
    tone.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(out);
    out.connect(this.master);
    this.music = { out, tone, step: 0, timer: null };
    // ля-минор: Am – F – C – G – Am – Dm – E7 – Am (в герцах, низкий регистр)
    const N = (m) => 440 * Math.pow(2, (m - 69) / 12);
    this.chords = [
      [45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [43, 55, 59, 62],
      [45, 57, 60, 64], [38, 53, 57, 62], [40, 52, 56, 62], [45, 57, 60, 69],
    ].map((c) => c.map(N));
    const play = () => {
      if (!this.music) return;
      const chord = this.chords[this.music.step % this.chords.length];
      this.music.step++;
      const t = ctx.currentTime;
      const dur = 9;
      chord.forEach((f, i) => {
        for (const det of [-4, 4]) {
          const o = ctx.createOscillator();
          o.type = i === 0 ? 'sine' : 'triangle';
          o.frequency.value = f;
          o.detune.value = det;
          const g = ctx.createGain();
          const peak = (i === 0 ? 0.09 : 0.045) * (i === 3 ? 0.7 : 1);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(peak, t + 3);
          g.gain.setValueAtTime(peak, t + dur - 3);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.5);
          o.connect(g).connect(tone);
          o.start(t);
          o.stop(t + dur + 2);
        }
      });
      // редкая «капля» сверху — звонкая нота из аккорда
      if (Math.random() < 0.6) {
        const f = chord[1 + Math.floor(Math.random() * 3)] * 4;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        const at = t + 2 + Math.random() * 4;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.035, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 3);
        o.connect(g).connect(tone);
        o.start(at);
        o.stop(at + 3.2);
      }
      this.music.timer = setTimeout(play, (dur - 1.5) * 1000);
    };
    play();
  }

  // p — время суток 0..1, under — под водой ли камера
  setMood(p, under) {
    if (!this.music) return;
    const f = under ? 450 : 1600 - p * 900;
    this.music.tone.frequency.setTargetAtTime(f, this.ctx.currentTime, 1.5);
  }

  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.music) this.music.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setUnderwater(on) {
    if (!this.ctx) return;
    this.filter.frequency.setTargetAtTime(on ? 500 : 18000, this.ctx.currentTime, 0.15);
  }

  tone({ type = 'sine', f0, f1, dur, vol = 0.3, attack = 0.02, lp = null }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o.connect(g);
    if (lp) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      node = g.connect(f);
      f.connect(this.master);
    } else g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Песня Матери
  moan(intensity = 1) {
    const base = 55 + Math.random() * 30;
    this.tone({ type: 'sawtooth', f0: base, f1: base * (1.4 + Math.random() * 0.6), dur: 4.5, vol: 0.18 * intensity, attack: 1.2, lp: 320 });
    this.tone({ type: 'sine', f0: base * 2, f1: base * 1.5, dur: 4, vol: 0.12 * intensity, attack: 1.5 });
  }

  horn() {
    for (const f of [98, 147]) this.tone({ type: 'sawtooth', f0: f, f1: f * 0.98, dur: 2.2, vol: 0.12, attack: 0.1, lp: 900 });
  }

  pickup(kind) {
    const f = kind === 'relic' ? 880 : kind === 'fuel' ? 260 : 520;
    this.tone({ type: 'triangle', f0: f, f1: f * 1.5, dur: 0.25, vol: 0.2 });
    if (kind === 'relic') this.tone({ type: 'sine', f0: f * 1.5, f1: f * 2, dur: 1.2, vol: 0.12, attack: 0.05 });
  }

  deposit() {
    [392, 523, 659].forEach((f, i) => setTimeout(() => this.tone({ type: 'triangle', f0: f, dur: 0.3, vol: 0.15 }), i * 90));
  }

  // колокольчик лодки торговца
  bell() {
    [1175, 1568].forEach((f, i) => setTimeout(() => {
      this.tone({ type: 'sine', f0: f, dur: 1.6, vol: 0.09, attack: 0.005 });
      this.tone({ type: 'sine', f0: f * 2.7, dur: 0.6, vol: 0.03, attack: 0.005 });
    }, i * 380));
  }

  // далёкий зов с плота: два протяжных «эй!»
  call() {
    [0, 700].forEach((d) => setTimeout(() => this.tone({ type: 'sawtooth', f0: 420, f1: 330, dur: 0.5, vol: 0.05, attack: 0.04, lp: 1400 }), d));
  }

  // достижение: короткая восходящая фанфара
  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone({ type: 'triangle', f0: f, dur: 0.35, vol: 0.12 }), i * 110));
  }

  hit() {
    this.tone({ type: 'square', f0: 180, f1: 60, dur: 0.35, vol: 0.18, lp: 1200 });
  }

  wind() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 3;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.linearRampToValueAtTime(900, t + 1.5);
    bp.frequency.linearRampToValueAtTime(350, t + 3);
    const g = this.ctx.createGain();
    g.gain.value = 0.35;
    s.connect(bp).connect(g).connect(this.master);
    s.start(t);
  }

  thunder() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 3;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const g = this.ctx.createGain();
    g.gain.value = 1.4;
    s.connect(lp).connect(g).connect(this.master);
    s.start(t + 0.2 + Math.random() * 0.6);
  }

  blow() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 2.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    const g = this.ctx.createGain();
    g.gain.value = 0.5;
    s.connect(bp).connect(g).connect(this.master);
    s.start(t);
  }
}
