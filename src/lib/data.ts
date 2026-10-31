// Рождаемость (СКР) и охват высшим образованием — Всемирный банк, 2024–2025 (SP.DYN.TFRT.IN, SE.TER.ENRR); Корея СКР — KOSTAT 2025.
// Статистика стран. Каждая цифра — с источником и периодом. Проверено 29–30.10.2026.
// Правило проекта: цифру меняем только вместе с источником (см. CLAUDE.md).
import type { EventType } from "./engine";
import type { LifeInput } from "./calc";

export const NOW_YEAR = 2026;

export type CountryCode = "RU" | "KZ" | "KG" | "UZ" | "KR" | "US";

export interface WageMark { label: string; monthly: number; vac?: boolean }   // месячная зарплата, местная валюта; vac — по вакансиям, а не по статистике

export interface LifeStats {
  marriageM?: number; marriageF?: number;        // средний (или медианный) возраст первого брака
  firstBirthMother?: number;                     // средний возраст матери при первом ребёнке
  firstBirthFather?: number; firstBirthFatherExact?: boolean;
  tfr?: number;                                  // суммарный коэффициент рождаемости
  armyMonths?: number;                           // срочная служба для мужчин
  retireM?: number; retireF?: number;            // пенсионный возраст в 2026 году
  tertiary?: string;                             // высшее образование, одной фразой
  note?: string;
}

export interface CountryData {
  code: CountryCode;
  name: string;
  short: string;
  cur: string;
  median: number;          // медианная месячная зарплата, местная валюта
  meanToMedian: number;    // средняя / медиана — задаёт разброс зарплат
  sigma?: number;          // разброс напрямую (если известны децили)
  femaleToMale: number;    // зарплата женщин к мужской, доля
  ppp: number;             // ППС Всемирного банка, потребление (PA.NUS.PRVT.PP), 2025, местной валюты за 1 $
  period: string;
  estimated?: string;
  ageCurve?: [number, number][];
  wages: WageMark[];
  wagesNote: string;
  life?: LifeStats;
  crises: [number, string][];
  sources: { title: string; url: string }[];
}

const WB_PPP = { title: "ППС: Всемирный банк", url: "https://data.worldbank.org/indicator/PA.NUS.PRVT.PP" };

