// Жизнь «среднего человека» по статистике страны: развилка вуз/работа, свадьба, дети, взросление детей, пенсия.
// Чистые функции — проверяются тестами. Где цифры нет в статистике, в подписи стоит «≈».
import { COUNTRIES, EDU, retireAge, type CountryCode, EVENT_LABELS } from "./data";
import { ageProfile, pct, sigmaOf, type Sex } from "./calc";
import type { RaceEvent, EventType } from "./engine";

const f1 = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
const ev = (age: number, type: EventType, note?: string): RaceEvent => ({ age, type, label: EVENT_LABELS[type], note });

// Медиана выпускников вуза и остальных относительно общей медианы.
// Модель: логарифм дохода — смесь двух групп с долей выпускников s и разницей медиан ln(premium);
// общая медиана ≈ середина смеси, поэтому выпускники выше неё на (1−s)·d, остальные ниже на s·d.
export function eduFactors(code: CountryCode, sex: Sex) {
  const e = EDU[code], s = sex === "m" ? e.shareM : e.shareF, d = Math.log(e.premium);
  return { grad: Math.exp((1 - s) * d), rest: Math.exp(-s * d), share: s };
}

export function gradAge(code: CountryCode, sex: Sex) {
  const army = sex === "m" ? COUNTRIES[code].life?.armyMonths ?? 0 : 0;
  return 22 + (code === "KR" ? army / 12 : 0); // в Корее мужчины обычно служат во время учёбы
}

export interface MedianLife { uni: { values: number[]; events: RaceEvent[] }; work: { values: number[]; events: RaceEvent[] }; share: number; retire: number }

// Возраст первого ребёнка: для мамы — статистика; для папы — точная цифра, если есть, иначе мама + разница возраста брака.
export function firstChildAge(code: CountryCode, sex: Sex) {
  const L = COUNTRIES[code].life; if (!L) return null;
  if (!L.firstBirthMother) { const m = sex === "m" ? L.marriageM : L.marriageF; return m ? m + 1 : null; } // ≈ нет точной цифры
  if (sex === "f") return L.firstBirthMother;
  if (L.firstBirthFather) return L.firstBirthFather;
  return L.firstBirthMother + Math.max(0, (L.marriageM ?? 0) - (L.marriageF ?? 0));
}

export function familyEvents(code: CountryCode, sex: Sex, birth: number, from: number, to: number): RaceEvent[] {
  const L = COUNTRIES[code].life, out: RaceEvent[] = [];
  if (!L) return out;
  const mar = sex === "m" ? L.marriageM : L.marriageF;
  if (mar) out.push(ev(Math.round(mar), "wedding", `Средний возраст первого брака — ${f1(mar)}. На 100 свадеб в год ≈ ${EDU[code].divorce} разводов`));
  const k1 = firstChildAge(code, sex);
  if (k1) {
    const n = Math.max(1, Math.round(L.tfr ?? 1));
    for (let j = 0; j < n; j++) {
      const a = Math.round(k1) + j * 3;
      out.push(ev(a, "child", j === 0 ? `Первый ребёнок — ${L.firstBirthMother ? "в среднем" : "≈ через год после свадьбы, точной цифры нет,"} в ${f1(k1)}${L.tfr ? `; детей на семью ≈ ${f1(L.tfr)}` : ""}` : `≈ ещё один ребёнок (рождаемость ${f1(L.tfr ?? 0)})`));
      out.push(ev(a + 18, "kidout", "Ребёнку 18 — у него свой путь"));
    }
  }
  const r = retireAge(code, sex, birth);
  out.push(ev(r, "retire", `Пенсионный возраст — ${f1(r)}`));
  return out.filter(e => e.age >= from && e.age <= to).sort((a, b) => a.age - b.age);
}

// Два средних человека одного возраста: «вуз» и «работа с 18».
export function medianLife(code: CountryCode, sex: Sex, birth: number, from: number, to: number): MedianLife {
  const c = COUNTRIES[code], sigma = sigmaOf(c), F = eduFactors(code, sex), G = gradAge(code, sex), R = retireAge(code, sex, birth);
  const at = (a: number, k: number) => pct(ageProfile(c, Math.min(a, R)) * k, sigma);
  const uni: number[] = [], work: number[] = [];
  for (let a = from; a <= to; a++) {
    uni.push(a < G ? at(a, 0.5) : at(a, F.grad));   // студент подрабатывает → после диплома медиана выпускников
    work.push(at(a, F.rest));
  }
  const fam = familyEvents(code, sex, birth, from, to);
  const share = Math.round(F.share * 100);
  const uniEv = [...fam, ...(G >= from && G <= to ? [ev(Math.round(G), "study", `Диплом. С высшим в стране ≈ ${share}% ровесников`)] : [])].sort((a, b) => a.age - b.age);
  return { uni: { values: uni, events: uniEv }, work: { values: work, events: fam }, share, retire: R };
}

// Путь ребёнка после 18 лет — по средним данным страны (пол неизвестен: общая медиана).
export function childPath(code: CountryCode, kidAge18At: number, from: number, to: number) {
  const c = COUNTRIES[code], sigma = sigmaOf(c);
  const out: number[] = [];
  for (let a = from; a <= to; a++) out.push(pct(ageProfile(c, 18 + Math.max(0, a - kidAge18At)), sigma));
  return out;
}
