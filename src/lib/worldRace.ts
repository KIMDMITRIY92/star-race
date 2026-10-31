// Гонка стран мира: ВВП на душу населения по годам. Видны только K первых мест — новичок влетает и выбивает выбывающего.
import { WORLD, WORLD_Y0, WORLD_Y1, countryName } from "./world";
import type { Racer, RaceSpec } from "./engine";

export const WORLD_CODES = Object.keys(WORLD).sort((a, b) => countryName(a).localeCompare(countryName(b), "ru"));

// Наборы для быстрого выбора. Страны без данных (население < 1 млн) отбрасываются.
export const PRESETS: { id: string; name: string; codes: string[] }[] = [
  { id: "region", name: "Мой регион", codes: ["RU", "KZ", "KG", "UZ", "TJ", "TM", "BY", "UA", "AZ", "GE", "AM", "MN", "CN", "KR", "TR", "US"] },
  { id: "world", name: "Весь мир", codes: Object.keys(WORLD) },
  { id: "asia", name: "Азия", codes: ["CN", "JP", "KR", "IN", "ID", "VN", "TH", "MY", "PH", "SG", "KZ", "UZ", "MN", "BD", "PK", "SA", "AE", "TR", "IL"] },
  { id: "g20", name: "Большая двадцатка", codes: ["AR", "AU", "BR", "CA", "CN", "FR", "DE", "IN", "ID", "IT", "JP", "KR", "MX", "RU", "SA", "ZA", "TR", "GB", "US"] },
];

// 15 различимых цветов звёзд стран
export const WORLD_COLORS = ["#ffd27a", "#5ce1e6", "#ff9e6b", "#7ee08a", "#ff8ad8", "#8fb4ff", "#c9a4ff", "#ff6b6b", "#b8f26b", "#6bb8ff", "#ffb3c7", "#e6c84c", "#7af0d0", "#d19bff", "#ffffff"];

export const fmtGdp = (v: number) => (v >= 10000 ? `$${Math.round(v / 1000)} тыс.` : v >= 1000 ? `$${(v / 1000).toFixed(1).replace(".", ",")} тыс.` : `$${Math.round(v)}`);

export interface WorldRanking { year: number; rows: { code: string; v: number; rank: number }[] }

// Места по годам среди выбранных стран.
export function ranks(codes: string[]) {
  const list = codes.filter(c => WORLD[c]);
  const n = WORLD_Y1 - WORLD_Y0 + 1;
  const byYear: string[][] = [];
  for (let k = 0; k < n; k++) byYear.push([...list].sort((a, b) => WORLD[b].v[k] - WORLD[a].v[k]));
  return { list, byYear };
}

export function worldSpec(codes: string[], K: number, own?: string, ownColor?: string): RaceSpec | null {
  const { list, byYear } = ranks(codes);
  if (list.length < 2) return null;
  const slots = Math.min(K, list.length);
  const ever = list.filter(c => byYear.some(y => y.indexOf(c) < slots));
  // цвет закрепляется за страной по порядку первого появления в кадре
  const order = [...ever].sort((a, b) => firstIn(a) - firstIn(b) || byYear[firstIn(a)].indexOf(a) - byYear[firstIn(b)].indexOf(b));
  function firstIn(c: string) { return byYear.findIndex(y => y.indexOf(c) < slots); }
  let ci = 0;
  const racers: Racer[] = order.map(c => {
    const color = c === own && ownColor ? ownColor : WORLD_COLORS[ci++ % WORLD_COLORS.length];
    return {
      short: countryName(c), full: countryName(c), color, values: WORLD[c].v, events: [],
      lanes: byYear.map(y => { const r = y.indexOf(c); return r < slots ? r : null; }), value: fmtGdp,
    };
  });
  const vals = racers.flatMap(r => r.values.filter((_, k) => r.lanes![k] != null));
  const min = Math.max(150, Math.min(...vals) * 0.8), max = Math.max(...vals) * 1.15;
  const ticks = [300, 1000, 3000, 10000, 30000, 100000].filter(v => v >= min && v <= max).map(v => ({ v, label: fmtGdp(v) }));
  return {
    racers, startAge: WORLD_Y0, yearOfAge: y => y, formation: "ranks", slots, secPerYear: 2.4, title: `Гонка стран · ${WORLD_Y0}–${WORLD_Y1}`,
    axis: { kind: "log", min, max, ticks, labelOf: fmtGdp }, dropReason: "спад ВВП на душу",
    crises: [[1998, "1998 · Азиатский и российский кризис"], [2008, "2008 · Мировой финансовый кризис"], [2020, "2020 · Пандемия"]].map(([y, t]) => ({ age: y as number, text: t as string })),
  };
}

export { WORLD_Y0, WORLD_Y1, countryName };
