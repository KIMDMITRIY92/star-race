"use client";
// «Звёздная гонка»: быстрый старт → 3D-гонка. Вся информация — прямо на экране сцены (табло, рейтинг стран, события, итог).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RaceEngine, type Racer, type RaceSpec, type EventType, type StarStyle } from "@/lib/engine";
import {
  COUNTRIES, COUNTRY_ORDER, type CountryCode, LEVELS, NOW_YEAR, EVENT_LABELS, INCOME_OPTIONS, STATUS_OPTIONS, EXAMPLE, AGE_SOURCE_NOTE, START_KINDS,
} from "@/lib/data";
import {
  ageProfile, allEvents, computePath, decodeStar, encodeStar, eventNote, foreignMedianPath, levelIndex, pct, peersAt, placeEverywhere, placeIn, plural, sigmaOf, years,
  type LifeInput, type PathResult, type StarCode,
} from "@/lib/calc";
import { RETIRE_SOURCES, EDU_SOURCES, retireAge } from "@/lib/data";
import { childPath, medianLife } from "@/lib/life";
import { PRESETS, WORLD_CODES, WORLD_Y0, WORLD_Y1, countryName, fmtGdp, ranks, worldSpec } from "@/lib/worldRace";
import { WORLD } from "@/lib/world";
import { Music, type Sfx } from "@/lib/audio";
import { REL_LABELS, alignByYear, eventsByYear, inviteLink, leaveOf, manualMember, readInvite, relName, type Member, type Rel } from "@/lib/family";
import { createShort, initTelegram, isTelegram, resolveShort, shareLink, shortUrl } from "@/lib/links";
import { ClipRecorder, pickFormat, type Overlay } from "@/lib/recorder";

const STAR_COLORS: [string, string][] = [["#ffcf5c", "Золото"], ["#b47cff", "Аметист"], ["#ff5c7a", "Рубин"], ["#3ef0a8", "Изумруд"], ["#5cc8ff", "Лазурь"], ["#ff8ad8", "Роза"]];
const STYLES: [StarStyle, string][] = [["classic", "Классика"], ["radiant", "Сияние"], ["comet", "Комета"]];
const TOP = "#eef0ff";
const FRIEND_COLORS = ["#6ee7c8", "#ff9ec7", "#8be0ff", "#ffa96b", "#c9ff8a", "#ffd6a0", "#a0b4ff", "#ff7ab0", "#7affea", "#e0a0ff"];
const UNI = "#9cc2ff", WORK = "#7fd6c2", KID = "#fff1b8";
const MAX_STARS = 15;
const ISO: Record<CountryCode, string> = { RU: "RU", KZ: "KZ", KG: "KG", UZ: "UZ", KR: "KR", US: "US" };
const COUNTRY_COLORS: Record<CountryCode, string> = { RU: "#8fb4ff", KZ: "#5ce1e6", KG: "#ff9e6b", UZ: "#7ee08a", KR: "#ff8ad8", US: "#ffd27a" };
const ALT = ["#ffd27a", "#5ce1e6", "#ff9e6b", "#7ee08a", "#ff8ad8", "#8fb4ff", "#c9a4ff"];
const STORE = "starRace.v3";
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

// Цвет другой звезды не должен сливаться с цветом своей: при близком оттенке берём запасной.
const hue = (hex: string) => { const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
const far = (a: string, b: string) => { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d) > 35; };
const distinct = (c: string, hero: string, used: string[]) => (far(c, hero) && !used.includes(c) ? c : ALT.find(x => far(x, hero) && !used.includes(x)) ?? c);

type Screen = "start" | "race";
type Mode = "me" | "world";
type Feed = { id: number; text: string; color: string };

// Плавная перестановка строк таблицы (FLIP): строка «переезжает» на новое место, а не прыгает.
function useFlip(ref: React.RefObject<HTMLElement | null>) {
  const prev = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const next = new Map<string, number>();
    el.querySelectorAll<HTMLElement>("[data-k]").forEach(n => {
      const k = n.dataset.k!, top = n.offsetTop, was = prev.current.get(k);
      next.set(k, top);
      if (was !== undefined && Math.abs(was - top) > 1) {
        n.animate([{ transform: `translateY(${was - top}px)` }, { transform: "none" }], { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" });
        if (was > top) n.animate([{ background: "rgba(255,230,140,0.22)" }, { background: "transparent" }], { duration: 1400 });
      } else if (was === undefined && prev.current.size) n.animate([{ opacity: 0, transform: "translateX(24px)" }, { opacity: 1, transform: "none" }], { duration: 600, easing: "ease-out" });
    });
    prev.current = next;
  });
}
type Tab = "result" | "world" | "peers" | "card";

function validate(s: LifeInput): string {
  const age = NOW_YEAR - s.birth;
  if (!s.birth || age < 19 || age > 80) return "Укажи возраст: от 19 до 80 лет.";
  if (!(s.income >= 0) || !Number.isFinite(s.income)) return "Укажи доход в месяц числом (можно 0).";
  if (s.startAge < 16 || s.startAge >= age) return "Возраст начала пути должен быть меньше твоего возраста.";
  if (s.marriedAt !== null && (s.marriedAt < 16 || s.marriedAt > age)) return `Возраст свадьбы — от 16 до ${age}.`;
  for (const k of s.kidsAt) if (!k || k < 16 || k > age) return `Укажи, во сколько лет у тебя родился каждый ребёнок (от 16 до ${age}).`;
  for (const p of s.periods) if (!p.from || !p.to || p.from < 16 || p.to < p.from || p.to > age) return `Проверь период: возраст от 16 до ${age}, «до» не меньше «с».`;
  for (const e of s.events) if (!e.age || e.age < 16 || e.age > age) return `Проверь события: возраст от 16 до ${age}.`;
  return "";
}

function loadSaved(): { input: LifeInput | null; friends: Member[] } {
  try {
    const d = JSON.parse(localStorage.getItem(STORE) || "null");
    const ok = d?.input && COUNTRIES[d.input.country as CountryCode] && !validate(d.input);
    return { input: ok ? d.input : null, friends: Array.isArray(d?.friends) ? d.friends : [] };
  } catch { return { input: null, friends: [] }; }
}

const fmtMoney = (v: number, cur: string) => `${Math.round(v).toLocaleString("ru-RU")} ${cur}`;

const easeV = (x: number) => x * x * (3 - 2 * x);
const valueNow = (v: number[], t: number) => { const n = v.length - 1; if (t >= n) return v[n]; const i = Math.max(0, Math.floor(t)), f = t - i; return v[i] + (v[i + 1] - v[i]) * easeV(f); };
const axisK = (spec: RaceSpec, v: number) => {
  const a = spec.axis;
  const k = a.kind === "log" ? (Math.log(Math.max(v, a.min)) - Math.log(a.min)) / (Math.log(a.max) - Math.log(a.min)) : (v - a.min) / (a.max - a.min);
  return Math.min(1, Math.max(0, k));
};

const BLANK: LifeInput = {
  name: "", sex: "m", birth: NOW_YEAR - 30, country: "KZ", income: 0, startAge: 18, startKind: "study",
  marriedAt: null, kidsAt: [], color: STAR_COLORS[0][0], style: "classic", compare: ["US"], periods: [], events: [],
};

