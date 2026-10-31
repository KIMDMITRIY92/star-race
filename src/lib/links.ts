// Короткие ссылки-приглашения (Supabase) и Telegram Mini App.
// Ключ — публикуемый (publishable): его можно держать в браузере, база открыта только через две функции
// star_link_create / star_link_get, прямой доступ к таблице закрыт (RLS без политик).
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://oivdloxlrxvsutyfgvsu.supabase.co";
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_N7XTy7Q9yE-mySI8cRnzOQ_kLUYeYzB";
// Главное Mini App бота: https://t.me/StarLife2026_bot?startapp=<id> (можно переопределить переменной в Vercel).
export const TG_APP = process.env.NEXT_PUBLIC_TG_APP || "https://t.me/StarLife2026_bot";

async function rpc<T>(fn: string, body: object): Promise<T | null> {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    clearTimeout(t);
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

export const SHORT_ID = /^[a-z2-9]{7}$/;
export const createShort = (code: string) => rpc<string>("star_link_create", { p_code: code });
export const resolveShort = async (id: string) => (SHORT_ID.test(id) ? rpc<string>("star_link_get", { p_id: id }) : null);

// Ссылка для отправки: внутри Telegram — на Mini App, иначе — на сайт.
export function shortUrl(id: string, base: string, inTelegram: boolean) {
  if (inTelegram && TG_APP) return `${TG_APP}?startapp=${id}`;
  const u = new URL(base); u.hash = ""; u.search = ""; u.searchParams.set("s", id); return u.toString();
}

// ---------- Telegram ----------
type TgWebApp = {
  ready(): void; expand(): void; setHeaderColor?(c: string): void; setBackgroundColor?(c: string): void;
  initDataUnsafe?: { start_param?: string }; openTelegramLink?(url: string): void; platform?: string;
};
declare global { interface Window { Telegram?: { WebApp?: TgWebApp } } }

export const isTelegram = () => typeof window !== "undefined" && (/tgWebApp/.test(location.hash + location.search) || !!window.Telegram?.WebApp?.initDataUnsafe?.start_param);

// Подключаем скрипт Telegram только внутри Telegram; возвращаем start_param (id короткой ссылки).
export function initTelegram(): Promise<string | null> {
  if (typeof window === "undefined" || !/tgWebApp/.test(location.hash + location.search)) return Promise.resolve(null);
  return new Promise(res => {
    const done = () => {
      const w = window.Telegram?.WebApp; if (!w) { res(null); return; }
      try { w.ready(); w.expand(); w.setHeaderColor?.("#050816"); w.setBackgroundColor?.("#050816"); } catch { /* старый клиент */ }
      res(w.initDataUnsafe?.start_param ?? null);
    };
    if (window.Telegram?.WebApp) { done(); return; }
    const s = document.createElement("script"); s.src = "https://telegram.org/js/telegram-web-app.js";
    s.onload = done; s.onerror = () => res(null); document.head.appendChild(s);
  });
}

// Поделиться ссылкой: в Telegram — окно выбора чата, иначе — системное «Поделиться» или копирование.
export async function shareLink(url: string, text: string): Promise<"tg" | "share" | "copy" | "fail"> {
  const w = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
  if (w?.openTelegramLink && isTelegram()) { w.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`); return "tg"; }
  try { if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) { await navigator.share({ url, text }); return "share"; } } catch { /* отмена */ }
  try { await navigator.clipboard.writeText(url); return "copy"; } catch { return "fail"; }
}