export const COUNTRIES: Record<CountryCode, CountryData> = {
  RU: {
    code: "RU", name: "Россия", short: "Россия", cur: "₽",
    median: 73900, meanToMedian: 99400 / 73900, femaleToMale: 61113 / 87757, ppp: 30.753,
    period: "апрель 2025",
    // Возраст: форма кривой — Башкортостанстат, октябрь 2021 (общероссийская таблица ещё не получена).
    ageCurve: [[19, 0.73], [22, 0.91], [27, 1.10], [32, 1.12], [37, 1.13], [42, 1.06], [47, 1.0], [52, 0.93], [57, 0.86], [62, 0.85], [67, 0.87]],
    wages: [
      { label: "уборщик", monthly: 43200, vac: true },
      { label: "продавец-кассир", monthly: 55100, vac: true },
      { label: "учитель", monthly: 63000 },
      { label: "повар", monthly: 69800, vac: true },
      { label: "медсестра", monthly: 71230 },
      { label: "бухгалтер", monthly: 73200, vac: true },
      { label: "таксист", monthly: 100400, vac: true },
      { label: "врач", monthly: 147000 },
      { label: "программист", monthly: 150000, vac: true },
      { label: "водитель", monthly: 158700, vac: true },
      { label: "сварщик", monthly: 163800, vac: true },
      { label: "автослесарь", monthly: 178170, vac: true },
      { label: "работник добычи (нефть, газ, руда)", monthly: 177725 },
      { label: "дальнобойщик", monthly: 230700, vac: true },
      { label: "сотрудник банка или страховой", monthly: 227354 },
    ],
    wagesNote: "Учитель — Росстат 2025; врач и медсестра — ФОМС 2025; банк и добыча — Росстат, апрель 2026; остальное — зарплаты в вакансиях hh.ru и Авито Работа 2025–2026",
    life: { marriageM: 25.4, marriageF: 23.2, firstBirthMother: 26, tfr: 1.42, armyMonths: 12, tertiary: "высшее образование получает около 60% молодёжи", note: "возраст брака и первого ребёнка — Росстат и Минтруд без точного года" },
    crises: [[2008, "2008 · Мировой финансовый кризис"], [2014, "2014 · Падение рубля"], [2020, "2020 · Пандемия"]],
    sources: [
      { title: "Медиана: Росстат", url: "https://incrussia.ru/news/rost-dohodov-rossiyan-mediannaya-zarplata-prevysila-73-tys-rub/" },
      { title: "Средняя: Росстат", url: "https://finance.mail.ru/article/srednyaya-zarplata-v-rossii-v-aprele-sostavila-pochti-100-tysyach-67258601/" },
      { title: "Мужчины и женщины: Росстат", url: "https://snob.ru/news/v-rf-zafiksirovali-odin-iz-krupneishikh-gendernykh-razryvov-v-zarplatakh-sredi-stran-g20/" },
      { title: "Возраст: Башкортостанстат, 2021", url: "https://02.rosstat.gov.ru/storage/mediabank/Srednyaya-nachislennaya-zarabotnaya-plata-rabotnikov-po-professional'nym-gruppam.pdf" },
      { title: "Отрасли: Росстат, апрель 2026", url: "https://finance.mail.ru/article/srednyaya-zarplata-v-rossii-432/" },
      { title: "Возраст брака: Росстат (ТАСС)", url: "https://snob.ru/news/v-rossii-uvelichilsya-srednij-vozrast-vstupleniya-v-pervyj-brak/" },
      { title: "Первый ребёнок: Минтруд", url: "https://expert.ru/news/v-mintrude-nazvali-sredniy-vozrast-zhenshchin-pri-rozhdenii-pervogo-rebenka" },
      { title: "Срок службы: 53-ФЗ", url: "https://www.consultant.ru/law/podborki/sroki_prizyva_v_armiyu/" },
      { title: "Профессии: hh.ru", url: "https://www.novostiitkanala.ru/news/detail.php?ID=193141" },
      { title: "Водители: Авито Работа", url: "https://auto.mail.ru/article/133186-zarplatnyie-predlozheniya-dlya-voditelej-vyirosli-na-52/" },
      { title: "Врачи и медсёстры: ФОМС", url: "https://medvestnik.ru/content/news/rosstat-opublikoval-dannye-o-zarplatah-v-zdravoohranenii-v-2025-godu.html" },
      WB_PPP,
    ],
  },
  KZ: {
    code: "KZ", name: "Казахстан", short: "Казахстан", cur: "₸",
    median: 317512, meanToMedian: 473158 / 339912, femaleToMale: 0.718, ppp: 190.877,
    period: "апрель 2025",
    ageCurve: [[20, 0.68], [29.5, 0.96], [39.5, 1.11], [49.5, 1.05], [59.5, 0.92], [70, 0.82]],
    wages: [
      { label: "охранник", monthly: 174200 },
      { label: "повар", monthly: 192600 },
      { label: "уборщик", monthly: 193300 },
      { label: "продавец", monthly: 262443 },
      { label: "медсестра", monthly: 264600 },
      { label: "кассир", monthly: 271096 },
      { label: "техник", monthly: 314700 },
      { label: "водитель", monthly: 328100 },
      { label: "бухгалтер", monthly: 398600 },
      { label: "учитель", monthly: 415042 },
      { label: "врач", monthly: 491400 },
      { label: "инженер", monthly: 702000 },
      { label: "руководитель организации", monthly: 1101100 },
    ],
    wagesNote: "Средняя зарплата по профессиям, БНС, 2025–2026",
    life: { marriageM: 27.9, marriageF: 25.3, tfr: 2.98, armyMonths: 12, tertiary: "высшее образование получает около 53% молодёжи" },
    crises: [[2008, "2008 · Мировой финансовый кризис"], [2015, "2015 · Девальвация тенге"], [2020, "2020 · Пандемия"]],
    sources: [
      { title: "Медиана: БНС", url: "https://bes.media/amp/mediannaya-zarplata-v-2025-godu-sostavila-317-tisyach-tenge-statdannie/" },
      { title: "Средняя и медиана IV кв.: БНС", url: "https://kapital.kz/economic/146548/mediannaya-zarplata-za-iv-kvartal-2025-goda-sostavila-339-912-tenge.html" },
      { title: "Мужчины и женщины: БНС", url: "https://kapital.kz/economic/149864/zarplaty-zhenshin-v-kazahstane-pochti-na-tret-menshe-chem-u-muzhchin.html" },
      { title: "Возраст: БНС, апрель 2025", url: "https://stat.gov.kz/api/iblock/element/458522/file/en/" },
      { title: "Профессии: БНС, апрель 2026", url: "https://24.kz/ru/news/economyc/799237-skolko-zarabatyvayut-vrachi-inzhenery-bukhgaltery-i-voditeli-v-kazakhstane" },
      { title: "Образование: БНС", url: "https://www.nur.kz/nurfin/economy/2444307-skolko-zarabatyvayut-uchitelya-v-kazahstane/" },
      { title: "Возраст брака: БНС", url: "https://bes.media/news/nazvan-sredniy-vozrast-vstupleniya-v-brak-v-kazahstane/" },
      { title: "Учитель, кассир, продавец: БНС", url: "https://mgorod.kz/news/v-kazahstane-raskryli-zarplaty-po-professiyam-kto-poluchaet-million-a-kto-menshe-200-tysyach-tenge" },
      WB_PPP,
    ],
  },
  KG: {
    code: "KG", name: "Кыргызстан", short: "Кыргызстан", cur: "сом",
    // Медиана не публикуется: средняя 44 419 сом (2025, без малых предприятий),
    // разброс оценён по коэффициенту Джини 0,431 (2025): σ = √2·Φ⁻¹((1+G)/2) ≈ 0,806 → средняя/медиана ≈ 1,384.
    median: Math.round(44419 / 1.384), meanToMedian: 1.384, femaleToMale: 0.657, ppp: 29.322,
    period: "2025",
    estimated: "медиана рассчитана из средней и коэффициента Джини",
    wages: [
      { label: "повар", monthly: 40000, vac: true },
      { label: "водитель", monthly: 45056, vac: true },
      { label: "учитель", monthly: 49302 },
      { label: "врач", monthly: 53000 },
      { label: "строитель", monthly: 55241 },
      { label: "продавец-консультант", monthly: 58375, vac: true },
      { label: "работник завода", monthly: 64195 },
      { label: "госслужащий", monthly: 64805 },
      { label: "бухгалтер", monthly: 65011, vac: true },
      { label: "работник добычи", monthly: 72714 },
      { label: "специалист ИТ и связи", monthly: 78566 },
      { label: "менеджер по продажам", monthly: 82482, vac: true },
      { label: "сотрудник банка или страховой", monthly: 88340 },
      { label: "руководитель", monthly: 100000, vac: true },
    ],
    wagesNote: "Учитель и врач — Нацстатком 2026 (по отраслям); строитель, завод, госслужба, добыча, ИТ, банк — Нацстатком 2025; остальное — вакансии headhunter.kg 2025–2026",
    life: { marriageM: 27.6, marriageF: 24, firstBirthMother: 22.6, tfr: 2.6, armyMonths: 12, tertiary: "высшее образование получает около 54% молодёжи", note: "возраст матери при первом ребёнке — UNECE, 2019" },
    crises: [[2008, "2008 · Мировой финансовый кризис"], [2020, "2020 · Пандемия"]],
    sources: [
      { title: "Средняя: Нацстатком", url: "https://kaktus.media/doc/540761_nazvan_razmer_srednemesiachnoy_zarplaty_v_kyrgyzstane_po_itogam_2025_goda.html" },
      { title: "Джини: Нацстатком", url: "https://economist.kg/ekonomika/2026/08/07/chto-takoe-koeffitsient-dzhini-i-pochemu-ego-rost-trevozhnyi-signal-dlia-kyrgyzstana/" },
      { title: "Мужчины и женщины: Нацстатком", url: "https://kaktus.media/doc/542001_dannye_nacstatkoma:_jenshiny_v_kyrgyzstane_jivyt_dolshe_myjchin_primerno_na_deviat_let.html" },
      { title: "Отрасли: Нацстатком", url: "https://economist.kg/ekonomika/2026/04/10/ot-25-do-88-tysiach-somov-kak-za-god-izmenilis-zarplaty-v-raznykh-otrasliakh-kyrgyzstana/" },
      { title: "Возраст брака: Нацстатком", url: "https://economist.kg/society/2026/02/23/gdie-rabotaiut-koghda-zhieniatsia-i-chiem-ruliat-muzhchiny-kr-obzor-natsstatkoma/" },
      { title: "Первый ребёнок: UNECE", url: "https://w3.unece.org/PXWeb/en/Table?IndicatorCode=34" },
      { title: "Вакансии: headhunter.kg", url: "https://banks.kg/news/employer-demand-kyrgyzstan-top-professions-salaries" },
      { title: "Учитель и врач: Нацстатком", url: "https://vesti.kg/zxc/item/151574-zarplaty-v-kr-vyrosli-vrach-poluchaet-v-srednem-53-tysyachi-somov-uchitel-49-tysyach-somov.html" },
      WB_PPP,
    ],
  },
  UZ: {
    code: "UZ", name: "Узбекистан", short: "Узбекистан", cur: "сум",
    // Экспериментальная медиана Нацкомстата (январь–август 2026) и средняя (январь–сентябрь 2026), без малого бизнеса.
    median: 4166300, meanToMedian: 7274.1 / 4166.3, femaleToMale: 0.66, ppp: 3573.27,
    period: "январь–сентябрь 2026, без малого бизнеса",
    estimated: "разрыв зарплат по полу — оценка Всемирного банка",
    wages: [
      { label: "работник здравоохранения", monthly: 3267000 },
      { label: "строитель", monthly: 3942800 },
      { label: "уборщик", monthly: 4675557, vac: true },
      { label: "учитель", monthly: 4790000 },
      { label: "охранник", monthly: 4864445, vac: true },
      { label: "повар", monthly: 5199085, vac: true },
      { label: "рабочий, сварщик", monthly: 5467880, vac: true },
      { label: "водитель, курьер", monthly: 5504942, vac: true },
      { label: "продавец", monthly: 6148219, vac: true },
      { label: "автомеханик", monthly: 8525602, vac: true },
      { label: "бухгалтер", monthly: 9797530, vac: true },
      { label: "менеджер по продажам", monthly: 10563025, vac: true },
      { label: "сотрудник банка или страховой", monthly: 11363900 },
      { label: "руководитель", monthly: 12343750, vac: true },
    ],
    wagesNote: "Учитель, здравоохранение, строительство, финансы — Нацкомстат 2026; остальное — медианы вакансий hh.uz 2026",
    life: { marriageM: 25.6, marriageF: 21.4, firstBirthMother: 23.5, tfr: 3.49, armyMonths: 12, tertiary: "высшее образование получает около 60% молодёжи", note: "возраст матери при первом ребёнке — UNECE, 2021" },
    crises: [[2008, "2008 · Мировой финансовый кризис"], [2017, "2017 · Либерализация курса сума"], [2020, "2020 · Пандемия"]],
    sources: [
      { title: "Медиана и отрасли: Нацкомстат", url: "https://stat.uz/img/press-relizlar/ish_haqi_ru_mediana_bilan_p52342.pdf" },
      { title: "Мужчины и женщины: Всемирный банк", url: "https://gazeta.uz/en/2024/06/19/women" },
      { title: "Возраст брака: Нацкомстат", url: "https://podrobno.uz/cat/obchestvo/stalo-izvestno-v-kakom-vozraste-uzbekistantsy-predpochitayut-sozdavat-semi/" },
      { title: "Первый ребёнок: UNECE", url: "https://w3.unece.org/PXWeb/en/Table?IndicatorCode=34" },
      { title: "Профессии: hh.uz", url: "https://hh.uz/article/34387" },
      { title: "Учитель: Нацкомстат", url: "https://www.gazeta.uz/ru/2026/10/27/median-income/" },
      WB_PPP,
    ],
  },
  KR: {
    code: "KR", name: "Южная Корея", short: "Корея", cur: "₩",
    median: 2880000, meanToMedian: 3750000 / 2880000, femaleToMale: 2890000 / 4420000, ppp: 880.125,
    period: "декабрь 2024, по рабочим местам",
    // Возраст: KOSTAT 2024, средний доход по возрастным группам к общей средней (3,75 млн).
    ageCurve: [[19, 0.253], [25, 0.723], [35, 1.059], [45, 1.251], [55, 1.187], [65, 0.781], [75, 0.44]],
    wages: [
      { label: "работник кафе, ресторана, гостиницы", monthly: 1880000 },
      { label: "работа на минимальной зарплате", monthly: 2156880 },
      { label: "полицейский (оклад, 10-й год)", monthly: 2680900 },
      { label: "сотрудник малой или средней компании", monthly: 3070000 },
      { label: "медсестра", monthly: 4329000 },
      { label: "сотрудник крупной компании (чеболь)", monthly: 6130000 },
      { label: "сотрудник банка или страховой", monthly: 7770000 },
      { label: "врач", monthly: 23765000 },
    ],
    wagesNote: "Сферы — KOSTAT 2024; медсестра и врач — Минздрав 2023; минимальная зарплата и оклад полицейского — 2026",
    life: { marriageM: 33.9, marriageF: 31.6, firstBirthMother: 33.2, firstBirthFather: 35.4, firstBirthFatherExact: true, tfr: 0.8, armyMonths: 18, tertiary: "71% людей 25–34 лет — с высшим образованием" },
    crises: [[2008, "2008 · Мировой финансовый кризис"], [2020, "2020 · Пандемия"]],
    sources: [
      { title: "Медиана, средняя, возраст, сферы: KOSTAT", url: "https://www.newsis.com/view/NISX20260223_0003523081" },
      { title: "Врачи и медсёстры: Минздрав Кореи", url: "https://www.heraldk.com/article/2026092822213461693" },
      { title: "Возраст брака: KOSTAT", url: "https://www.mt.co.kr/economy/2026/03/20/2026031915130297984" },
      { title: "Первый ребёнок: KOSTAT", url: "https://www.koreaherald.com/article/10885651" },
      { title: "Рождаемость 2025: KOSTAT", url: "https://www.fnnews.com/news/202608261202208775" },
      { title: "Срок службы: Минобороны", url: "https://mnd.go.kr/mnd_book/DefenseWhitePaper/2020/2020_eng_all/files/basic-html/page152.html" },
      { title: "Оклад полиции 2026", url: "https://exam.studygov.kr/wiki/police-salary/" },
      WB_PPP,
    ],
  },
  US: {
    code: "US", name: "США", short: "США", cur: "$",
    // BLS CPS, 3-й кв. 2026, полная занятость: медиана $1 232/нед.; разброс — из P90/P50 = 2 919 / 1 232.
    median: Math.round((1232 * 52) / 12), meanToMedian: 1, sigma: Math.log(2919 / 1232) / 1.2816, femaleToMale: 1127 / 1352, ppp: 1,
    period: "3-й кв. 2026, только полная занятость",
    wages: [
      { label: "официант, работник общепита", monthly: 2643 },
      { label: "кассир", monthly: 2740 },
      { label: "продавец в магазине", monthly: 2952 },
      { label: "автомойщик", monthly: 2986 },
      { label: "повар", monthly: 3053 },
      { label: "уборщик", monthly: 3070 },
      { label: "охранник", monthly: 3168 },
      { label: "таксист", monthly: 3508 },
      { label: "курьер на фургоне", monthly: 3738 },
      { label: "строитель-разнорабочий", monthly: 3927 },
      { label: "автомеханик", monthly: 4218 },
      { label: "сварщик", monthly: 4479 },
      { label: "дальнобойщик", monthly: 4887 },
      { label: "учитель начальных классов", monthly: 5331 },
      { label: "полицейский", monthly: 6351 },
      { label: "бухгалтер", monthly: 6973 },
      { label: "медсестра", monthly: 8129 },
      { label: "менеджер, руководитель отдела", monthly: 8814 },
      { label: "программист", monthly: 11332 },
      { label: "генеральный директор", monthly: 17833 },
      { label: "семейный врач", monthly: 20348 },
    ],
    wagesNote: "Медианная зарплата по профессиям, май 2025, BLS",
    life: { marriageM: 30.8, marriageF: 28.4, firstBirthMother: 27.6, tfr: 1.63, armyMonths: 0, tertiary: "51% людей 25–34 лет — с дипломом после школы" },
    crises: [[2008, "2008 · Мировой финансовый кризис"], [2020, "2020 · Пандемия"]],
    sources: [
      { title: "Медиана и децили: BLS", url: "https://www.bls.gov/news.release/wkyeng.t05.htm" },
      { title: "Профессии: BLS OEWS, май 2025", url: "https://www.bls.gov/ooh/" },
      { title: "Возраст брака: Census", url: "https://www.census.gov/newsroom/press-releases/2025/families-and-living-arrangements.html" },
      { title: "Первый ребёнок: NCHS (BGSU)", url: "https://www.bgsu.edu/ncfmr/resources/data/family-profiles/mean-age-mother-first-birth-fp-26-12.html" },
      { title: "Полиция, такси, автомеханики: BLS", url: "https://www.bls.gov/ooh/protective-service/police-and-detectives.htm" },
      WB_PPP,
    ],
  },
};

