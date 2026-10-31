// Семья и друзья в гонке. Родственники идут по календарным годам (мама в 2010 году — это мама в 2010-м),
// друзья — по возрасту (сравниваем, кто где был в 25 лет). Чистые функции — проверяются тестами.
import { ageProfile, pct, sigmaOf, type Sex, type StarCode } from "./calc";
import { COUNTRIES, NOW_YEAR, type CountryCode } from "./data";
import type { EventType, RaceEvent } from "./engine";
import { EVENT_LABELS } from "./data";

export type Rel = "friend" | "parent" | "partner" | "sibling" | "child" | "relative";
export interface Member extends StarCode { r?: Rel; gone?: number; est?: boolean } // gone — год, когда человек ушёл из жизни (родные) или пути разошлись (друзья)

export const REL_LABELS: [Rel, string][] = [
  ["friend", "Друг / подруга"], ["parent", "Мама или папа"], ["partner", "Муж / жена / партнёр"],
  ["sibling", "Брат или сестра"], ["child", "Сын или дочь"], ["relative", "Другой родственник"],
];
export const relName = (r?: Rel) => ({ friend: "друг", parent: "родитель", partner: "партнёр", sibling: "брат/сестра", child: "ребёнок", relative: "родственник" })[r ?? "friend"];

// Значения родственника по годам героя. start — индекс года, когда его путь начинается (−1 — ещё не начался).
export function alignByYear(m: StarCode, heroBirth: number, S: number, len: number) {
  const values: number[] = []; let start = -1;
  for (let i = 0; i < len; i++) {
    const k = heroBirth + S + i - (m.b + m.a);
    if (k >= 0 && start < 0) start = i;
    values.push(m.v[Math.min(Math.max(k, 0), m.v.length - 1)]);
  }
  return { values, start };
}

// События родственника в возрасте героя.
export function eventsByYear(m: StarCode, heroBirth: number, from: number, to: number): RaceEvent[] {
  return (m.e || []).map(([age, type]) => ({ age: age + (m.b - heroBirth), type: type as EventType, label: EVENT_LABELS[type as EventType] ?? "" }))
    .filter(e => e.label && e.age >= from && e.age <= to);
}

export const inviteLink = (base: string, code: string) => `${base.split("#")[0]}#star=${encodeURIComponent(code)}`;
export function readInvite(hash: string): string | null {
  const m = /[#&]star=([^&]+)/.exec(hash);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}

// Уход из гонки: для родных — созвездие-память, для друзей — «пути разошлись». t — момент на шкале героя.
export function leaveOf(m: Member, heroBirth: number, S: number) {
  if (!m.gone) return undefined;
  const memory = !!m.r && m.r !== "friend";
  const t = memory ? m.gone - (heroBirth + S) : m.gone - (m.b + S);
  return { t: Math.max(0, t), kind: memory ? "memory" as const : "apart" as const, text: memory ? "Светлая память" : "Пути разошлись" };
}

// Близкий без кода (например, ушедший родитель): путь по средним данным страны от 18 лет.
export function manualMember(name: string, birth: number, rel: Rel, country: CountryCode, sex: Sex, gone?: number): Member {
  const c = COUNTRIES[country], sigma = sigmaOf(c), end = Math.min(NOW_YEAR, gone ?? NOW_YEAR) - birth;
  const v: number[] = [];
  for (let a = 18; a <= Math.max(18, end); a++) v.push(Math.round(pct(ageProfile(c, Math.min(a, 65)), sigma)));
  return { n: name.slice(0, 16) || "Близкий", b: birth, c: country, s: sex, a: 18, v, e: [], r: rel, gone, est: true };
}
