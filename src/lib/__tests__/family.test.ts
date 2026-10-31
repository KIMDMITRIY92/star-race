import { describe, expect, it } from "vitest";
import { alignByYear, eventsByYear, inviteLink, readInvite } from "../family";
import type { StarCode } from "../calc";

const mom: StarCode = { n: "Мама", b: 1965, c: "KZ", s: "f", a: 18, v: Array.from({ length: 62 }, (_, i) => 20 + i), e: [[25, "wedding"], [27, "child"]] };

describe("семья", () => {
  it("родитель идёт по календарным годам героя", () => {
    // герой 1992 г. р., старт в 18 → 2010 год; маме в 2010-м 45 лет → индекс 45−18 = 27
    const al = alignByYear(mom, 1992, 18, 10);
    expect(al.start).toBe(0);
    expect(al.values[0]).toBe(20 + 27);
  });
  it("младший родственник начинает путь позже — с отделением", () => {
    const kid: StarCode = { ...mom, n: "Сын", b: 2000, v: [30, 35, 40] };
    const al = alignByYear(kid, 1992, 18, 12);
    expect(al.start).toBe(8); // 2018 год — сыну 18
  });
  it("события переводятся в возраст героя", () => {
    const ev = eventsByYear(mom, 1992, -50, 80);
    expect(ev[0].age).toBe(25 - 27);
  });
  it("ссылка-приглашение читается обратно", () => {
    const link = inviteLink("https://x.ru/game#old", "ЗВЕЗДА-abc_1");
    expect(link.startsWith("https://x.ru/game#star=")).toBe(true);
    expect(readInvite(link.slice(link.indexOf("#")))).toBe("ЗВЕЗДА-abc_1");
  });
});

import { leaveOf, manualMember } from "../family";
describe("уход из гонки", () => {
  it("родной — созвездие-память в свой календарный год", () => {
    const m = manualMember("Бабушка", 1940, "relative", "KZ", "f", 2015);
    const u = leaveOf(m, 1992, 18)!;
    expect(u.kind).toBe("memory"); expect(u.t).toBe(2015 - 2010);
    expect(m.v.length).toBe(2015 - 1940 - 18 + 1);
  });
  it("друг — пути разошлись, по его возрасту", () => {
    const u = leaveOf({ n: "Саша", b: 1990, c: "KZ", s: "m", a: 18, v: [50], e: [], r: "friend", gone: 2020 }, 1992, 18)!;
    expect(u.kind).toBe("apart"); expect(u.t).toBe(2020 - 1990 - 18);
  });
});