export const COUNTRY_ORDER: CountryCode[] = ["RU", "KZ", "KG", "UZ", "KR", "US"];

export const DEFAULT_AGE_CURVE: [number, number][] = [
  [18, 0.45], [20, 0.55], [22, 0.7], [25, 0.88], [30, 1], [35, 1.07], [40, 1.08], [45, 1.05], [50, 1], [55, 0.95], [60, 0.9], [75, 0.8],
];
export const AGE_SOURCE_NOTE = "Казахстан — БНС, апрель 2025; Корея — KOSTAT, 2024; Россия — форма кривой по Башкортостанстату, октябрь 2021; Кыргызстан, Узбекистан, США — ≈ модель (в 18 лет около 45% от медианы, пик 105–108% в 35–45 лет). Отношение по средней зарплате применяем к медиане — это допущение.";

export const LEVELS = [
  { from: 0, name: "Старт", phrase: "Твой путь только набирает высоту. Каждый шаг отсюда — уже рост." },
  { from: 20, name: "Разгон", phrase: "Ты в пути. Ещё немного усилий — и откроется новая орбита." },
  { from: 40, name: "Орбита", phrase: "Ты уверенно держишься рядом с большинством своей страны. Отличная база для рывка." },
  { from: 60, name: "Созвездие", phrase: "Ты выше середины своей страны. Твой путь вдохновляет." },
  { from: 80, name: "Яркая звезда", phrase: "Ты среди самых заметных звёзд своей страны." },
  { from: 95, name: "Сверхновая", phrase: "Твоя звезда светит для многих. Немногие проходят такой путь." },
];

