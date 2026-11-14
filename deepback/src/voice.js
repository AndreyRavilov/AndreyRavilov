// Озвучка рассказчика (ElevenLabs, голос «Aleksandr — Documentary Narrator»).
// Файлы лежат в audio/vo/<id>.mp3. Строки, для которых файла ещё нет,
// просто показываются субтитрами — игра от этого не ломается.

// id сцены → длительность фразы в секундах (из ElevenLabs)
export const VO = { deep: 4.8, reveal: 6.56, breath: 2.64, dive: 4.0, you: 7.28 };
export const VO_LINES = Object.keys(VO);

export class Voice {
  constructor(base = './audio/vo/') {
    this.base = base;
    this.volume = 1;
    this.current = null;
    this.cache = new Map();
  }

  has(id) {
    return VO_LINES.includes(id);
  }

  preload() {
    for (const id of VO_LINES) this.clip(id);
  }

  clip(id) {
    if (!this.cache.has(id)) {
      const a = new Audio(`${this.base}${id}.mp3`);
      a.preload = 'auto';
      this.cache.set(id, a);
    }
    return this.cache.get(id);
  }

  play(id) {
    this.stop();
    if (!this.has(id) || this.volume <= 0) return null;
    const a = this.clip(id);
    a.volume = this.volume;
    a.currentTime = 0;
    const p = a.play();
    if (p && p.catch) p.catch(() => {}); // без жеста пользователя звук может быть запрещён
    this.current = a;
    return a;
  }

  stop() {
    if (this.current) {
      this.current.pause();
      this.current = null;
    }
  }

  setVolume(v) {
    this.volume = v;
    if (this.current) this.current.volume = v;
  }
}
