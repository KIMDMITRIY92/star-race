// Расчёт уровней. Чистые функции без DOM — их можно проверять тестами.
import { COUNTRIES, COUNTRY_ORDER, type CountryCode, type CountryData, LEVELS, DEFAULT_AGE_CURVE, NOW_YEAR } from "./data";
import type { EventType, StarStyle } from "./engine";

export type Sex = "m" | "f";
export type Status = "study" | "work" | "biz" | "none";

export interface Period { from: number; to: number; status: Status; inc: string }
export interface LifeEvent { age: number; type: EventType }
export interface LifeInput {
  name: string; sex: Sex; birth: number; country: CountryCode; income: number;
  startAge: number;            // с какого возраста начинается путь (18–25)
  startKind: string;           // быстрый режим: с чего начинал — множитель к типичной зарплате или "study"
  marriedAt: number | null;    // возраст свадьбы
  kidsAt: number[];            // возраст при рождении детей
  color: string;               // цвет своей звезды
  style: StarStyle;
  compare: CountryCode[];      // средние люди других стран в «Моей гонке»
  world?: string[];            // «ты в стране X» для любых стран мира (ISO-коды, данные PIP)
  periods: Period[];           // подробный путь (по желанию)
  events: LifeEvent[];         // прочие события
}

// ---------- статистика ----------
function erf(x: number) {
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
export const Phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

// Разброс логнормального распределения: из пары «средняя / медиана» или из P90/P50 (США).
export const sigmaOf = (c: CountryData) => c.sigma ?? Math.sqrt(2 * Math.log(c.meanToMedian));

// Общая медиана ≈ среднее геометрическое мужской и женской (одинаковый разброс).
export const sexMedian = (c: CountryData, sex: Sex) =>
  sex === "m" ? c.median / Math.sqrt(c.femaleToMale) : c.median * Math.sqrt(c.femaleToMale);

const toSexRatio = (c: CountryData, sex: Sex, mult: number) =>
  mult * (sex === "m" ? Math.sqrt(c.femaleToMale) : 1 / Math.sqrt(c.femaleToMale));

export function ageProfile(c: CountryData, age: number) {
  const curve = c.ageCurve ?? DEFAULT_AGE_CURVE;
  if (age <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [a1, v1] = curve[i], [a0, v0] = curve[i - 1];
    if (age <= a1) return v0 + ((v1 - v0) * (age - a0)) / (a1 - a0);
  }
  return curve[curve.length - 1][1];
}

export const pct = (ratio: number, sigma: number) =>
  Math.min(99.5, Math.max(1, 100 * Phi(Math.log(Math.max(ratio, 1e-3)) / sigma)));

export const levelIndex = (p: number) => {
  let i = 0;
  LEVELS.forEach((l, k) => { if (p >= l.from) i = k; });
  return i;
};

export const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};
export const years = (n: number) => `${n} ${plural(n, "год", "года", "лет")}`;

// Все события человека: семья из быстрой анкеты + прочие.
export function allEvents(s: LifeInput): LifeEvent[] {
  const list: LifeEvent[] = [...s.events];
  if (s.marriedAt) list.push({ age: s.marriedAt, type: "wedding" });
  s.kidsAt.forEach(a => list.push({ age: a, type: "child" }));
  const A = NOW_YEAR - s.birth;
  return list.filter(e => e.age >= s.startAge && e.age <= A).sort((a, b) => a.age - b.age);
}

// ---------- путь человека ----------
export interface PathResult {
  age: number;
  startAge: number;
  you: number[];      // процентиль по годам, начиная со startAge
  median: number[];
  top10: number[];
  peers: number;      // «выше, чем у N из 100 сверстников»
  sigma: number;
  incomePpp: number;  // сегодняшний доход, долларов ППС в месяц
  youPpp: number[];   // доход по годам, долларов ППС в месяц (в ценах сегодняшнего дня)
}