export const EVENT_LABELS: Record<EventType, string> = {
  wedding: "Свадьба", child: "Рождение ребёнка", promo: "Повышение, рост дохода", biz: "Своё дело",
  move: "Переезд", jobloss: "Потеря работы", hard: "Трудный год, болезнь", study: "Диплом", retire: "Пенсия",
  divorce: "Развод — новая глава", kidout: "Ребёнок начал свой путь", split: "Развилка: вуз или работа",
};

// ---------- высшее образование ----------
// premium — во сколько раз заработок с высшим выше, чем со школой/колледжем; shareM/shareF — доля поступающих в вуз.
export interface EduStats { premium: number; shareM: number; shareF: number; divorce: number; note: string }
// Доля поступающих — валовой охват вузами (World Bank SE.TER.ENRR, ЮНЕСКО), не выше 75%; Корея — 71% людей 25–34 лет с высшим.
// divorce — разводов на 100 браков того же года (не доля распавшихся браков).
export const EDU: Record<CountryCode, EduStats> = {
  RU: { premium: 1.4, shareM: 0.58, shareF: 0.63, divorce: 73, note: "премия ≈ 1,4: Башкортостанстат, форма 57-Т, октябрь 2023 (высшее к школе); ВШЭ — +20% к колледжу" },
  KZ: { premium: 1.68, shareM: 0.48, shareF: 0.58, divorce: 39, note: "премия: БНС, апрель 2026, средняя зарплата с высшим к среднему" },
  KG: { premium: 1.5, shareM: 0.45, shareF: 0.63, divorce: 30, note: "≈ премия: числа нет, взята средняя соседей (РФ 1,4 и РК 1,7)" },
  UZ: { premium: 1.5, shareM: 0.55, shareF: 0.65, divorce: 16, note: "≈ премия: числа нет, взята средняя соседей; разводы — оценка по полугодию и судам" },
  KR: { premium: 1.31, shareM: 0.7, shareF: 0.7, divorce: 37, note: "премия: OECD Education at a Glance, 2023, полная занятость 25–64" },
  US: { premium: 1.71, shareM: 0.65, shareF: 0.75, divorce: 31, note: "премия: OECD Education at a Glance, 2023; разводы NCHS без 5 штатов" },
};
export const EDU_SOURCES: { title: string; url: string }[] = [
  { title: "OECD EAG (Корея, США)", url: "https://db.nomics.world/OECD/DSD_EAG_LSO_EA@DF_LSO_EARN_REL_BEL" },
  { title: "БНС: зарплата по образованию", url: "https://rus.azattyq-ruhy.kz/finansy/118197-kak-zarplaty-v-kazakhstane-zavisiat-ot-obrazovaniia-vozrasta-i-mesta-raboty" },
  { title: "Башкортостанстат 57-Т", url: "https://02.rosstat.gov.ru/storage/mediabank/publ_57t_2023.pdf" },
  { title: "ВШЭ: отдача от вуза", url: "https://www.hse.ru/news/science/937356173.html" },
  { title: "Охват вузами: Всемирный банк", url: "https://data.worldbank.org/indicator/SE.TER.ENRR" },
  { title: "Разводы РК: БНС", url: "https://www.gov.kz/memleket/entities/stat/press/news/details/1183189?lang=ru" },
  { title: "Разводы США: NCHS", url: "https://www.cdc.gov/nchs/data/dvs/marriage-divorce/national-marriage-divorce-rates-00-24.pdf" },
  { title: "Разводы РФ: Т—Ж по Росстату", url: "https://t-j.ru/stat-divorce/" },
];

