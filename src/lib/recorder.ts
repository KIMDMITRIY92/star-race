// Ролик 9:16 для сторис: каждый кадр сцены копируется на холст 1080×1920, поверх рисуются год, подписи и лента событий.
// Запись — встроенным MediaRecorder браузера (MP4, где поддерживается, иначе WebM). Сервер не нужен.
import type { RaceEngine } from "./engine";

export interface Overlay {
  title: string; year: string; sub: string; chips: string[];
  feed: { text: string; color: string }[];
  list: { name: string; value: string; color: string }[];
  footer: string; progress: number;
  name: string; color: string; cta: string;   // заставка и финальный кадр
}

export function pickFormat(): { mime: string; ext: "mp4" | "webm" } | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const [mime, ext] of [["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "mp4"], ["video/mp4", "mp4"], ["video/webm;codecs=vp9,opus", "webm"], ["video/webm", "webm"]] as const)
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  return null;
}

const W = 1080, H = 1920;

export class ClipRecorder {
  private cv = document.createElement("canvas");
  private x: CanvasRenderingContext2D;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private fonts: { d: string; b: string };
  readonly format = pickFormat();

  constructor(private eng: RaceEngine, private overlay: () => Overlay) {
    this.cv.width = W; this.cv.height = H;
    this.x = this.cv.getContext("2d")!;
    const rs = getComputedStyle(document.documentElement);
    this.fonts = { d: rs.getPropertyValue("--f-display").trim() || "sans-serif", b: rs.getPropertyValue("--f-body").trim() || "sans-serif" };
  }

  private t0 = 0;
  private endAt = 0;
  start(audio: MediaStream | null) {
    this.t0 = performance.now(); this.endAt = 0;
    if (!this.format) throw new Error("no-recorder");
    const stream = this.cv.captureStream(30);
    audio?.getAudioTracks().forEach(t => stream.addTrack(t));
    this.chunks = [];
    this.rec = new MediaRecorder(stream, { mimeType: this.format.mime, videoBitsPerSecond: 8_000_000 });
    this.rec.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.eng.onRendered = () => this.draw();
    this.rec.start(500);
  }

  stop(): Promise<Blob> {
    this.eng.onRendered = undefined;
    return new Promise(res => {
      if (!this.rec || this.rec.state === "inactive") { res(new Blob(this.chunks, { type: this.format?.mime })); return; }
      this.rec.onstop = () => res(new Blob(this.chunks, { type: this.format!.mime.split(";")[0] }));
      this.rec.stop();
    });
  }

  private draw() {
    const x = this.x, src = this.eng.canvas, o = this.overlay(), { d, b } = this.fonts;
    // сцена «по размеру кадра»: обрезаем края, сохраняя пропорции
    const sw = src.width, sh = src.height, k = Math.max(W / sw, H / sh), dw = sw * k, dh = sh * k, ox = (W - dw) / 2, oy = (H - dh) / 2;
    x.fillStyle = "#050816"; x.fillRect(0, 0, W, H);
    x.drawImage(src, ox, oy, dw, dh);
    const top = x.createLinearGradient(0, 0, 0, 620); top.addColorStop(0, "rgba(5,8,22,0.85)"); top.addColorStop(1, "rgba(5,8,22,0)");
    x.fillStyle = top; x.fillRect(0, 0, W, 620);
    const bot = x.createLinearGradient(0, H - 560, 0, H); bot.addColorStop(0, "rgba(5,8,22,0)"); bot.addColorStop(1, "rgba(5,8,22,0.92)");
    x.fillStyle = bot; x.fillRect(0, H - 560, W, 560);

    // подписи звёзд
    for (const l of this.eng.labelsForVideo()) {
      const px = ox + l.x * dw, py = oy + l.y * dh;
      if (px < 30 || px > W - 30 || py < 640 || py > H - 420) continue;
      x.textAlign = "center"; x.shadowColor = "rgba(0,0,0,0.9)"; x.shadowBlur = 14;
      x.fillStyle = l.color; x.font = `700 ${l.hero ? 40 : 30}px ${b}`; x.fillText(l.name, px, py - (l.hero ? 58 : 42));
      x.fillStyle = "rgba(240,243,252,0.9)"; x.font = `500 ${l.hero ? 30 : 24}px ${b}`; x.fillText(l.level, px, py - (l.hero ? 22 : 14));
      x.shadowBlur = 0;
    }

    // шапка: название, год, чипы, лента
    x.textAlign = "center";
    x.fillStyle = "#9aa3c3"; x.font = `600 30px ${b}`; x.fillText("ЗВЁЗДНАЯ ГОНКА · " + o.title.toUpperCase(), W / 2, 110);
    x.fillStyle = "#ffffff"; x.font = `700 132px ${d}`; x.fillText(o.year, W / 2, 255);
    x.fillStyle = "#c9cfe6"; x.font = `500 34px ${b}`; x.fillText(o.sub, W / 2, 312);
    x.font = `600 30px ${b}`;
    const gap = 16, pads = o.chips.map(c => x.measureText(c).width + 44), total = pads.reduce((a, w) => a + w, 0) + gap * Math.max(0, pads.length - 1);
    let cx = (W - total) / 2;
    o.chips.forEach((c, i) => {
      x.fillStyle = "rgba(10,14,36,0.7)"; x.strokeStyle = "rgba(160,175,230,0.35)"; x.lineWidth = 2;
      x.beginPath(); x.roundRect(cx, 350, pads[i], 56, 28); x.fill(); x.stroke();
      x.fillStyle = "#eef1fb"; x.fillText(c, cx + pads[i] / 2, 389); cx += pads[i] + gap;
    });
    o.feed.slice(0, 3).forEach((f, i) => {
      x.globalAlpha = [1, 0.7, 0.45][i]; x.font = `600 ${[34, 30, 28][i]}px ${b}`;
      const tw = x.measureText(f.text).width;
      x.fillStyle = f.color; x.beginPath(); x.arc(W / 2 - tw / 2 - 22, 470 + i * 50 - 11, 9, 0, 6.283); x.fill();
      x.fillStyle = "#f2f4fb"; x.fillText(f.text, W / 2, 470 + i * 50);
    });
    x.globalAlpha = 1;

    // низ: таблица, прогресс, призыв
    x.textAlign = "left";
    o.list.slice(0, 5).forEach((r, i) => {
      const y = H - 400 + i * 52;
      x.fillStyle = "#9aa3c3"; x.font = `600 28px ${b}`; x.fillText(String(i + 1), 90, y);
      x.fillStyle = r.color; x.beginPath(); x.arc(140, y - 10, 10, 0, 6.283); x.fill();
      x.fillStyle = "#eef1fb"; x.font = `600 32px ${b}`; x.fillText(r.name, 166, y);
      x.textAlign = "right"; x.fillText(r.value, W - 90, y); x.textAlign = "left";
    });
    x.fillStyle = "rgba(255,255,255,0.15)"; x.beginPath(); x.roundRect(90, H - 128, W - 180, 8, 4); x.fill();
    x.fillStyle = "#ffcf5c"; x.beginPath(); x.roundRect(90, H - 128, Math.max(8, (W - 180) * o.progress), 8, 4); x.fill();
    x.textAlign = "center"; x.fillStyle = "#c9cfe6"; x.font = `500 32px ${b}`; x.fillText(o.footer, W / 2, H - 64);

    // заставка: первые 2 секунды
    const age = (performance.now() - this.t0) / 1000;
    if (age < 2.2) {
      const a = age < 1.6 ? 1 : 1 - (age - 1.6) / 0.6;
      x.globalAlpha = Math.max(0, a) * 0.88; x.fillStyle = "#050816"; x.fillRect(0, 0, W, H); x.globalAlpha = Math.max(0, a);
      x.fillStyle = "#9aa3c3"; x.font = `600 34px ${b}`; x.fillText("ЗВЁЗДНАЯ ГОНКА", W / 2, H / 2 - 120);
      x.fillStyle = o.color; x.shadowColor = o.color; x.shadowBlur = 40; x.font = `700 96px ${d}`; x.fillText(o.name, W / 2, H / 2); x.shadowBlur = 0;
      x.fillStyle = "#eef1fb"; x.font = `500 40px ${b}`; x.fillText("мой путь среди миллионов звёзд", W / 2, H / 2 + 80);
      x.globalAlpha = 1;
    }
    // финальный кадр: призыв
    if (o.progress >= 1) {
      if (!this.endAt) this.endAt = performance.now();
      const a = Math.min(1, (performance.now() - this.endAt) / 700);
      x.globalAlpha = a * 0.82; x.fillStyle = "#050816"; x.fillRect(0, 0, W, H); x.globalAlpha = a;
      x.fillStyle = "#ffffff"; x.font = `700 76px ${d}`; x.fillText("А где летит", W / 2, H / 2 - 70); x.fillText("твоя звезда?", W / 2, H / 2 + 20);
      x.fillStyle = "#ffcf5c"; x.font = `600 42px ${b}`; x.fillText(o.cta, W / 2, H / 2 + 130);
      x.globalAlpha = 1;
    }
  }
}