export function computePath(s: LifeInput): PathResult {
  const c = COUNTRIES[s.country], sigma = sigmaOf(c), A = NOW_YEAR - s.birth;
  const S = Math.min(s.startAge, A - 1);
  const sm = sexMedian(c, s.sex);
  const nowRatio = s.income / sm;
  const ratios: (number | null)[] = [];
  const median: number[] = [], top10: number[] = [];
  const quick = s.periods.length === 0;
  for (let a = S; a <= A; a++) {
    let r: number | null = null;
    if (a === A) r = nowRatio;
    else if (quick) {
      if (a === S) r = s.startKind === "study" ? ageProfile(c, a) : toSexRatio(c, s.sex, Number(s.startKind || 1)) * ageProfile(c, a);
    } else {
      let per: Period | null = null;
      s.periods.forEach(p => { if (a >= p.from && a <= p.to) per = p; });
      const pp = per as Period | null;
      if (!pp) r = a === S ? ageProfile(c, a) : null;
      else if (pp.status === "study" && !pp.inc) r = ageProfile(c, a);
      else if (pp.status === "none" && !pp.inc) r = 0.15;
      else r = toSexRatio(c, s.sex, Number(pp.inc || 1));
    }
    ratios.push(r);
    median.push(pct(ageProfile(c, a), sigma));
    top10.push(pct(Math.exp(1.2816 * sigma) * ageProfile(c, a), sigma));
  }
  // пропуски — плавно (по геометрии) между известными годами
  for (let i = 0; i < ratios.length; i++) if (ratios[i] === null) {
    let j = i; while (j < ratios.length && ratios[j] === null) j++;
    const a = Math.max(0.05, (ratios[i - 1] ?? ageProfile(c, S)) as number), b = Math.max(0.05, (j < ratios.length ? ratios[j] : a) as number);
    for (let k = i; k < j; k++) ratios[k] = a * Math.pow(b / a, (k - i + 1) / (j - i + 1));
    i = j;
  }
  const rr = ratios as number[];
  // потеря работы и трудный год — провал в этом году (в быстром режиме)
  if (quick) allEvents(s).forEach(e => {
    const k = e.age - S;
    if (k > 0 && k < rr.length - 1 && (e.type === "jobloss" || e.type === "hard")) rr[k] *= e.type === "jobloss" ? 0.45 : 0.75;
  });
  const peers = 100 * Phi((Math.log(Math.max(nowRatio, 1e-3)) - Math.log(ageProfile(c, A))) / sigma);
  return {
    age: A, startAge: S, sigma,
    you: rr.map(r => pct(r, sigma)),
    median, top10,
    peers: Math.min(99, Math.max(1, Math.round(peers))),
    incomePpp: s.income / c.ppp,
    youPpp: rr.map(r => (r * sm) / c.ppp),
  };
}

// Медиана своего пола в стране по возрасту, долларов ППС в месяц.
export function countryMedianPpp(code: CountryCode, sex: Sex, age: number) {
  const c = COUNTRIES[code];
  return (sexMedian(c, sex) * ageProfile(c, age)) / c.ppp;
}

// Средний человек страны `other` по меркам страны `own` (процентиль в own) — для «Моей гонки».
export function foreignMedianPath(own: CountryCode, other: CountryCode, sex: Sex, from: number, to: number) {
  const c = COUNTRIES[own], sigma = sigmaOf(c), sm = sexMedian(c, sex);
  const out: number[] = [];
  for (let a = from; a <= to; a++) out.push(pct((countryMedianPpp(other, sex, a) * c.ppp) / sm, sigma));
  return out;
}

// ---------- «Кем бы ты был в другой стране» ----------
export interface Placement {
  code: CountryCode;
  local: number;      // твой доход в валюте страны (по ППС)
  p: number;          // процентиль среди работников своего пола
  top: number;        // «топ N%»
  level: number;      // индекс уровня
  like: string | null;      // ближайшая профессия/сфера по зарплате
  likeWage: number | null;
  likeVac: boolean;
  between: [string, string] | null;
}

export function placeIn(code: CountryCode, sex: Sex, incomePpp: number): Placement {
  const c = COUNTRIES[code];
  const local = incomePpp * c.ppp;
  const p = pct(local / sexMedian(c, sex), sigmaOf(c));
  let like: string | null = null, likeWage: number | null = null, likeVac = false, between: [string, string] | null = null;
  const marks = [...c.wages].sort((a, b) => a.monthly - b.monthly);
  if (marks.length) {
    let best = marks[0], bd = Infinity;
    for (const m of marks) { const d = Math.abs(Math.log(local / m.monthly)); if (d < bd) { bd = d; best = m; } }
    like = best.label; likeWage = best.monthly; likeVac = !!best.vac;
    if (local < marks[0].monthly * 0.85) between = ["меньше всех профессий в списке", marks[0].label];
    else if (local > marks[marks.length - 1].monthly * 1.15) between = [marks[marks.length - 1].label, "выше всех профессий в списке"];
  }
  return { code, local, p, top: Math.max(1, Math.round(100 - p)), level: levelIndex(p), like, likeWage, likeVac, between };
}

