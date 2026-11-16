// Достижения: маленькие цели, которые сохраняются между забегами.
export const ACHIEVEMENTS = [
  { id: 'first-relic', icon: '◈', title: 'Голос мёртвого города', desc: 'Донести до Ковчега первую реликвию.' },
  { id: 'fisher', icon: '🐟', title: 'Рука рыбака', desc: 'Поймать рыбу прямо из косяка.' },
  { id: 'trader', icon: '⛵', title: 'Честная сделка', desc: 'Обменяться с торговцем.' },
  { id: 'leech10', icon: '🪱', title: 'Гроза пиявок', desc: 'Убить десять пиявок.' },
  { id: 'storm', icon: '⛈️', title: 'Сквозь бурю', desc: 'Вернуться в Ковчег в шторм.' },
  { id: 'seas', icon: '🧭', title: 'Всё Течение', desc: 'Побывать во всех морях маршрута Матери.' },
  { id: 'day10', icon: '🌅', title: 'Десятое утро', desc: 'Дожить до десятого дня.' },
  { id: 'nodeaths', icon: '🕯️', title: 'Все дома', desc: 'Пережить ночь, не потеряв ни одного жителя.' },
  { id: 'rescue', icon: '🛟', title: 'Ещё один голос', desc: 'Спасти выжившего с плота.' },
  { id: 'gull', icon: '🪶', title: 'Не сегодня, птица', desc: 'Отогнать чайку-воришку гарпуном.' },
  { id: 'deepling', icon: '🦷', title: 'Зубы против зубов', desc: 'Прогнать глубинника на глубину, изранив его.' },
  { id: 'finisher', icon: '⚔️', title: 'Три удара', desc: 'Провести добивание: три попадания гарпуном подряд.' },
  { id: 'rope', icon: '🪝', title: 'На крючке', desc: 'Подтянуть пиявку гарпуном на тросе.' },
  { id: 'dodge', icon: '💨', title: 'Мимо зубов', desc: 'Уйти рывком от броска глубинника.' },
  { id: 'full-pack', icon: '🎒', title: 'Под завязку', desc: 'Сдать в Ковчег полный груз за один раз.' },
  { id: 'ending', icon: '🐋', title: 'Правда о Матери', desc: 'Собрать семь реликвий и сделать выбор.' },
];

const KEY = 'deepback-achievements-v1';

export class Achievements {
  // storage — объект с getItem/setItem (localStorage) или null в тестах
  constructor(storage = null) {
    this.storage = storage;
    this.data = { got: {}, leeches: 0, seas: [] };
    try {
      const raw = storage && storage.getItem(KEY);
      if (raw) this.data = { ...this.data, ...JSON.parse(raw) };
    } catch {
      /* испорченная запись — начинаем заново */
    }
  }

  save() {
    try {
      this.storage && this.storage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* приватное окно — живём без сохранения */
    }
  }

  has(id) {
    return !!this.data.got[id];
  }

  // Открыть достижение; возвращает его описание, если оно новое, иначе null
  unlock(id) {
    if (this.has(id)) return null;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return null;
    this.data.got[id] = Date.now();
    this.save();
    return a;
  }

  leechKilled() {
    this.data.leeches++;
    this.save();
    return this.data.leeches >= 10 ? this.unlock('leech10') : null;
  }

  seaVisited(key, total) {
    if (!this.data.seas.includes(key)) {
      this.data.seas.push(key);
      this.save();
    }
    return this.data.seas.length >= total ? this.unlock('seas') : null;
  }

  get count() {
    return Object.keys(this.data.got).length;
  }
}
