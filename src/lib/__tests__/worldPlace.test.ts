import { describe, expect, it } from "vitest";
import { pipMedianMonthly, pipPct } from "../worldPlace";

describe("место в любой стране", () => {
  it("медиана страны — это 50-й процентиль", () => {
    expect(pipPct("DE", pipMedianMonthly("DE")!)).toBeCloseTo(50, 0);
  });
  it("тот же доход выше в бедной стране, чем в богатой", () => {
    expect(pipPct("IN", 1500)!).toBeGreaterThan(pipPct("US", 1500)!);
  });
  it("нет данных — null", () => { expect(pipPct("ZZ", 1000)).toBeNull(); });
});