export const placeEverywhere = (sex: Sex, incomePpp: number) => COUNTRY_ORDER.map(c => placeIn(c, sex, incomePpp));

// ---------- «Твои ровесники» ----------
// Только факты статистики: средний возраст брака и первого ребёнка, армия. Сравниваем с возрастом человека.
export interface PeerFacts { code: CountryCode; lines: string[] }

export function peersAt(code: CountryCode, sex: Sex, age: number): PeerFacts {
  const L = COUNTRIES[code].life, lines: string[] = [];
  if (!L) return { code, lines };
  const mar = sex === "m" ? L.marriageM : L.marriageF;
  if (mar) lines.push(age < mar - 0.5 ? `Первый брак — в среднем в ${fmt(mar)}: большинство твоих ровесников ещё не женаты.` : age < mar + 2 ? `Первый брак — в среднем в ${fmt(mar)}: самое время свадеб.` : `Первый брак — в среднем в ${fmt(mar)}: многие ровесники уже в браке.`);
  const kid = sex === "m" ? L.firstBirthFather : L.firstBirthMother;
  if (kid) lines.push(age < kid - 0.5 ? `Первый ребёнок — в среднем в ${fmt(kid)}${sex === "m" && !L.firstBirthFatherExact ? " (у мам)" : ""}: у большинства ровесников детей ещё нет.` : `Первый ребёнок — в среднем в ${fmt(kid)}${sex === "m" && !L.firstBirthFatherExact ? " (у мам)" : ""}: у многих ровесников уже есть дети.`);
  if (sex === "m" && L.armyMonths) lines.push(age <= 23 ? `Армия: ${L.armyMonths} мес. — многие ровесники служат или только вернулись.` : `Армия для мужчин: ${L.armyMonths} мес.`);
  if (L.tertiary && age <= 34) lines.push(`Учёба: ${L.tertiary}.`);
  if (L.tfr) lines.push(`Детей на одну женщину в среднем: ${fmt(L.tfr)}.`);
  return { code, lines };
}
const fmt = (n: number) => `${String(Math.round(n * 10) / 10).replace(".", ",")}`;

// Подсказка к событию: как это происходит в других странах.
export function eventNote(type: EventType, sex: Sex, age: number): string | undefined {
  const pick = (f: (c: CountryData) => number | undefined) => COUNTRY_ORDER
    .map(code => ({ code, v: f(COUNTRIES[code]) }))
    .filter(x => x.v)
    .map(x => `${COUNTRIES[x.code].short} — ${fmt(x.v!)}`)
    .join(", ");
  if (type === "wedding") { const s = pick(c => sex === "m" ? c.life?.marriageM : c.life?.marriageF); return s ? `Ты — в ${age}. Средний возраст первого брака: ${s}` : undefined; }
  if (type === "child") { const s = pick(c => c.life?.firstBirthMother); return s ? `Ты — в ${age}. Средний возраст мамы при первом ребёнке: ${s}` : undefined; }
  return undefined;
}

// ---------- код звезды для друзей ----------
// В коде нет денег: только имя, год рождения, страна, возраст старта, уровни и события.
export interface StarCode { n: string; b: number; c: CountryCode; s: Sex; a: number; v: number[]; e: [number, EventType][] }

export function encodeStar(s: LifeInput, path: PathResult): string {
  const data: StarCode = { n: s.name || "Друг", b: s.birth, c: s.country, s: s.sex, a: path.startAge, v: path.you.map(x => Math.round(x)), e: allEvents(s).map(e => [e.age, e.type]) };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return "ЗВЕЗДА-" + b64;
}

export function decodeStar(code: string): StarCode | null {
  try {
    const raw = code.trim().replace(/^ЗВЕЗДА-/, "").replace(/-/g, "+").replace(/_/g, "/");
    const d = JSON.parse(decodeURIComponent(escape(atob(raw)))) as StarCode;
    if (!Array.isArray(d.v) || d.v.length < 1 || d.v.length > 80 || !COUNTRIES[d.c]) return null;
    d.v = d.v.map(x => Math.min(99.5, Math.max(1, Number(x) || 1)));
    d.n = String(d.n).slice(0, 16);
    d.a = Number(d.a) >= 16 && Number(d.a) <= 40 ? Number(d.a) : 18;
    d.e = (d.e || []).filter(x => Array.isArray(x)).slice(0, 30);
    return d;
  } catch { return null; }
}
