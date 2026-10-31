// «Где ты был(а) бы в любой стране мира»: твой доход на фоне дохода на человека в стране (Всемирный банк, PIP).
// Это другая база, чем в 6 подробных странах: там — среди работающих своего пола, здесь — среди всех жителей,
// включая детей и пенсионеров, поэтому место получается выше. Перевод: $ ППС 2017 в день → $ ППС 2025 в месяц.
import { PIP } from "./pip";
import { Phi } from "./calc";

export const CPI_2017_2025 = 1.31;   // индекс цен США CPI-U: 2025 (≈321,5, янв.–нояб.) / 2017 (245,12), BLS
const DAYS = 30.42;
const Z = [-1.2816, -0.8416, -0.5244, -0.2533, 0, 0.2533, 0.5244, 0.8416, 1.2816]; // децили в единицах нормального закона
export const toMonthly2025 = (perDay2017: number) => perDay2017 * DAYS * CPI_2017_2025;

// Процентиль дохода среди жителей страны: интерполяция между децилями в логарифмах, хвосты — по крайнему отрезку.
export function pipPct(iso: string, monthlyPpp2025: number): number | null {
  const c = PIP[iso]; if (!c) return null;
  const x = Math.log(Math.max(monthlyPpp2025, 1) / (DAYS * CPI_2017_2025)), L = c.d.map(Math.log);
  let z: number;
  if (x <= L[0]) z = Z[0] + ((x - L[0]) * (Z[1] - Z[0])) / (L[1] - L[0]);
  else if (x >= L[8]) z = Z[8] + ((x - L[8]) * (Z[8] - Z[7])) / (L[8] - L[7]);
  else { let k = 0; while (x > L[k + 1]) k++; z = Z[k] + ((x - L[k]) * (Z[k + 1] - Z[k])) / (L[k + 1] - L[k]); }
  return Math.min(99.5, Math.max(0.5, 100 * Phi(z)));
}

export const pipMedianMonthly = (iso: string) => (PIP[iso] ? toMonthly2025(PIP[iso].d[4]) : null);
export const PIP_CODES = Object.keys(PIP);
