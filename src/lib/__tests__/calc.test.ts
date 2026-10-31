import { describe, expect, it } from "vitest";
import { computePath, countryMedianPpp, decodeStar, encodeStar, pct, sigmaOf, sexMedian, placeIn, peersAt, foreignMedianPath } from "../calc";
import { COUNTRIES, COUNTRY_ORDER, EXAMPLE } from "../data";

describe("расчёт уровней", () => {
  it("человек с медианной зарплатой своего пола — ровно 50-й процентиль", () => {
    for (const c of COUNTRY_ORDER) expect(pct(1, sigmaOf(COUNTRIES[c]))).toBeCloseTo(50, 5);
  });
  it("медиана мужчин выше медианы женщин, общая — между ними", () => {
    for (const code of COUNTRY_ORDER) {
      const c = COUNTRIES[code];
      expect(sexMedian(c, "m")).toBeGreaterThan(c.median);
      expect(sexMedian(c, "f")).toBeLessThan(c.median);
    }
  });
  it("пример: путь снизу вверх, длина = возраст − 17", () => {
    const r = computePath(EXAMPLE);
    expect(r.you.length).toBe(r.age - 17);
    expect(r.you[0]).toBeLessThan(40);
    expect(r.you[r.you.length - 1]).toBeGreaterThan(r.you[0]);
    expect(r.peers).toBeGreaterThanOrEqual(1);
    expect(r.peers).toBeLessThanOrEqual(99);
  });
  it("верхние 10% всегда выше медианы", () => {
    const r = computePath(EXAMPLE);
    r.top10.forEach((v, i) => expect(v).toBeGreaterThan(r.median[i]));
  });
  it("нулевой доход не ломает расчёт", () => {
    const r = computePath({ ...EXAMPLE, income: 0 });
    expect(r.you.every(v => Number.isFinite(v))).toBe(true);
  });
  it("ППС: медиана в долларах положительная и разумная (100–10 000 $)", () => {
    for (const c of COUNTRY_ORDER) {
      const v = countryMedianPpp(c, "m", 35);
      expect(v).toBeGreaterThan(100);
      expect(v).toBeLessThan(10000);
    }
  });
});

describe("версия 0.3", () => {
  it("быстрый режим: путь от выбранного возраста до сегодняшнего дня", () => {
    const q = { ...EXAMPLE, periods: [], events: [], startAge: 22, startKind: "0.5" };
    const r = computePath(q);
    expect(r.startAge).toBe(22);
    expect(r.you.length).toBe(r.age - 22 + 1);
    expect(r.you.every(Number.isFinite)).toBe(true);
  });
  it("тот же доход по ППС: в США место ниже, чем в Кыргызстане", () => {
    const usd = 3000;
    expect(placeIn("US", "m", usd).p).toBeLessThan(placeIn("KG", "m", usd).p);
  });
  it("медиана США по ППС = 50-й процентиль в США", () => {
    const m = COUNTRIES.US.median / Math.sqrt(COUNTRIES.US.femaleToMale);
    expect(placeIn("US", "m", m).p).toBeCloseTo(50, 0);
  });
  it("профессия-аналог находится всегда", () => {
    for (const c of COUNTRY_ORDER) expect(placeIn(c, "f", 1500).like).toBeTruthy();
  });
  it("ровесники: факты есть по всем странам", () => {
    for (const c of COUNTRY_ORDER) expect(peersAt(c, "m", 25).lines.length).toBeGreaterThan(1);
  });
  it("средний американец по меркам Кыргызстана выше медианы", () => {
    const v = foreignMedianPath("KG", "US", "m", 30, 30)[0];
    expect(v).toBeGreaterThan(50);
  });
});

describe("код звезды", () => {
  it("кодирует и раскодирует без потерь, без сумм дохода", () => {
    const r = computePath(EXAMPLE);
    const code = encodeStar(EXAMPLE, r);
    expect(code.startsWith("ЗВЕЗДА-")).toBe(true);
    const d = decodeStar(code)!;
    expect(d.n).toBe("Артём");
    expect(d.v.length).toBe(r.you.length);
    expect(JSON.stringify(d)).not.toContain(String(EXAMPLE.income));
  });
  it("мусор не принимается", () => {
    expect(decodeStar("привет")).toBeNull();
    expect(decodeStar("ЗВЕЗДА-AAAA")).toBeNull();
  });
});
