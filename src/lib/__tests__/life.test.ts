import { describe, expect, it } from "vitest";
import { retireAge } from "../data";
import { eduFactors, familyEvents, medianLife } from "../life";
import { ranks, worldSpec } from "../worldRace";

describe("пенсионный возраст", () => {
  it("по законам 2026 года", () => {
    expect(retireAge("RU", "m", 1962)).toBe(64);
    expect(retireAge("RU", "m", 1990)).toBe(65);
    expect(retireAge("RU", "f", 1990)).toBe(60);
    expect(retireAge("KZ", "f", 1960)).toBe(61);
    expect(retireAge("KZ", "f", 1990)).toBe(63);
    expect(retireAge("KR", "m", 1963)).toBe(63);
    expect(retireAge("KR", "f", 1990)).toBe(65);
    expect(retireAge("US", "m", 1990)).toBe(67);
    expect(retireAge("UZ", "f", 1990)).toBe(55);
  });
});

describe("жизнь среднего человека", () => {
  it("выпускники выше общей медианы, остальные ниже", () => {
    const f = eduFactors("RU", "m");
    expect(f.grad).toBeGreaterThan(1); expect(f.rest).toBeLessThan(1);
  });
  it("после диплома путь «вуз» выше пути «работа»", () => {
    const m = medianLife("KZ", "m", 1992, 18, 40);
    expect(m.uni.values[0]).toBeLessThan(m.work.values[0]);
    expect(m.uni.values[30 - 18]).toBeGreaterThan(m.work.values[30 - 18]);
    expect(m.uni.events.some(e => e.type === "study")).toBe(true);
  });
  it("семья: свадьба, дети, взросление детей и пенсия по порядку", () => {
    const ev = familyEvents("KZ", "f", 1992, 18, 70);
    const types = ev.map(e => e.type);
    expect(types).toContain("wedding"); expect(types).toContain("child"); expect(types).toContain("kidout"); expect(types).toContain("retire");
    const w = ev.find(e => e.type === "wedding")!.age, c = ev.find(e => e.type === "child")!.age;
    expect(c).toBeGreaterThanOrEqual(w);
  });
});

describe("гонка стран", () => {
  it("в кадре не больше K мест, новички выбивают выбывших", () => {
    const sp = worldSpec(["RU", "KZ", "CN", "US", "KR", "TR", "UZ", "KG"], 5)!;
    expect(sp.slots).toBe(5);
    const n = sp.racers[0].lanes!.length;
    for (let k = 0; k < n; k++) expect(sp.racers.filter(r => r.lanes![k] != null).length).toBe(5);
    expect(ranks(["US", "KG"]).byYear[0][0]).toBe("US");
  });
});