export default function StarRace() {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RaceEngine | null>(null);
  const [saved] = useState(loadSaved);
  const [screen, setScreen] = useState<Screen>(saved.input ? "race" : "start");
  const [input, setInput] = useState<LifeInput>(saved.input ?? EXAMPLE);
  const [draft, setDraft] = useState<LifeInput>(saved.input ?? BLANK);
  const [friends, setFriends] = useState<Member[]>(saved.friends);
  const [rel, setRel] = useState<Rel>("friend");
  const [invite, setInvite] = useState<StarCode | null>(() => { try { const c = readInvite(location.hash); return c ? decodeStar(c) : null; } catch { return null; } });
  const [inviteRel, setInviteRel] = useState<Rel>("friend");
  const [linkCopied, setLinkCopied] = useState<string>("");
  const [clipLen, setClipLen] = useState(30);
  const [man, setMan] = useState({ name: "", birth: 1965, rel: "parent" as Rel, gone: "" });
  const [rec, setRec] = useState<"off" | "prep" | "on" | "done">("off");
  const [clip, setClip] = useState<{ url: string; ext: string; blob: Blob } | null>(null);
  const recRef = useRef<ClipRecorder | null>(null);
  const overlayRef = useRef<Overlay | null>(null);
  const stopRecRef = useRef<() => void>(() => {});
  const [mode, setMode] = useState<Mode>("me");
  const [worldCodes, setWorldCodes] = useState<string[]>(PRESETS[0].codes.filter(c => WORLD[c]));
  const [worldK, setWorldK] = useState(10);
  const [preset, setPreset] = useState("region");
  const [search, setSearch] = useState("");
  const [future, setFuture] = useState(true);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [sound, setSound] = useState(() => { try { return localStorage.getItem("starRace.sound") !== "off"; } catch { return true; } });
  const musicRef = useRef<Music | null>(null);
  const soundRef = useRef(sound);
  const worldRef = useRef<HTMLUListElement>(null);
  const boardRef = useRef<HTMLUListElement>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [smart, setSmart] = useState(false);
  const [pos, setPos] = useState({ t: 0, span: 1 });
  const [finishedSpec, setFinishedSpec] = useState<RaceSpec | null>(null);
  const specRef = useRef<RaceSpec | null>(null);
  const [toast, setToast] = useState<{ title: string; note?: string; color: string } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [bars, setBars] = useState(false);
  const [flash, setFlash] = useState<{ c: string; a: number; k: number }>({ c: "#fff", a: 0, k: 0 });
  const [introKey, setIntroKey] = useState(0);
  const [tab, setTab] = useState<Tab>("result");
  const [panelOpen, setPanelOpen] = useState(true);
  const [worldOpen, setWorldOpen] = useState(true);
  const [err, setErr] = useState("");
  const [friendCode, setFriendCode] = useState("");
  const [friendErr, setFriendErr] = useState("");
  const [myCode, setMyCode] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ input: screen === "race" && input !== EXAMPLE ? input : saved.input, friends })); } catch { /* хранилище недоступно */ }
  }, [input, friends, screen, saved.input]);

  const path: PathResult = useMemo(() => computePath(input), [input]);
  const world = useMemo(() => placeEverywhere(input.sex, path.incomePpp), [input.sex, path.incomePpp]);

  const spec: RaceSpec | null = useMemo(() => {
    if (screen === "start") return null;
    const c = COUNTRIES[input.country];
    const S = path.startAge, A = path.age;
    const evs = (list: [number, EventType][], withNote: boolean) => list.map(([age, type]) => ({ age, type, label: EVENT_LABELS[type], note: withNote ? eventNote(type, input.sex, age) : undefined }));
    if (mode === "me") {
      const sexPl = input.sex === "m" ? "мужчины" : "женщины", man = input.sex === "m";
      const sigma = sigmaOf(c), R0 = retireAge(input.country, input.sex, input.birth);
      const E = Math.min(S + 62, future ? Math.max(A, Math.ceil(R0) + 2) : A);
      const ages = Array.from({ length: E - S + 1 }, (_, i) => S + i);
      const used: string[] = [UNI, WORK, KID];
      const pick = (col: string) => { const v = distinct(col, input.color, used); used.push(v); return v; };
      const ml = medianLife(input.country, input.sex, input.birth, S, E);
      const heroVals = ages.map((_, i) => path.you[Math.min(i, path.you.length - 1)]);
      const heroEv: [number, EventType][] = allEvents(input).map(e => [e.age, e.type]);
      input.kidsAt.forEach(k => { if (k + 18 >= S && k + 18 <= E) heroEv.push([k + 18, "kidout"]); });
      if (R0 <= E) heroEv.push([Math.round(R0), "retire"]);
      heroEv.sort((a, b) => a[0] - b[0]);
      const racers: Racer[] = [
        { short: "Топ-10%", full: `Верхние 10% (${sexPl}), ${c.name}`, color: TOP, values: ages.map(a => pct(Math.exp(1.2816 * sigma) * ageProfile(c, Math.min(a, R0)), sigma)), events: [] },
        { short: "Медиана · вуз", full: `${man ? "Средний мужчина" : "Средняя женщина"} с высшим образованием, ${c.name} (≈ модель)`, color: UNI, values: ml.uni.values,
          events: [...(S <= 19 ? [{ age: S, type: "split" as EventType, label: EVENT_LABELS.split, note: `Развилка: в вуз идёт ≈ ${ml.share}%, остальные — сразу работать` }] : []), ...ml.uni.events] },
        ...input.compare.filter(o => o !== input.country).map(o => ({
          short: COUNTRIES[o].short, full: `${man ? "Средний мужчина" : "Средняя женщина"}, ${COUNTRIES[o].name} — по меркам страны «${c.short}»`,
          color: pick(COUNTRY_COLORS[o]), values: foreignMedianPath(input.country, o, input.sex, S, E), events: [],
        })),
        { short: input.name || "Ты", full: `${input.name || "Ты"} — твой путь${E > A ? " (после сегодняшнего дня — прогноз)" : ""}`, color: input.color, hero: true, style: input.style, values: heroVals, events: evs(heroEv, true) },
      ];
      // родители — слева от своей звезды; своя звезда «отделяется» от родителя в начале пути
      const fam = friends.filter(f => f.r && f.r !== "friend");
      const parents = fam.filter(f => f.r === "parent");
      const heroAt = racers.length - 1;
      const parentIdx: number[] = [];
      parents.slice(0, 2).forEach(m => {
        const al = alignByYear(m, input.birth, S, ages.length);
        racers.splice(racers.length - 1, 0, { short: m.n, full: `${m.n} — ${relName(m.r)}${m.est ? " (путь по средним данным страны)" : ""}`, color: pick(FRIEND_COLORS[(used.length + 3) % FRIEND_COLORS.length]), values: al.values, events: eventsByYear(m, input.birth, S, E), until: leaveOf(m, input.birth, S) });
        parentIdx.push(racers.length - 2);
      });
      const heroI = racers.length - 1; void heroAt;
      if (parentIdx.length) racers[heroI].join = { parent: parentIdx[0], t: 0, text: "Свой путь" };
      fam.filter(f => f.r !== "parent").forEach(m => {
        if (racers.length >= MAX_STARS - 1) return;
        const al = alignByYear(m, input.birth, S, ages.length);
        if (al.start < 0) return;
        const from = m.r === "sibling" && parentIdx.length ? parentIdx[0] : heroI;
        racers.push({ short: m.n, full: `${m.n} — ${relName(m.r)}${m.est ? " (путь по средним данным страны)" : ""}`, color: pick(FRIEND_COLORS[(used.length + 1) % FRIEND_COLORS.length]), values: al.values, events: eventsByYear(m, input.birth, S, E), until: leaveOf(m, input.birth, S),
          join: al.start > 0 ? { parent: from, t: al.start, text: m.r === "child" ? "Своя звезда" : "Новая звезда в семье" } : undefined });
      });
      const realKids = fam.filter(f => f.r === "child").length;
      input.kidsAt.forEach((k, j) => {
        if (j < realKids || k + 18 > E || racers.length >= MAX_STARS - 2) return;
        const tJ = Math.max(0, k + 18 - S);
        racers.push({ short: `Ребёнок ${j + 1}`, full: `Ребёнок ${j + 1} — путь с 18 лет по средним данным страны`, color: pick(KID), values: childPath(input.country, k + 18, S, E), events: [], join: { parent: heroI, t: tJ, text: "Ребёнку 18 — своя звезда" } });
      });
      friends.filter(f => !f.r || f.r === "friend").slice(0, Math.max(0, MAX_STARS - 1 - racers.length)).forEach((f, i) => racers.push({
        short: f.n, full: `${f.n} — друг (${COUNTRIES[f.c]?.name ?? ""})`, color: pick(FRIEND_COLORS[i % FRIEND_COLORS.length]),
        values: f.v.slice(Math.max(0, S - f.a)), events: evs(f.e.filter(([a]) => a >= S), false), until: leaveOf(f, input.birth, S),
      }));
      racers.push({ short: "Медиана · работа", full: `${man ? "Средний мужчина" : "Средняя женщина"} без высшего, работа с 18, ${c.name} (≈ модель)`, color: WORK, values: ml.work.values, events: ml.work.events,
        join: S <= 19 ? { parent: 1, t: 0, text: "Работа с 18" } : undefined });
      return {
        racers, startAge: S, title: `Глава I · ${years(S)}`, nowT: A - S,
        axis: { kind: "levels", min: 0, max: 100, bands: LEVELS, labelOf: v => LEVELS[levelIndex(v)].name },
        crises: c.crises.filter(([y]) => y >= input.birth + S && y <= NOW_YEAR).map(([y, text]) => ({ age: y - input.birth, text })),
        yearOfAge: age => input.birth + age,
      };
    }
    return worldSpec(worldCodes, worldK, ISO[input.country], input.color);
  }, [screen, mode, input, path, friends, worldCodes, worldK, future]);

  // движок
  useEffect(() => {
    if (!hostRef.current) return;
    let eng: RaceEngine;
    try { eng = new RaceEngine(hostRef.current); } catch { return; }
    engineRef.current = eng;
    let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>;
    let fid = 0;
    const push = (text: string, color: string) => { const id = ++fid; setFeed(f => [{ id, text, color }, ...f].slice(0, 3)); setTimeout(() => setFeed(f => f.filter(x => x.id !== id)), 6500); };
    const snd = (k: Sfx) => musicRef.current?.sfx(k);
    const SFX: Partial<Record<EventType, Sfx>> = { child: "child", wedding: "wedding", study: "study", retire: "retire", divorce: "divorce", kidout: "join", split: "join" };
    eng.onEvent = (r, ev) => {
      const k = SFX[ev.type]; if (k && r.hero) snd(k);
      if (!r.hero) { push(`${r.short} · ${ev.label}`, r.color); return; }
      setToast({ title: `${r.short} · ${years(ev.age)} · ${ev.label}`, note: ev.note, color: r.color }); clearTimeout(t1); t1 = setTimeout(() => setToast(null), ev.note ? 4600 : 2600);
    };
    eng.onImpact = (r, reason) => {
      snd("impact");
      if (!r.hero) { push(`${r.short} · удар: ${reason}`, r.color); return; }
      setToast({ title: `${r.short} · удар метеорита`, note: `Причина: ${reason}. Звезду отбросило вниз.`, color: r.color }); clearTimeout(t1); t1 = setTimeout(() => setToast(null), 3400);
    };
    eng.onCrisis = text => { snd("crisis"); setBanner(text); clearTimeout(t2); t2 = setTimeout(() => setBanner(null), 3000); };
    eng.onOvertake = (a, b) => { snd("overtake"); push(a.hero ? `Ты обгоняешь: ${b.short}` : b.hero ? `Впереди теперь — ${a.short}` : `${a.short} обгоняет ${b.short}`, a.color); };
    eng.onReplace = (a, b) => { snd("replace"); push(`Новичок в строю: ${a.short} · выбывает ${b.short}`, a.color); };
    eng.onJoin = r => { snd("join"); push(`${r.short}: ${r.join?.text ?? "новая звезда"}`, r.color); };
    eng.onPlayChange = p => { setPlaying(p); if (p) setFinishedSpec(null); };
    eng.onFinish = () => { setFinishedSpec(specRef.current); setPanelOpen(true); setTab("result"); setTimeout(() => stopRecRef.current(), 2600); };
    eng.onTick = (t, span) => setPos({ t, span });
    eng.onBars = setBars;
    eng.onIntro = () => setIntroKey(k => k + 1);
    eng.onFlash = (c, a) => setFlash(f => ({ c, a, k: f.k + 1 }));
    const ro = new ResizeObserver(() => eng.resize());
    ro.observe(hostRef.current);
    return () => { ro.disconnect(); eng.destroy(); clearTimeout(t1); clearTimeout(t2); };
  }, []);
  // музыка: браузер разрешает звук только после первого нажатия
  useEffect(() => {
    soundRef.current = sound;
    try { localStorage.setItem("starRace.sound", sound ? "on" : "off"); } catch { /* нет хранилища */ }
    if (!sound) { musicRef.current?.stop(); return; }
    const go = () => { if (!soundRef.current) return; musicRef.current = musicRef.current ?? new Music(); musicRef.current.start(); };
    if (musicRef.current) go();
    window.addEventListener("pointerdown", go, { once: true });
    return () => window.removeEventListener("pointerdown", go);
  }, [sound]);
  useEffect(() => () => musicRef.current?.destroy(), []);
  // короткая ссылка ?s=abc1234 или запуск из Telegram (startapp=abc1234) → окно «Кто это для тебя?»
  useEffect(() => {
    let alive = true;
    const fromUrl = new URLSearchParams(location.search).get("s");
    void initTelegram().then(async tg => {
      const id = tg || fromUrl; if (!id) return;
      const code = await resolveShort(id); const d = code ? decodeStar(code) : null;
      if (alive && d) setInvite(d);
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    specRef.current = spec;
    if (spec) engineRef.current?.load(spec);
  }, [spec]);
  useEffect(() => { engineRef.current?.setSpeed(speed); }, [speed]);
  useEffect(() => { engineRef.current?.setSmartTempo(smart); }, [smart]);
  const finished = spec !== null && finishedSpec === spec;

  // текущий момент гонки
  const S = mode === "me" ? path.startAge : WORLD_Y0;
  const ageNow = S + Math.floor(pos.t + 1e-6);
  const isFuture = mode === "me" && ageNow > path.age;
  const monthNow = Math.min(11, Math.floor((pos.t - Math.floor(pos.t + 1e-6)) * 12 + 1e-6));
  const yi = Math.min(path.youPpp.length - 1, Math.max(0, Math.floor(pos.t + 1e-6)));
  const liveWorld = useMemo(() => COUNTRY_ORDER.map(c => placeIn(c, input.sex, path.youPpp[yi])).sort((a, b) => b.p - a.p), [input.sex, path.youPpp, yi]);
  const ownNow = liveWorld.find(w => w.code === input.country);
  // таблица мест в гонке стран за текущий год
  const wk = Math.min(WORLD_Y1 - WORLD_Y0, Math.max(0, Math.floor(pos.t + 1e-6)));
  const board = useMemo(() => {
    if (mode !== "world") return [];
    const { byYear } = ranks(worldCodes);
    const K = Math.min(worldK, byYear[0]?.length ?? 0), prevY = byYear[Math.max(0, wk - 1)];
    return byYear[wk].slice(0, K).map((code, r) => ({ code, r, v: WORLD[code].v[wk], d: wk > 0 ? prevY.indexOf(code) - r : 0, isNew: wk > 0 && prevY.indexOf(code) >= K }));
  }, [mode, worldCodes, worldK, wk]);
  const colorOf = (short: string) => spec?.racers.find(r => r.short === short)?.color ?? "#fff";
  // место своей звезды среди звёзд в кадре
  const heroPlace = useMemo(() => {
    if (!spec || mode !== "me") return null;
    const vis = spec.racers.filter(r => !r.join || r.join.t <= pos.t);
    const v = vis.map(r => ({ r, v: valueNow(r.values, pos.t) })).sort((a, b) => b.v - a.v);
    return { place: v.findIndex(x => x.r.hero) + 1, of: v.length };
  }, [spec, mode, pos.t]);
  useFlip(worldRef); useFlip(boardRef);
  useEffect(() => {
    if (!spec) return;
    const hero = spec.racers.find(r => r.hero);
    overlayRef.current = {
      title: mode === "me" ? (input.name || "мой путь") : "гонка стран",
      year: String(mode === "me" ? input.birth + ageNow : ageNow) + (isFuture ? "*" : ""),
      sub: mode === "me" ? `возраст ${ageNow}${isFuture ? " · прогноз" : ""}` : "ВВП на душу населения",
      chips: mode === "me"
        ? [hero ? LEVELS[levelIndex(valueNow(hero.values, pos.t))].name : "", ownNow ? `топ-${ownNow.top}% · ${COUNTRIES[input.country].short}` : "", heroPlace ? `${heroPlace.place}-е из ${heroPlace.of}` : ""].filter(Boolean)
        : [board[0] ? `Лидер: ${countryName(board[0].code)}` : ""].filter(Boolean),
      feed: feed.map(f => ({ text: f.text, color: f.color })),
      list: mode === "me" ? liveWorld.slice(0, 5).map(w => ({ name: COUNTRIES[w.code].short + (w.like ? ` · ${w.like}` : ""), value: `топ-${w.top}%`, color: w.code === input.country ? input.color : "#c9cfe6" }))
        : board.slice(0, 5).map(b => ({ name: countryName(b.code), value: fmtGdp(b.v), color: colorOf(countryName(b.code)) })),
      footer: mode === "me" ? "А где летит твоя звезда?" : "Какая страна обгонит следующей?",
      name: mode === "me" ? (input.name || "Мой путь") : "Гонка стран", color: mode === "me" ? input.color : "#ffd27a",
      cta: typeof location !== "undefined" && /^https?:/.test(location.href) && !/localhost|claude|usercontent/.test(location.host) ? location.host : "Звёздная гонка",
      progress: pos.span ? Math.min(1, pos.t / pos.span) : 0,
    };
  });

  // итог
  const nowI = levelIndex(path.you[path.you.length - 1]);
  const startI = levelIndex(path.you[0]);
  const rise = nowI - startI;
  const riseText = rise > 0 ? `+${rise} ${plural(rise, "уровень", "уровня", "уровней")}` : "высота держится";
  const who = input.sex === "m" ? "мужчин" : "женщин";
  const phrase = `${LEVELS[nowI].phrase} ${rise > 0 ? `От старта в ${years(path.startAge)} ты поднялся(ась) на ${riseText.slice(1)}.` : "Твоё место ещё впереди — путь продолжается."}`;
  const bestAbroad = world.filter(w => w.code !== input.country).sort((a, b) => a.top - b.top)[0];
  const isExample = input === EXAMPLE;

  const card = useMemo(() => {
    if (!finished || mode !== "me") return null;
    const cv = document.createElement("canvas"); cv.width = 1080; cv.height = 1920;
    const x = cv.getContext("2d"); if (!x) return null;
    const rs = getComputedStyle(document.documentElement);
    const FD = rs.getPropertyValue("--f-display").trim() || "Unbounded, sans-serif";
    const FB = rs.getPropertyValue("--f-body").trim() || "Manrope, sans-serif";
    const g = x.createLinearGradient(0, 0, 0, 1920); g.addColorStop(0, "#0c1433"); g.addColorStop(1, "#050816"); x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);
    for (const [cx, cy, col] of [[200, 500, "rgba(91,43,214,0.35)"], [900, 1200, "rgba(26,163,200,0.25)"], [600, 300, "rgba(196,43,138,0.2)"]] as [number, number, string][]) {
      const n = x.createRadialGradient(cx, cy, 0, cx, cy, 600); n.addColorStop(0, col); n.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = n; x.fillRect(0, 0, 1080, 1920);
    }
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 300; i++) { x.globalAlpha = 0.2 + rnd() * 0.6; x.fillStyle = "#cdd6ff"; x.beginPath(); x.arc(rnd() * 1080, rnd() * 1920, rnd() * 2.2, 0, 6.283); x.fill(); }
    x.globalAlpha = 1; x.textAlign = "center";
    x.fillStyle = "#9aa3c3"; x.font = "500 40px " + FB; x.fillText("ЗВЁЗДНАЯ ГОНКА", 540, 170);
    x.fillStyle = "#eef1fb"; x.font = "700 64px " + FD; x.fillText(input.name || "Мой путь", 540, 290);
    const gx = 120, gw = 840, gy = 400, gh = 700, lv = path.you;
    x.strokeStyle = "rgba(160,175,230,0.18)"; x.setLineDash([6, 12]);
    LEVELS.slice(1).forEach(l => { const yy = gy + gh - (l.from / 100) * gh; x.beginPath(); x.moveTo(gx, yy); x.lineTo(gx + gw, yy); x.stroke(); });
    x.setLineDash([]);
    const line = (vals: number[], col: string, w: number, blur: number) => {
      x.strokeStyle = col; x.lineWidth = w; x.lineJoin = "round"; x.shadowColor = col; x.shadowBlur = blur; x.beginPath();
      vals.forEach((p, i) => { const px = gx + (i / Math.max(1, vals.length - 1)) * gw, py = gy + gh - (p / 100) * gh; if (i) x.lineTo(px, py); else x.moveTo(px, py); });
      x.stroke(); x.shadowBlur = 0;
    };
    line(path.median, "rgba(143,180,255,0.6)", 4, 0);
    line(lv, input.color, 9, 30);
    x.fillStyle = "#fff"; x.shadowColor = input.color; x.shadowBlur = 40; x.beginPath(); x.arc(gx + gw, gy + gh - (lv[lv.length - 1] / 100) * gh, 16, 0, 6.283); x.fill(); x.shadowBlur = 0;
    x.fillStyle = "#9aa3c3"; x.font = "500 32px " + FB;
    x.fillText(`${years(path.startAge)} → ${years(path.age)} · синяя линия — средний человек`, 540, gy + gh + 64);
    x.fillStyle = "#9aa3c3"; x.font = "500 38px " + FB; x.fillText("МОЯ ВЫСОТА", 540, 1300);
    x.fillStyle = input.color; x.font = "700 88px " + FD; x.fillText(LEVELS[nowI].name, 540, 1405);
    x.fillStyle = "#eef1fb"; x.font = "500 46px " + FB; x.fillText(rise > 0 ? `Взлёт: ${riseText} от старта` : "Мой путь продолжается", 540, 1500);
    if (bestAbroad) { x.fillStyle = "#c9cfe6"; x.font = "500 40px " + FB; x.fillText(`${COUNTRIES[bestAbroad.code].name}: был(а) бы в топ-${bestAbroad.top}%`, 540, 1600); }
    x.fillStyle = "#9aa3c3"; x.font = "500 34px " + FB; x.fillText(`${COUNTRIES[input.country].name} · а где летит твоя звезда?`, 540, 1790);
    return cv.toDataURL("image/png");
  }, [finished, mode, input, path, nowI, rise, riseText, bestAbroad]);

  // анкета
  const upd = (patch: Partial<LifeInput>) => setDraft(d => ({ ...d, ...patch }));
  const draftAge = NOW_YEAR - draft.birth;
  const launch = (s: LifeInput) => {
    const m = validate(s); setErr(m); if (m) return;
    setInput({ ...s }); setMode("me"); setMyCode(""); setScreen("race");
    setTimeout(() => stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };
  const addFriend = () => {
    const d = decodeStar(friendCode);
    if (!d) { setFriendErr("Код не распознан. Попроси друга скопировать код ещё раз целиком."); return; }
    if (starCount >= MAX_STARS) { setFriendErr(`В гонке до ${MAX_STARS} звёзд. Убери друга или страну, чтобы добавить нового.`); return; }
    setFriends(f => [...f, { ...d, r: rel }]); setFriendCode(""); setFriendErr(""); setMode("me");
  };
  const acceptInvite = () => {
    if (!invite) return;
    setFriends(f => [...f.filter(x => !(x.n === invite.n && x.b === invite.b)), { ...invite, r: inviteRel }]);
    setInvite(null); setMode("me");
    try { history.replaceState(null, "", location.pathname + location.search); } catch { /* без истории */ }
    if (screen === "start" && !saved.input) { setInput(EXAMPLE); setScreen("race"); }
  };
  const copyInvite = async () => {
    const code = encodeStar(input, path); setLinkCopied("…");
    const id = await createShort(code);   // короткая ссылка; если база недоступна — длинная, с кодом внутри
    const link = id ? shortUrl(id, location.href, isTelegram()) : inviteLink(location.href, code);
    const how = await shareLink(link, `${input.name || "Я"} в «Звёздной гонке» — посмотри, где летит моя звезда, и добавь свою`);
    setLinkCopied(how === "copy" ? `Ссылка скопирована — вставь её в чат: ${link}` : how === "fail" ? "" : "Готово");
    if (how === "fail") setMyCode(link);
  };
  const addManual = () => {
    if (!man.name.trim() || !(man.birth > 1900 && man.birth <= NOW_YEAR - 1)) { setFriendErr("Укажи имя и год рождения близкого."); return; }
    if (starCount >= MAX_STARS) { setFriendErr(`В гонке до ${MAX_STARS} звёзд.`); return; }
    const gone = Number(man.gone) > man.birth && Number(man.gone) <= NOW_YEAR ? Number(man.gone) : undefined;
    setFriends(f => [...f, manualMember(man.name.trim(), man.birth, man.rel, input.country, input.sex, gone)]);
    setMan(m => ({ ...m, name: "", gone: "" })); setFriendErr(""); setMode("me");
  };
  const setGone = (i: number, v: string) => setFriends(fr => fr.map((f, k) => k === i ? { ...f, gone: Number(v) > f.b && Number(v) <= NOW_YEAR ? Number(v) : undefined } : f));
  // ---------- ролик 9:16 ----------
  const startClip = () => {
    const eng = engineRef.current; if (!eng) return;
    if (!pickFormat()) { setToast({ title: "Запись недоступна", note: "Этот браузер не умеет записывать видео. Открой страницу в Chrome или Safari последней версии.", color: "#ff9e8b" }); return; }
    if (clip) URL.revokeObjectURL(clip.url);
    setClip(null); setRec("prep"); setPanelOpen(false);
    setTimeout(() => {  // ждём, пока сцена станет вертикальной
      const r = new ClipRecorder(eng, () => overlayRef.current!);
      recRef.current = r;
      const sp = specRef.current, secs = (sp?.secPerYear ?? 3) * eng.getSpan();
      eng.setSpeed(Math.min(20, Math.max(0.6, secs / Math.max(6, clipLen - 6)))); eng.restart(true);
      try { r.start(sound ? musicRef.current?.stream() ?? null : null); setRec("on"); } catch { setRec("off"); }
    }, 700);
  };
  const stopClip = async () => {
    const r = recRef.current; if (!r) return;
    recRef.current = null;
    const blob = await r.stop();
    engineRef.current?.setSpeed(speed);
    setClip({ url: URL.createObjectURL(blob), ext: r.format?.ext ?? "webm", blob }); setRec("done");
  };
  const shareClip = async () => {
    if (!clip) return;
    const file = new File([clip.blob], `zvyozdnaya-gonka.${clip.ext}`, { type: clip.blob.type });
    try { if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "Звёздная гонка" }); } catch { /* пользователь отменил */ }
  };
  useEffect(() => { stopRecRef.current = () => { if (recRef.current) void stopClip(); }; });
  const copyMyCode = async () => {
    const code = encodeStar(input, path); setMyCode(code); setCopied(false);
    try { await navigator.clipboard.writeText(code); setCopied(true); } catch { /* покажем поле для ручного копирования */ }
  };
  const toggleCompare = (c: CountryCode) => setInput(s => ({ ...s, compare: s.compare.includes(c) ? s.compare.filter(x => x !== c) : starCount < MAX_STARS ? [...s.compare, c] : s.compare }));
  const addWorld = (q: string) => {
    const code = WORLD_CODES.find(c => countryName(c).toLowerCase() === q.trim().toLowerCase()) ?? WORLD_CODES.find(c => countryName(c).toLowerCase().startsWith(q.trim().toLowerCase()));
    if (code && !worldCodes.includes(code)) { setWorldCodes(w => [...w, code]); setPreset(""); }
    setSearch("");
  };
  const fullscreen = () => { const el = stageRef.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else el.requestFullscreen?.().catch(() => {}); };
  const cur = COUNTRIES[draft.country].cur;
  const starCount = mode === "me" ? spec?.racers.length ?? 0 : Math.min(worldK, worldCodes.length);

  // ---------- экранные панели ----------
  const resultPanel = (
    <div className="ov-body">
      <div className="ov-hero">
        <div className="k">Высота сейчас</div>
        <div className="ov-level" style={{ color: input.color }}>{LEVELS[nowI].name}</div>
        <div className="ov-stats">
          <div><div className="k">Взлёт от старта</div><div className="v">{riseText}</div></div>
          <div><div className="k">Среди сверстников</div><div className="v num">выше, чем у {path.peers} из 100 {who}</div></div>
          {bestAbroad && <div><div className="k">Лучшее место в мире</div><div className="v">{COUNTRIES[bestAbroad.code].name}: топ-{bestAbroad.top}%</div></div>}
        </div>
        <p className="phrase">{phrase}</p>
      </div>
    </div>
  );
  const worldPanel = (
    <div className="ov-body">
      <p className="est">Твой доход по ценам (паритету покупательной способности) в каждой стране — место среди работающих {who}.</p>
      <div className="ov-grid">
        {world.map(w => {
          const c = COUNTRIES[w.code];
          return (
            <div key={w.code} className={w.code === input.country ? "pl own" : "pl"} style={{ borderColor: w.code === input.country ? input.color : undefined }}>
              <div className="pl-top"><span className="k">{c.name}</span><span className="pl-rank num">Топ-{w.top}%</span></div>
              <div className="pl-lvl">{LEVELS[w.level].name} · ≈ {fmtMoney(w.local, c.cur)}</div>
              {w.like && <div className="pl-like">По зарплате на уровне: <b>{w.like}</b></div>}
              {w.likeWage && <div className="est">{w.like} получает ≈ {fmtMoney(w.likeWage, c.cur)}{w.likeVac ? " (по вакансиям)" : ""}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
  const peersPanel = (
    <div className="ov-body">
      <p className="est">Твои ровесники в {years(path.age)} — средние цифры по странам, а не оценка тебя.</p>
      <div className="ov-grid">
        {COUNTRY_ORDER.map(code => {
          const f = peersAt(code, input.sex, path.age);
          return (
            <div key={code} className="pl">
              <div className="pl-top"><span className="k">{COUNTRIES[code].name}</span></div>
              <ul className="facts">{f.lines.slice(0, 3).map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          );
        })}
      </div>
    </div>
  );
  const cardPanel = (
    <div className="ov-body ov-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {card && <img src={card} alt="Карточка результата для сторис" />}
      <p className="est">Карточка для сторис — без сумм дохода. Сохранить: на телефоне нажми на картинку и удерживай; на компьютере — правая кнопка мыши → «Сохранить изображение».</p>
    </div>
  );

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <span className="badge">Версия 0.8 · 3D · {COUNTRY_ORDER.length} стран подробно · {WORLD_CODES.length} в гонке стран</span>
          <h1>Звёздная гонка</h1>
        </div>
      </header>

      <div className={`stage ${screen === "start" ? "intro" : ""} ${rec === "prep" || rec === "on" ? "rec" : ""}`} ref={stageRef}>
        {invite && (
          <div className="invite" role="dialog" aria-label="Приглашение">
            <div className="ov-name">{invite.n} прислал(а) свою звезду</div>
            <p className="est">Кто это для тебя? Звезда появится в твоей гонке. Сумм дохода в ней нет — только уровни.</p>
            <div className="chips">{REL_LABELS.map(([k, t]) => <button key={k} className={inviteRel === k ? "chip on" : "chip"} aria-pressed={inviteRel === k} onClick={() => setInviteRel(k)}>{t}</button>)}</div>
            <div className="ov-foot"><button className="primary" onClick={acceptInvite}>Добавить в мою гонку</button><button onClick={() => setInvite(null)}>Не сейчас</button></div>
          </div>
        )}
        {(rec === "prep" || rec === "on") && <div className="rec-badge"><i />Запись ролика… <button onClick={() => void stopClip()}>Стоп</button></div>}
        {rec === "done" && clip && (
          <div className="overlay clip" role="dialog" aria-label="Ролик готов">
            <div className="ov-head"><div className="ov-name">Ролик готов</div><button className="hud-icon" onClick={() => setRec("off")} aria-label="Закрыть">✕</button></div>
            <video src={clip.url} controls playsInline className="clip-video" />
            <div className="ov-foot">
              <a className="btn primary" href={clip.url} download={`zvyozdnaya-gonka.${clip.ext}`}>Скачать .{clip.ext}</a>
              {typeof navigator !== "undefined" && "share" in navigator && <button onClick={() => void shareClip()}>Поделиться</button>}
            </div>
            <p className="est">Вертикальный ролик 1080×1920 с музыкой (если звук включён). Сумм дохода в нём нет.{clip.ext === "webm" ? " Формат WebM: Telegram и YouTube принимают его; для Instagram на iPhone лучше записать в Safari — там будет MP4." : ""}</p>
          </div>
        )}
        <div className="gl-host" ref={hostRef} />
        <div className="vignette" />
        <div className="flash" key={flash.k} style={{ background: flash.c, ["--a" as string]: flash.a } as React.CSSProperties} />
        <div className={bars ? "bars on" : "bars"}><i /><i /></div>

        {screen === "start" && (
          <div className="hero-title"><div className="k">Начни с главного</div><div className="ht">Зажги свою звезду</div><div className="hs">Твоя жизнь — звезда среди миллионов. Узнай, где она летит.</div></div>
        )}

        {screen === "race" && spec && (
          <>
            <div className="hud-top">
              <div className="hud-tabs">
                <button className={mode === "me" ? "on" : ""} onClick={() => setMode("me")}>Моя гонка</button>
                <button className={mode === "world" ? "on" : ""} onClick={() => setMode("world")}>Гонка стран</button>
                <button onClick={() => { setDraft(isExample ? BLANK : input); setScreen("start"); }}>Изменить</button>
              </div>
              <div className="hud-year" key={introKey}>
                <div className="hy">{mode === "me" ? input.birth + ageNow : ageNow}{isFuture && <span className="hy-f">прогноз</span>}</div>
                <div className="hm">{mode === "me" ? `${MONTHS[monthNow]} · возраст ${ageNow}` : "ВВП на душу населения, $ в год"}</div>
                <div className="dash">
                  <div className="dash-chips">
                    {mode === "me" ? (<>
                      <span className="chip-d"><i style={{ color: input.color }} />{LEVELS[levelIndex(valueNow(spec.racers.find(r => r.hero)?.values ?? [0], pos.t))].name}</span>
                      {ownNow && <span className="chip-d num">топ-{ownNow.top}% · {COUNTRIES[input.country].short}</span>}
                      {heroPlace && <span className="chip-d num">{heroPlace.place}-е место из {heroPlace.of}</span>}
                    </>) : (<>
                      {board[0] && <span className="chip-d"><i style={{ color: colorOf(countryName(board[0].code)) }} />Лидер: {countryName(board[0].code)}</span>}
                      {(() => { const k = ranks(worldCodes).byYear[wk].indexOf(ISO[input.country]); return k >= 0 ? <span className="chip-d num">{COUNTRIES[input.country].short}: {k + 1}-е из {worldCodes.length}</span> : null; })()}
                    </>)}
                  </div>
                  <ul className="dash-feed" aria-live="polite">{feed.map(f => <li key={f.id}><i style={{ color: f.color }} />{f.text}</li>)}</ul>
                </div>
              </div>
              <div className="hud-right">
                <button className={sound ? "hud-icon on" : "hud-icon"} onClick={() => setSound(v => !v)} aria-pressed={sound} aria-label={sound ? "Выключить музыку" : "Включить музыку"} title={sound ? "Музыка: вкл" : "Музыка: выкл"}>{sound ? "♪" : "♪̸"}</button>
                <button className="hud-icon" onClick={fullscreen} aria-label="Во весь экран" title="Во весь экран">⛶</button>
              </div>
            </div>

            <div className="alt" aria-hidden>
              {spec.axis.kind === "levels" && spec.axis.bands
                ? spec.axis.bands.map((b, i, arr) => {
                    const lo = b.from, hi = i < arr.length - 1 ? arr[i + 1].from : 100;
                    return <div key={b.name} className="alt-band" style={{ bottom: `${lo}%`, height: `${hi - lo}%` }}><span>{b.name}</span></div>;
                  })
                : spec.axis.ticks?.map(tk => <div key={tk.v} className="alt-tick" style={{ bottom: `${axisK(spec, tk.v) * 100}%` }}><span>{tk.label.replace(" ППС", "")}</span></div>)}
              {spec.racers.map((r, i) => {
                const v = valueNow(r.values, pos.t);
                return <i key={i} className={r.hero ? "alt-dot hero" : "alt-dot"} style={{ bottom: `${axisK(spec, v) * 100}%`, color: r.color }} title={r.short} />;
              })}
            </div>
            <div className="intro-title" key={`t${introKey}`}>{spec.title}</div>
            {banner && <div className="crisis">{banner}</div>}

            {mode === "me" && (
              <aside className={worldOpen ? "hud-world" : "hud-world closed"}>
                <button className="hw-head" onClick={() => setWorldOpen(o => !o)} aria-expanded={worldOpen}>
                  <span>Твоё место в мире · {input.birth + ageNow}</span><span aria-hidden>{worldOpen ? "–" : "+"}</span>
                </button>
                {worldOpen && (
                  <ul className="hw-list" ref={worldRef}>{liveWorld.map(w => (
                    <li key={w.code} data-k={w.code} className={w.code === input.country ? "own" : ""}>
                      <div className="hw-line">
                        <span className="hw-c">{COUNTRIES[w.code].short}</span>
                        <span className="hw-bar"><i style={{ width: `${Math.max(3, w.p)}%`, background: w.code === input.country ? input.color : "rgba(200,210,255,0.55)" }} /></span>
                        <span className="hw-r num">топ-{w.top}%</span>
                      </div>
                      {w.like && <div className="hw-like">на уровне: <b>{w.like}</b></div>}
                    </li>
                  ))}</ul>
                )}
              </aside>
            )}
            {mode === "world" && (
              <aside className="hud-world">
                <div className="hw-head"><span>Топ-{board.length} · {ageNow}</span></div>
                <ul className="hw-board" ref={boardRef}>{board.map(b => (
                  <li key={b.code} data-k={b.code} className={b.code === ISO[input.country] ? "own" : ""}>
                    <span className="hb-n num">{b.r + 1}</span>
                    <span className="hw-c"><i style={{ color: colorOf(countryName(b.code)) }} />{countryName(b.code)}</span>
                    <span className="hw-r num">{fmtGdp(b.v)}</span>
                    <span className={b.isNew ? "hb-d new" : b.d > 0 ? "hb-d up" : b.d < 0 ? "hb-d down" : "hb-d"}>{b.isNew ? "new" : b.d > 0 ? `▲${b.d}` : b.d < 0 ? `▼${-b.d}` : ""}</span>
                  </li>
                ))}</ul>
              </aside>
            )}

            {toast && (
              <div className="event-card">
                <div className="ec-title"><span className="dot" style={{ color: toast.color }} />{toast.title}</div>
                {toast.note && <div className="ec-note">{toast.note}</div>}
              </div>
            )}

            {finished && mode === "me" && panelOpen && (
              <div className="overlay" role="dialog" aria-label="Итог пути">
                <div className="ov-head">
                  <div className="ov-name">Итог пути: {input.name || "ты"}</div>
                  <button className="hud-icon" onClick={() => setPanelOpen(false)} aria-label="Скрыть итог">✕</button>
                </div>
                <div className="ov-tabs" role="tablist">
                  {([["result", "Итог"], ["world", "Ты в мире"], ["peers", "Ровесники"], ["card", "Карточка"]] as [Tab, string][]).map(([k, t]) => (
                    <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{t}</button>
                  ))}
                </div>
                {tab === "result" ? resultPanel : tab === "world" ? worldPanel : tab === "peers" ? peersPanel : cardPanel}
                <div className="ov-foot">
                  <button className="primary" onClick={() => engineRef.current?.restart(true)}>Смотреть ещё раз</button>
                  {isExample && <button onClick={() => { setDraft(BLANK); setScreen("start"); }}>Запустить свою звезду</button>}
                </div>
              </div>
            )}
            {finished && mode === "me" && !panelOpen && <button className="ov-reopen" onClick={() => setPanelOpen(true)}>Показать итог</button>}

            <div className="hud-bottom">
              <div className="hb-row">
                <button className="hb-play" onClick={() => engineRef.current?.toggle()} aria-label={finished ? "Ещё раз" : playing ? "Пауза" : "Играть"}>{finished ? "↻" : playing ? "❚❚" : "▶"}</button>
                <button onClick={() => engineRef.current?.prevYear()} aria-label="Предыдущий год">◀ Год</button>
                <button onClick={() => engineRef.current?.nextYear()} aria-label="Следующий год">Год ▶</button>
                <input className="hb-scrub" id="scrub" aria-label="Перемотка по годам" type="range" min={0} max={pos.span} step={1 / 12} value={Math.min(pos.t, pos.span)}
                  onChange={e => { engineRef.current?.seek(Number(e.target.value)); setPos({ t: Number(e.target.value), span: pos.span }); }} />
                <select id="tempo" aria-label="Темп" value={speed} onChange={e => setSpeed(Number(e.target.value))}>
                  <option value={0.6}>5 с/год</option>
                  <option value={1}>3 с/год</option>
                  <option value={2}>1,5 с/год</option>
                  <option value={4}>0,7 с/год</option>
                </select>
                <button className={smart ? "on" : ""} aria-pressed={smart} onClick={() => setSmart(v => !v)} title="Умный темп: годы без событий быстрее, с событиями — медленнее">Умный темп</button>
                <select aria-label="Длина ролика" value={clipLen} onChange={e => setClipLen(Number(e.target.value))} title="Длина ролика">
                  <option value={15}>Ролик 15 с</option><option value={30}>Ролик 30 с</option><option value={60}>Ролик 60 с</option>
                </select>
                <button className="hb-clip" onClick={startClip} disabled={rec === "on" || rec === "prep"} title="Записать вертикальный ролик для сторис">● Запись</button>
              </div>
            </div>
          </>
        )}
      </div>

      {screen === "start" ? (
        <section className="card">
          <form onSubmit={e => { e.preventDefault(); launch(draft); }} noValidate className="quick">
            <div className="grid2">
              <label>Ник на звезде<input id="q-name" type="text" maxLength={16} placeholder="Например, Дима" value={draft.name} onChange={e => upd({ name: e.target.value })} /></label>
              <label>Возраст<input id="q-age" type="number" min={19} max={80} value={draftAge || ""} onChange={e => upd({ birth: NOW_YEAR - Number(e.target.value) })} /></label>
              <div className="lab">Пол
                <div className="seg" role="radiogroup" aria-label="Пол">
                  <button type="button" role="radio" aria-checked={draft.sex === "m"} className={draft.sex === "m" ? "on" : ""} onClick={() => upd({ sex: "m" })}>Мужской</button>
                  <button type="button" role="radio" aria-checked={draft.sex === "f"} className={draft.sex === "f" ? "on" : ""} onClick={() => upd({ sex: "f" })}>Женский</button>
                </div>
              </div>
              <label>Страна, где живёшь и работаешь<select id="q-country" value={draft.country} onChange={e => upd({ country: e.target.value as CountryCode })}>{COUNTRY_ORDER.map(c => <option key={c} value={c}>{COUNTRIES[c].name}</option>)}</select></label>
              <label className="span2">Доход в месяц до налогов, {cur}<input id="q-income" type="number" min={0} step={1000} value={draft.income || ""} placeholder="0" onChange={e => upd({ income: Number(e.target.value) })} /></label>
              <div className="lab">Семья
                <div className="seg">
                  <button type="button" className={draft.marriedAt === null ? "on" : ""} onClick={() => upd({ marriedAt: null })}>Не в браке</button>
                  <button type="button" className={draft.marriedAt !== null ? "on" : ""} onClick={() => upd({ marriedAt: draft.marriedAt ?? Math.max(draft.startAge, Math.min(draftAge, 27)) })}>В браке</button>
                </div>
              </div>
              {draft.marriedAt !== null ? (
                <label>Во сколько лет свадьба<input id="q-married" type="number" min={16} max={draftAge} value={draft.marriedAt || ""} onChange={e => upd({ marriedAt: Number(e.target.value) })} /></label>
              ) : <div />}
              <label>Дети<select id="q-kids" value={draft.kidsAt.length} onChange={e => { const n = Number(e.target.value); upd({ kidsAt: Array.from({ length: n }, (_, i) => draft.kidsAt[i] ?? 0) }); }}>{[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n === 0 ? "Нет" : n}</option>)}</select></label>
              {draft.kidsAt.length > 0 ? (
                <div className="lab">Тебе было лет, когда родились дети
                  <div className="row tight">{draft.kidsAt.map((k, i) => (
                    <input key={i} id={`q-kid${i}`} aria-label={`Возраст при рождении ребёнка ${i + 1}`} type="number" min={16} max={draftAge} value={k || ""} placeholder={`${i + 1}-й`} onChange={e => upd({ kidsAt: draft.kidsAt.map((q, j) => j === i ? Number(e.target.value) : q) })} />
                  ))}</div>
                </div>
              ) : <div />}
              <label>Начать путь с возраста<select id="q-start" value={draft.startAge} onChange={e => upd({ startAge: Number(e.target.value) })}>{[18, 20, 22, 25].map(a => <option key={a} value={a}>{years(a)}</option>)}</select></label>
              <label>С чего начинал(а)<select id="q-kind" value={draft.startKind} onChange={e => upd({ startKind: e.target.value })}>{START_KINDS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
            </div>
            <div className="lab">Цвет звезды
              <div className="swatches" role="radiogroup" aria-label="Цвет звезды">
                {STAR_COLORS.map(([c, n]) => <button key={c} type="button" role="radio" aria-checked={draft.color === c} aria-label={n} title={n} className={draft.color === c ? "sw on" : "sw"} style={{ color: c }} onClick={() => upd({ color: c })} />)}
              </div>
            </div>
            <div className="lab">Форма звезды
              <div className="seg">{STYLES.map(([v, t]) => <button key={v} type="button" className={draft.style === v ? "on" : ""} onClick={() => upd({ style: v })}>{t}</button>)}</div>
            </div>
            {err && <p className="err">{err}</p>}
            <div className="controls">
              <button type="submit" className="primary big">Зажечь мою звезду</button>
              <button type="button" onClick={() => { setInput(EXAMPLE); setMode("me"); setScreen("race"); }}>Посмотреть пример</button>
            </div>
            <p className="est">Данные остаются только в твоём браузере. Подробный путь по годам можно добавить после старта.</p>
          </form>
        </section>
      ) : (
        <>
          <ul className="legend">{spec?.racers.map((r, i) => <li key={i}><span className="dot" style={{ color: r.color }} />{r.full}</li>)}</ul>

          {mode === "me" ? (
            <div className="card slim">
              <div className="k">Звёзд в гонке: {starCount} из {MAX_STARS}</div>
              <div className="chips">
                <button className={future ? "chip on" : "chip"} aria-pressed={future} onClick={() => setFuture(v => !v)}>Прогноз: продолжить путь до пенсии</button>
              </div>
              <div className="k">Средний человек другой страны</div>
              <div className="chips">{COUNTRY_ORDER.filter(c => c !== input.country).map(c => <button key={c} className={input.compare.includes(c) ? "chip on" : "chip"} aria-pressed={input.compare.includes(c)} onClick={() => toggleCompare(c)}>{COUNTRIES[c].name}</button>)}</div>
              <p className="est">Медиана делится на два пути: «вуз» и «работа с 18» — по доле поступающих и разнице зарплат с высшим и без (≈ модель). Свадьба, дети, взросление детей и пенсия — по средним цифрам страны. Твои дети в 18 лет отделяются в свою звезду.</p>
            </div>
          ) : (
            <div className="card slim">
              <div className="k">Какие страны в гонке · выбрано {worldCodes.length}, в кадре {Math.min(worldK, worldCodes.length)}</div>
              <div className="chips">{PRESETS.map(p => <button key={p.id} className={preset === p.id ? "chip on" : "chip"} aria-pressed={preset === p.id} onClick={() => { setPreset(p.id); setWorldCodes(p.codes.filter(c => WORLD[c])); }}>{p.name}</button>)}</div>
              <div className="chips">{[5, 10, 15].map(k => <button key={k} className={worldK === k ? "chip on" : "chip"} aria-pressed={worldK === k} onClick={() => setWorldK(k)}>Топ-{k} в кадре</button>)}</div>
              <form className="row" onSubmit={e => { e.preventDefault(); addWorld(search); }}>
                <label className="wide">Добавить страну<input id="world-search" list="world-list" type="text" value={search} placeholder="Начни вводить: Япония, Турция…" onChange={e => setSearch(e.target.value)} /></label>
                <datalist id="world-list">{WORLD_CODES.filter(c => !worldCodes.includes(c)).map(c => <option key={c} value={countryName(c)} />)}</datalist>
                <button type="submit">Добавить</button>
              </form>
              {worldCodes.length <= 40 && <div className="chips">{worldCodes.map(c => <button key={c} className="chip on" onClick={() => { if (worldCodes.length > 2) { setWorldCodes(w => w.filter(x => x !== c)); setPreset(""); } }} aria-label={`Убрать ${countryName(c)}`}>{countryName(c)} ✕</button>)}</div>}
              <p className="est">Стран — сколько угодно; на экране летят только первые {worldK}. Когда страна поднимается в топ, её звезда влетает и выбивает ту, что опустилась. Данные — Всемирный банк: ВВП в текущих долларах ÷ население, {WORLD_Y0}–{WORLD_Y1}, страны с населением от 1 млн.</p>
            </div>
          )}

          <details className="card">
            <summary>Семья и друзья в гонке</summary>
            <p className="est">Самый простой путь — ссылка: нажми «Скопировать ссылку-приглашение» и отправь её в мессенджер. Человек откроет ссылку и выберет, кто ты для него. Чтобы его звезда появилась у тебя, пусть пришлёт свою ссылку в ответ. Родственники летят по календарным годам: мама в 2010 году — рядом с тобой в 2010-м; твоя звезда отделяется от родительской. Друзья — по возрасту: кто где был в 25 лет. В ссылке и коде нет сумм дохода — только уровни.</p>
            {!isExample && (
              <div className="row">
                <button type="button" className="primary" onClick={copyInvite}>Скопировать ссылку-приглашение</button>
                {linkCopied && <span className="ok">{linkCopied}</span>}
              </div>
            )}
            <div className="chips">{REL_LABELS.map(([k, t]) => <button key={k} type="button" className={rel === k ? "chip on" : "chip"} aria-pressed={rel === k} onClick={() => setRel(k)}>{t}</button>)}</div>
            <div className="row">
              <label className="wide">Или вставь код звезды<input id="friend-code" type="text" value={friendCode} onChange={e => setFriendCode(e.target.value)} placeholder="ЗВЕЗДА-…" /></label>
              <button type="button" onClick={addFriend}>Добавить</button>
            </div>
            <fieldset className="manual">
              <legend>Близкий без кода — например, бабушка или ушедший родитель</legend>
              <div className="row">
                <label>Имя<input type="text" maxLength={16} value={man.name} placeholder="Бабушка Зина" onChange={e => setMan(m => ({ ...m, name: e.target.value }))} /></label>
                <label>Год рождения<input type="number" min={1900} max={NOW_YEAR} value={man.birth || ""} onChange={e => setMan(m => ({ ...m, birth: Number(e.target.value) }))} /></label>
                <label>Кто это<select value={man.rel} onChange={e => setMan(m => ({ ...m, rel: e.target.value as Rel }))}>{REL_LABELS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
                <label>Светлая память, год (если нужно)<input type="number" min={1900} max={NOW_YEAR} value={man.gone} placeholder="—" onChange={e => setMan(m => ({ ...m, gone: e.target.value }))} /></label>
                <button type="button" onClick={addManual}>Добавить</button>
              </div>
              <p className="est">Путь такого близкого рисуется по средним данным страны. В год памяти его звезда бережно поднимается и становится маленьким созвездием рядом с вами.</p>
            </fieldset>
            {friendErr && <p className="err">{friendErr}</p>}
            {friends.length > 0 && (
              <ul className="friends">{friends.map((f, i) => (
                <li key={i}><span className="dot" style={{ color: spec?.racers.find(r => r.short === f.n)?.color ?? FRIEND_COLORS[i % FRIEND_COLORS.length] }} />{f.n} · {relName(f.r)}, {years(NOW_YEAR - f.b)}, {COUNTRIES[f.c]?.name}
                  <label className="gone">{f.r && f.r !== "friend" ? "Светлая память, год" : "Пути разошлись, год"}<input type="number" min={f.b + 1} max={NOW_YEAR} value={f.gone ?? ""} placeholder="—" onChange={e => setGone(i, e.target.value)} /></label>
                  <button type="button" className="ghost" aria-label={`Убрать ${f.n}`} onClick={() => setFriends(fr => fr.filter((_, k) => k !== i))}>✕</button></li>
              ))}</ul>
            )}
            {!isExample && (
              <div className="row">
                <button type="button" className="primary" onClick={copyMyCode}>Скопировать код моей звезды</button>
                {copied && <span className="ok">Код скопирован — отправь его другу.</span>}
              </div>
            )}
            {myCode && !copied && <label>Скопируй код вручную (выдели всё и скопируй)<input id="my-code" type="text" readOnly value={myCode} onFocus={e => e.currentTarget.select()} /></label>}
          </details>

          {!isExample && (
            <details className="card">
              <summary>Подробный путь по годам (по желанию)</summary>
              <p className="est">Если заполнить периоды, звезда пойдёт точно по ним. Доход в прошлом указывай по сравнению с типичной зарплатой в стране в те годы.</p>
              {detailEditor()}
            </details>
          )}

          <details className="card">
            <summary>Откуда цифры</summary>
            <p className="est">Пенсионный возраст: {RETIRE_SOURCES.map((x, i) => <span key={i}>{i > 0 && " · "}<a href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a></span>)}. Высшее образование: {EDU_SOURCES.map((x, i) => <span key={i}>{i > 0 && " · "}<a href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a></span>)}. Гонка стран: <a href="https://github.com/datasets/gdp" target="_blank" rel="noopener noreferrer">ВВП</a> и <a href="https://github.com/datasets/population" target="_blank" rel="noopener noreferrer">население</a> — выгрузки Всемирного банка.</p>
            <p className="est">Основа — официальная медианная зарплата: половина работников получает меньше, половина больше. Разброс — из разницы средней и медианной зарплаты (для США — из децилей); модель логнормального распределения. Перевод между странами — по паритету покупательной способности Всемирного банка. Возрастной профиль: {AGE_SOURCE_NOTE}</p>
            <div className="tablebox">
              <table>
                <thead><tr><th>Страна</th><th>Медиана</th><th>Женщины к мужчинам</th><th>ППС, за 1 $</th><th>Зарплаты для сравнения</th><th>Источники</th></tr></thead>
                <tbody>{COUNTRY_ORDER.map(code => {
                  const c = COUNTRIES[code];
                  return (
                    <tr key={code}>
                      <td>{c.name}</td>
                      <td className="num">{c.median.toLocaleString("ru-RU")} {c.cur}<br /><span className="est">{c.period}</span></td>
                      <td className="num">{Math.round(c.femaleToMale * 1000) / 10}%</td>
                      <td className="num">{c.ppp.toLocaleString("ru-RU")}</td>
                      <td className="est">{c.wagesNote}</td>
                      <td>{c.sources.map((s, i) => <span key={i}>{i > 0 && " · "}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></span>)}{c.estimated && <span className="est"> · ≈ {c.estimated}</span>}{c.life?.note && <span className="est"> · {c.life.note}</span>}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );

  function detailEditor() {
    const d = input;
    const set = (patch: Partial<LifeInput>) => setInput(s => ({ ...s, ...patch }));
    return (
      <div className="quick">
        <fieldset>
          <legend>Периоды</legend>
          {d.periods.map((p, i) => (
            <div className="item" key={i}>
              <label>С возраста<input id={`pf${i}`} type="number" min={16} value={p.from || ""} onChange={e => set({ periods: d.periods.map((q, k) => k === i ? { ...q, from: Number(e.target.value) } : q) })} /></label>
              <label>До<input id={`pt${i}`} type="number" min={16} value={p.to || ""} onChange={e => set({ periods: d.periods.map((q, k) => k === i ? { ...q, to: Number(e.target.value) } : q) })} /></label>
              <label>Что делал(а)<select id={`ps${i}`} value={p.status} onChange={e => set({ periods: d.periods.map((q, k) => k === i ? { ...q, status: e.target.value as LifeInput["periods"][number]["status"] } : q) })}>{STATUS_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
              <label className="wide">Доход тогда<select id={`pi${i}`} value={p.inc} onChange={e => set({ periods: d.periods.map((q, k) => k === i ? { ...q, inc: e.target.value } : q) })}>{INCOME_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
              <button type="button" className="ghost" aria-label="Удалить период" onClick={() => set({ periods: d.periods.filter((_, k) => k !== i) })}>✕</button>
            </div>
          ))}
          <div><button type="button" className="ghost" onClick={() => set({ periods: [...d.periods, { from: d.startAge, to: d.startAge + 2, status: "work", inc: "1" }] })}>+ Добавить период</button></div>
        </fieldset>
        <fieldset>
          <legend>Другие события</legend>
          {d.events.map((ev, i) => (
            <div className="item" key={i}>
              <label>В возрасте<input id={`ea${i}`} type="number" min={16} value={ev.age || ""} onChange={e => set({ events: d.events.map((q, k) => k === i ? { ...q, age: Number(e.target.value) } : q) })} /></label>
              <label className="wide">Событие<select id={`et${i}`} value={ev.type} onChange={e => set({ events: d.events.map((q, k) => k === i ? { ...q, type: e.target.value as EventType } : q) })}>{(Object.keys(EVENT_LABELS) as EventType[]).filter(t => !["wedding", "child", "kidout", "split", "retire"].includes(t)).map(t => <option key={t} value={t}>{EVENT_LABELS[t]}</option>)}</select></label>
              <button type="button" className="ghost" aria-label="Удалить событие" onClick={() => set({ events: d.events.filter((_, k) => k !== i) })}>✕</button>
            </div>
          ))}
          <div><button type="button" className="ghost" onClick={() => set({ events: [...d.events, { age: Math.min(path.age, d.startAge + 5), type: "promo" }] })}>+ Добавить событие</button></div>
        </fieldset>
        <p className="est">Изменения сразу перезапускают гонку. Свадьбу и детей меняй через «Изменить» на экране гонки.</p>
      </div>
    );
  }
}