// ---------- пенсионный возраст (проверено 30.10.2026) ----------
// RU — 400-ФЗ (прил. 6): 2026 — 64/59, с 2028 — 65/60 (1963/1968 г. р. и моложе). consultant.ru
// KZ — gov.kz: мужчины 63; женщины 61 до 2027, затем +0,5 в год до 63 к 2031.
// KG — Соцфонд (economist.kg, 28.01.2026): 63/58. UZ — gov.uz: 60/55 (повышение — пока только проект).
// KR — 국민연금: 60 до 1952 г. р., +1 год на каждые 4 года рождения, 65 для 1969 г. р. и моложе.
// US — SSA, полный возраст: 66 для 1943–54, +2 мес. в год, 67 для 1960 г. р. и моложе.
export const RETIRE_SOURCES = [
  { title: "Россия: 400-ФЗ, прил. 6", url: "https://www.consultant.ru/document/cons_doc_LAW_156525/cf910e14d4aaa0a72a80966dfc1ca31d7a7ce4d9/" },
  { title: "Казахстан: gov.kz", url: "https://www.gov.kz/situations/5/25?lang=ru" },
  { title: "Кыргызстан: Соцфонд", url: "https://economist.kg/society/2026/01/28/minimalnyi-trudovoi-stazh-dlia-piensii-v-kr-vyros-do-6-liet/" },
  { title: "Узбекистан: gov.uz", url: "https://gov.uz/en/advice/NaN/document/205" },
  { title: "Корея: возраст 국민연금", url: "https://glasswallet.com/calculate/national-pension/receiving-age" },
  { title: "США: SSA", url: "https://www.ssa.gov/benefits/retirement/planner/ageincrease.html" },
];
export function retireAge(code: CountryCode, sex: "m" | "f", birth: number): number {
  switch (code) {
    case "RU": return sex === "m" ? (birth >= 1963 ? 65 : birth >= 1962 ? 64 : 63) : (birth >= 1968 ? 60 : birth >= 1967 ? 59 : 58);
    case "KZ": { if (sex === "m") return 63; const y = birth + 61; return y <= 2027 ? 61 : Math.min(63, 61 + 0.5 * (y - 2027)); }
    case "KG": return sex === "m" ? 63 : 58;
    case "UZ": return sex === "m" ? 60 : 55;
    case "KR": return birth <= 1952 ? 60 : Math.min(65, 61 + Math.floor((birth - 1953) / 4));
    case "US": return birth <= 1954 ? 66 : birth >= 1960 ? 67 : 66 + ((birth - 1954) * 2) / 12;
  }
}

export const STATUS_OPTIONS: [string, string][] = [["study", "Учёба"], ["work", "Работа"], ["biz", "Своё дело"], ["none", "Без работы"]];
export const INCOME_OPTIONS: [string, string][] = [
  ["", "—"], ["0.3", "намного ниже типичной"], ["0.6", "ниже типичной"], ["1", "как у большинства"],
  ["1.5", "в 1,5 раза выше"], ["2.5", "в 2,5 раза выше"], ["5", "в 5 раз выше"], ["10", "в 10+ раз выше"],
];
export const START_KINDS: [string, string][] = [
  ["study", "Учёба"], ["0.5", "Работа с самых низов"], ["1", "Обычная работа, как у сверстников"], ["2", "Сразу высокий доход"],
];

export const EXAMPLE: LifeInput = {
  name: "Артём", sex: "m", birth: 1992, country: "KZ", income: 1200000, startAge: 18, startKind: "study",
  marriedAt: 26, kidsAt: [29], color: "#b47cff", style: "radiant", compare: ["US", "KR"],
  periods: [
    { from: 18, to: 21, status: "study", inc: "" }, { from: 22, to: 24, status: "work", inc: "0.6" },
    { from: 25, to: 26, status: "work", inc: "1" }, { from: 27, to: 30, status: "biz", inc: "1.5" },
    { from: 31, to: 34, status: "biz", inc: "2.5" },
  ],
  events: [{ age: 22, type: "study" }, { age: 24, type: "jobloss" }, { age: 27, type: "biz" }, { age: 32, type: "promo" }],
};
