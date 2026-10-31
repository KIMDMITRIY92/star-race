// Движок «Звёздной гонки» — 3D на Three.js (WebGL).
// Звёзды летят вглубь космоса, высота — уровень. Камера идёт следом, как в кино.
// Слои: туманность-шейдер → поток звёзд → направляющие уровней → следы → звёзды → эффекты → свечение (bloom).
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

export type EventType =
  | "wedding" | "child" | "promo" | "biz" | "move" | "jobloss" | "hard" | "study" | "retire" | "divorce" | "kidout" | "split";

export interface RaceEvent { age: number; type: EventType; label: string; note?: string }

export type StarStyle = "classic" | "radiant" | "comet";

export interface Racer {
  short: string;
  full: string;
  color: string;
  hero?: boolean;
  style?: StarStyle;
  values: number[];
  events: RaceEvent[];
  lanes?: (number | null)[];   // режим «места»: место в строю по годам (null — вне кадра)
  value?: (v: number) => string; // подпись значения у звезды (иначе axis.labelOf)
  join?: { parent: number; t: number; text?: string }; // звезда рождается из другой (ребёнок, развилка пути) в момент t
  until?: { t: number; kind: "memory" | "apart"; text: string }; // memory — звезда становится созвездием-памятью; apart — пути разошлись
}

export interface Band { from: number; name: string }

export interface AxisSpec {
  kind: "levels" | "log";
  min: number;
  max: number;
  bands?: Band[];
  ticks?: { v: number; label: string }[];
  labelOf: (v: number) => string;
}

export interface Crisis { age: number; text: string }

export interface RaceSpec {
  racers: Racer[];
  axis: AxisSpec;
  crises: Crisis[];
  startAge: number;
  yearOfAge?: (age: number) => number | null;
  secPerYear?: number;
  title?: string;
  formation?: "lanes" | "ranks"; // ranks — строй-клин по местам, звёзды обгоняют и выбивают друг друга
  slots?: number;                 // сколько мест в строю
  dropReason?: string;            // подпись удара при падении без своей причины
  nowT?: number;                  // после этого момента — прогноз (звёзды светят мягче)
}

// ---------- константы сцены ----------
const ZY = 14;          // единиц глубины на один год
const HMAX = 12;        // высота верхней границы шкалы
const SAMPLE = 0.03;    // шаг следа, лет
const INTRO = 2.8;
const EVENT_JOBLOSS = "Потеря работы";
const JOIN = 0.9;       // сколько лет новая звезда отделяется от родительской
const ease = (x: number) => x * x * (3 - 2 * x);
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

// ---------- текстуры в высоком разрешении (без пикселей) ----------
function glowTexture(size = 256) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.12, "rgba(255,255,255,0.85)");
  g.addColorStop(0.3, "rgba(255,255,255,0.32)"); g.addColorStop(0.6, "rgba(255,255,255,0.08)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function flareTexture(rays: number, size = 512) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const x = c.getContext("2d")!, h = size / 2;
  x.translate(h, h);
  for (let k = 0; k < rays; k++) {
    x.save(); x.rotate((k * Math.PI * 2) / rays);
    const len = k % 2 && rays === 8 ? h * 0.55 : h;
    const g = x.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, "rgba(255,255,255,0.95)"); g.addColorStop(0.25, "rgba(255,255,255,0.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.beginPath(); x.moveTo(0, -2.2); x.lineTo(len, 0); x.lineTo(0, 2.2); x.closePath(); x.fill();
    x.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function ringTexture(size = 256) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const x = c.getContext("2d")!, h = size / 2;
  const g = x.createRadialGradient(h, h, h * 0.62, h, h, h * 0.8);
  g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,0.85)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function streakTexture() {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 64;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 1024, 0);
  g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,0.9)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 1024, 64);
  const v = x.createLinearGradient(0, 0, 0, 64);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(0.5, "rgba(0,0,0,1)"); v.addColorStop(1, "rgba(0,0,0,0)");
  x.globalCompositeOperation = "destination-in"; x.fillStyle = v; x.fillRect(0, 0, 1024, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- шейдеры ----------
const NEBULA_VERT = /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const NEBULA_FRAG = /* glsl */`
precision highp float; varying vec3 vDir; uniform float uTime; uniform float uRed;
float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float v=0.0; float a=0.5; for(int i=0;i<6;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
void main(){
  vec3 d = vDir; float t = uTime*0.004;
  float n1 = fbm(d*2.2 + vec3(t,0.0,-t));
  float n2 = fbm(d*4.5 + vec3(-t*1.3, t, 0.0) + n1*1.6);
  float band = exp(-pow((d.y*0.9 + d.x*0.35)*3.2, 2.0));
  vec3 col = vec3(0.012,0.016,0.045);
  col += vec3(0.30,0.12,0.62) * smoothstep(0.45,0.95,n2) * 0.55;
  col += vec3(0.04,0.38,0.52) * smoothstep(0.5,1.0,fbm(d*3.1+7.0+n1)) * 0.45;
  col += vec3(0.55,0.10,0.38) * smoothstep(0.62,1.0,n1*n2*1.6) * 0.5;
  col += vec3(0.42,0.40,0.75) * band * smoothstep(0.35,0.9,n2) * 0.35;
  col = vec3(0.012,0.016,0.045) + (col - vec3(0.012,0.016,0.045)) * 0.72;
  col = mix(col, col*vec3(1.6,0.45,0.35) + vec3(0.12,0.01,0.0), uRed*0.7);
  gl_FragColor = vec4(col, 1.0);
}`;

const STARS_VERT = /* glsl */`
attribute float aSize; attribute vec3 aColor; attribute float aPhase;
uniform float uCamZ; uniform float uTime; uniform float uWarp; uniform float uPix;
varying vec3 vColor; varying float vTw;
void main(){
  vec3 p = position;
  p.z = uCamZ - 420.0 + mod(p.z - uCamZ + 420.0, 470.0);
  vec4 mv = modelViewMatrix * vec4(p,1.0);
  gl_PointSize = aSize * uPix * (1.0 + uWarp*1.5) * (260.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
  vColor = aColor; vTw = 0.65 + 0.35*sin(uTime*2.0 + aPhase);
}`;
const STARS_FRAG = /* glsl */`
varying vec3 vColor; varying float vTw;
void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a = a*a;
  gl_FragColor = vec4(vColor * vTw, a); }`;

const PART_VERT = /* glsl */`
attribute float aSize; attribute vec3 aColor; attribute float aAlpha; uniform float uPix;
varying vec3 vColor; varying float vAlpha;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = aSize * uPix * (300.0 / -mv.z); gl_Position = projectionMatrix * mv;
  vColor = aColor; vAlpha = aAlpha; }`;
const PART_FRAG = /* glsl */`
varying vec3 vColor; varying float vAlpha;
void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a = a*a*vAlpha;
  if (a < 0.003) discard; gl_FragColor = vec4(vColor * (1.0 + a), a); }`;

// ---------- состояние ----------
type StarState = {
  group: THREE.Group; glow: THREE.Sprite; core: THREE.Sprite; flare?: THREE.Sprite; streak?: THREE.Sprite;
  label: CSS2DObject; levelEl: HTMLDivElement;
  trailWide: Line2; trailCore: Line2; samples: THREE.Vector3[];
  fired: Set<number>; sats: THREE.Sprite[]; partner: THREE.Sprite | null; comet: boolean;
  pulse: number; fog: THREE.Sprite | null; fogLife: number; color: THREE.Color; style?: StarStyle;
  kOff: THREE.Vector3; kVel: THREE.Vector3;   // отброс звезды после удара метеорита
  grad: THREE.Sprite | null; retired: boolean; baseColor: THREE.Color; shown: boolean; joined: boolean;
  gone: boolean; memo: THREE.Sprite[];
};
type Particle = { p: THREE.Vector3; v: THREE.Vector3; life: number; decay: number; size: number; c: THREE.Color; drag: number; g: number };
type Meteor = { i: number; mesh: THREE.Mesh; from: THREE.Vector3; t0: number; hit: boolean; spin: THREE.Vector3; reason?: string };
type Impact = { i: number; t: number; reason: string; fired: boolean };
// Манёвр траектории: плавный «горб» (уклон), резкий толчок (удар) или спираль (рождение ребёнка).
type Maneuver = { t0: number; kind: "bump" | "jolt" | "spiral"; ax: number; ay: number; w: number };
const METEOR_FLIGHT = 0.14;   // полёт метеорита до удара, лет игрового времени
type Popup = { obj: CSS2DObject; life: number };
type Rock = { mesh: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3 };
type FX = { mesh: THREE.Mesh | THREE.Sprite; life: number; decay: number; grow: number; follow?: number };

export class RaceEngine {
  private renderer: THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private nebula: THREE.Mesh;
  private nebulaMat: THREE.ShaderMaterial;
  private starsMat: THREE.ShaderMaterial;
  private guides = new THREE.Group();
  private world = new THREE.Group();
  private tex: { glow: THREE.Texture; flare4: THREE.Texture; flare8: THREE.Texture; streak: THREE.Texture; ring: THREE.Texture };
  private partGeo: THREE.BufferGeometry;
  private partMat: THREE.ShaderMaterial;
  private particles: Particle[] = [];
  private MAXP = 2500;
  private rockGeo: THREE.BufferGeometry;
  private rockMat: THREE.MeshStandardMaterial;
  private W = 1; private H = 1; private dpr = 1;
  private spec: RaceSpec | null = null;
  private stars: StarState[] = [];
  private span = 1;
  private t = 0;
  private playing = false;
  private speed = 1;
  private smart = false;
  private slow = 0;
  private intro = 0;
  private outro = 0;
  private shake = 0;
  private warp = 0;
  private red = 0;
  private fovKick = 0;
  private stopAt: number | null = null;
  private crisisFired = new Set<number>();
  private meteors: Meteor[] = [];
  private impacts: Impact[] = [];
  private moves: Maneuver[][] = [];
  private swaps: { k: number; inI: number; outI: number; fired: boolean }[] = []; // новичок выбивает выбывающего
  private via = new Map<string, number>();  // `${i}:${k}` → кого выбивает входящая звезда
  private order: number[] = [];
  private popups: Popup[] = [];
  private cruise = 0;     // «бесконечный полёт»: путь вперёд после финиша и на паузе, в годах
  private rocks: Rock[] = [];
  private fx: FX[] = [];
  private clock = 0;
  private last = 0;
  private raf = 0;
  private lastTickT = -1;
  private lane = 9;
  private reduce: boolean;
  private camPos = new THREE.Vector3(0, 8, 30);
  private camLook = new THREE.Vector3(0, 5, -20);

  onEvent?: (racer: Racer, ev: RaceEvent) => void;
  onCrisis?: (text: string) => void;
  onFinish?: () => void;
  onPlayChange?: (playing: boolean) => void;
  onTick?: (t: number, span: number) => void;
  onFlash?: (color: string, strength: number) => void;
  onBars?: (on: boolean) => void;
  onIntro?: () => void;
  onImpact?: (racer: Racer, reason: string) => void;
  onOvertake?: (a: Racer, b: Racer) => void;
  onReplace?: (incoming: Racer, outgoing: Racer) => void;
  onJoin?: (r: Racer) => void;
  onLeave?: (r: Racer) => void;
  onRendered?: () => void;      // после каждого кадра — для записи ролика

  get canvas() { return this.renderer.domElement; }
  // Подписи звёзд в долях экрана (0..1) — ролик рисует их сам, потому что подписи сцены — это HTML поверх холста.
  labelsForVideo() {
    const out: { x: number; y: number; name: string; level: string; color: string; hero: boolean }[] = [];
    if (!this.spec) return out;
    const v = new THREE.Vector3();
    this.stars.forEach((s, i) => {
      if (!s.group.visible || !s.label.visible) return;
      v.copy(s.group.position).project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return;
      const r = this.spec!.racers[i];
      out.push({ x: (v.x + 1) / 2, y: (1 - v.y) / 2, name: r.short, level: s.levelEl.textContent ?? "", color: r.color, hero: !!r.hero });
    });
    return out;
  }

  constructor(private host: HTMLElement) {
    this.reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "gl";
    host.appendChild(this.renderer.domElement);
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = "labels";
    host.appendChild(this.labelRenderer.domElement);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 2000);
    this.scene.fog = new THREE.FogExp2(0x050816, 0.0065);
    this.tex = { glow: glowTexture(), flare4: flareTexture(4), flare8: flareTexture(8), streak: streakTexture(), ring: ringTexture() };

    this.nebulaMat = new THREE.ShaderMaterial({ vertexShader: NEBULA_VERT, fragmentShader: NEBULA_FRAG, side: THREE.BackSide, depthWrite: false, uniforms: { uTime: { value: 0 }, uRed: { value: 0 } } });
    this.nebula = new THREE.Mesh(new THREE.SphereGeometry(1200, 48, 32), this.nebulaMat);
    this.nebula.renderOrder = -10;
    this.scene.add(this.nebula);

    const N = 5000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
    const palette = [new THREE.Color("#dfe6ff"), new THREE.Color("#ffe6c4"), new THREE.Color("#c4dcff"), new THREE.Color("#ead4ff")];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 320; pos[i * 3 + 1] = (Math.random() - 0.35) * 160; pos[i * 3 + 2] = Math.random() * 470;
      const c = palette[i % palette.length]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      size[i] = Math.random() < 0.04 ? 3.2 + Math.random() * 2 : 0.8 + Math.random() * 1.4; phase[i] = Math.random() * 6.28;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    sg.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    sg.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    sg.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    this.starsMat = new THREE.ShaderMaterial({ vertexShader: STARS_VERT, fragmentShader: STARS_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uCamZ: { value: 0 }, uTime: { value: 0 }, uWarp: { value: 0 }, uPix: { value: 1 } } });
    const pts = new THREE.Points(sg, this.starsMat); pts.frustumCulled = false; this.scene.add(pts);

    this.scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x1a0a20, 0.55));
    const key = new THREE.DirectionalLight(0xffe2c4, 1.4); key.position.set(30, 40, 20); this.scene.add(key);

    this.partGeo = new THREE.BufferGeometry();
    this.partGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.MAXP * 3), 3));
    this.partGeo.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(this.MAXP * 3), 3));
    this.partGeo.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(this.MAXP), 1));
    this.partGeo.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(this.MAXP), 1));
    this.partMat = new THREE.ShaderMaterial({ vertexShader: PART_VERT, fragmentShader: PART_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uPix: { value: 1 } } });
    const pp = new THREE.Points(this.partGeo, this.partMat); pp.frustumCulled = false; this.scene.add(pp);

    const rg = new THREE.IcosahedronGeometry(1, 3), rp = rg.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
    for (let i = 0; i < rp.count; i++) {
      v.fromBufferAttribute(rp, i);
      const n = Math.sin(v.x * 3.1) * Math.cos(v.y * 2.7) * Math.sin(v.z * 3.7) * 0.22 + Math.sin(v.x * 7 + v.z * 5) * 0.06;
      v.multiplyScalar(1 + n); rp.setXYZ(i, v.x, v.y * 0.85, v.z);
    }
    rg.computeVertexNormals(); this.rockGeo = rg;
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x4a3c44, roughness: 0.92, metalness: 0.05, emissive: 0x3a0c04, emissiveIntensity: 0.6, flatShading: true });

    this.guides.visible = false; // уровни показывает экранный высотомер, в космосе линий нет
    this.scene.add(this.guides);
    this.scene.add(this.world);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.5, 0.3);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.clearWorld();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
  }

  resize() {
    const r = this.host.getBoundingClientRect();
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.W, this.H);
    this.labelRenderer.setSize(this.W, this.H);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(this.W, this.H);
    this.bloom.resolution.set(this.W / 2, this.H / 2);
    this.camera.aspect = this.W / this.H;
    this.camera.updateProjectionMatrix();
    const pix = this.dpr * Math.min(1.4, Math.max(0.7, this.H / 700));
    this.starsMat.uniforms.uPix.value = pix; this.partMat.uniforms.uPix.value = pix;
    // ширина дорожек под экран: на узком экране звёзды ближе друг к другу
    const visW = 2 * 30 * Math.tan(THREE.MathUtils.degToRad(26)) * this.camera.aspect;
    this.lane = Math.min(9.5, visW * 0.29);
    this.stars.forEach(s => { s.trailWide.material.resolution.set(this.W, this.H); s.trailCore.material.resolution.set(this.W, this.H); });
    if (this.spec) { this.rebuildGuides(); this.rebuildTrails(); }
  }

  // ---------- управление ----------
  load(spec: RaceSpec, autoplay = true) {
    this.spec = spec;
    this.span = Math.max(1, ...spec.racers.map(r => r.values.length - 1));
    this.clearWorld();
    this.stars = spec.racers.map(r => this.makeStar(r));
    this.impacts = this.findImpacts(spec);
    this.moves = this.buildManeuvers(spec);
    this.buildSwaps(spec);
    this.rebuildGuides();
    this.restart(autoplay && !this.reduce);
    if (this.reduce) this.seek(this.span);
  }

  private buildSwaps(spec: RaceSpec) {
    this.swaps = []; this.via.clear();
    if (spec.formation !== "ranks") return;
    const n = Math.max(...spec.racers.map(r => r.lanes?.length ?? 0)) - 1;
    for (let k = 0; k < n; k++) {
      const ins = spec.racers.map((r, i) => (r.lanes?.[k] == null && r.lanes?.[k + 1] != null ? i : -1)).filter(i => i >= 0);
      const outs = spec.racers.map((r, i) => (r.lanes?.[k] != null && r.lanes?.[k + 1] == null ? i : -1)).filter(i => i >= 0);
      ins.forEach((inI, q) => { const outI = outs[q]; if (outI === undefined) return; this.via.set(`${inI}:${k}`, outI); this.swaps.push({ k, inI, outI, fired: false }); });
    }
  }

  // Падение уровня = удар метеорита: так видно, ПОЧЕМУ звезда пошла вниз.
  private findImpacts(spec: RaceSpec): Impact[] {
    const out: Impact[] = [];
    spec.racers.forEach((r, i) => {
      for (let k = 0; k < r.values.length - 1; k++) {
        const a = r.values[k], b = r.values[k + 1];
        const drop = spec.axis.kind === "log" ? (a - b) / a > 0.05 : a - b > 3.5;
        if (!drop) continue;
        const age = spec.startAge + k;
        if (r.join && k < r.join.t + 1) continue;
        // своё событие уже объясняет падение (потеря работы, трудный год)
        if (r.events.some(e => (e.type === "jobloss" || e.type === "hard") && e.age >= age - 0.5 && e.age <= age + 1.5)) continue;
        const c = spec.crises.find(x => x.age >= age - 0.2 && x.age <= age + 1.2);
        out.push({ i, t: k + 0.05, reason: c ? c.text : spec.dropReason ?? "спад дохода", fired: false });
      }
    });
    return out;
  }

  restart(play = true) {
    if (!this.spec) return;
    this.cruise = 0;
    this.impacts.forEach(m => (m.fired = false));
    this.stopAt = null; this.t = 0; this.slow = 0; this.shake = 0; this.warp = 0; this.red = 0; this.outro = 0; this.fovKick = 0;
    this.intro = this.reduce || !this.spec.title ? 0 : INTRO;
    if (this.intro > 0) this.onIntro?.();
    this.swaps.forEach(w => (w.fired = false)); this.order = [];
    this.crisisFired = new Set();
    this.clearEffects();
    this.stars.forEach(s => this.resetStar(s));
    this.rebuildTrails();
    this.setPlaying(play);
    this.onBars?.(false);
  }

  toggle() {
    this.stopAt = null;
    if (this.t >= this.span) { this.restart(true); return; }
    this.setPlaying(!this.playing);
  }
  setSpeed(s: number) { this.speed = s; }
  setSmartTempo(on: boolean) { this.smart = on; }
  isFinished() { return this.t >= this.span; }
  getSpan() { return this.span; }
  getIntro() { return this.intro; }

  nextYear() {
    if (!this.spec || this.t >= this.span) return;
    this.intro = 0;
    this.stopAt = Math.min(this.span, Math.floor(this.t + 1e-6) + 1);
    this.setPlaying(true);
  }
  prevYear() {
    if (!this.spec) return;
    this.stopAt = null; this.setPlaying(false);
    this.seek(Math.max(0, Math.ceil(this.t - 1e-6) - 1));
  }

  seek(t: number) {
    if (!this.spec) return;
    this.intro = 0; this.outro = 0; this.slow = 0; this.shake = 0; this.warp = 0; this.red = 0;
    this.t = Math.min(this.span, Math.max(0, t));
    this.cruise = 0;
    this.impacts.forEach(m => (m.fired = m.t <= this.t));
    this.swaps.forEach(w => (w.fired = w.k + 0.55 <= this.t)); this.order = [];
    this.clearEffects();
    const sp = this.spec, age = sp.startAge + this.t;
    this.crisisFired = new Set(sp.crises.map((c, k) => (c.age <= age ? k : -1)).filter(k => k >= 0));
    this.stars.forEach((s, i) => {
      this.resetStar(s);
      const jn = sp.racers[i].join; if (jn && jn.t <= this.t) s.joined = true;
      const un = sp.racers[i].until; if (un && un.t <= this.t) { if (un.kind === "memory") this.setMemory(s); else s.gone = true; }
      sp.racers[i].events.forEach((e, k) => {
        if (e.age - 0.35 <= age) {
          s.fired.add(k);
          if (e.type === "child") this.addSat(s);
          if (e.type === "kidout") this.dropSat(s);
          if (e.type === "wedding") this.addPartner(s);
          if (e.type === "divorce" && s.partner) { s.group.remove(s.partner); s.partner = null; }
          if (e.type === "biz") s.comet = true;
          if (e.type === "study") this.addGrad(s, !!sp.racers[i].hero);
          if (e.type === "retire") this.setRetired(s, true);
        }
      });
    });
    this.rebuildTrails();
    this.onBars?.(false);
    this.onTick?.(this.t, this.span);
    if (this.t >= this.span) { this.outro = 1; this.setPlaying(false); this.onFinish?.(); }
  }

  private setPlaying(p: boolean) { this.playing = p; this.onPlayChange?.(p); }

  // ---------- геометрия ----------
  private valueAt(r: Racer, tt: number) {
    const v = r.values, n = v.length - 1;
    if (tt >= n) return v[n];
    const i = Math.max(0, Math.floor(tt)), f = tt - i;
    return v[i] + (v[i + 1] - v[i]) * ease(f);
  }
  private yOf(v: number) {
    const a = this.spec!.axis;
    let k: number;
    if (a.kind === "log") k = (Math.log(Math.max(v, a.min)) - Math.log(a.min)) / (Math.log(a.max) - Math.log(a.min));
    else k = (v - a.min) / (a.max - a.min);
    return Math.min(1, Math.max(0, k)) * HMAX;
  }
  private laneX(i: number) {
    const n = this.spec!.racers.length;
    return n === 1 ? 0 : -this.lane + (2 * this.lane * i) / (n - 1);
  }
  private posOf(i: number, tt: number, out = new THREE.Vector3()): THREE.Vector3 {
    const r = this.spec!.racers[i];
    if (r.join && tt < r.join.t + JOIN) { // новая звезда отделяется от родительской и уходит на свою дорожку
      const own = this.ownPos(i, tt), par = this.posOf(r.join.parent, tt), e = ease(Math.max(0, (tt - r.join.t) / JOIN));
      return out.copy(par).lerp(own, e);
    }
    return this.ownPos(i, tt, out);
  }
  private ownPos(i: number, tt: number, out = new THREE.Vector3()): THREE.Vector3 {
    const r = this.spec!.racers[i];
    if (r.until && tt > r.until.t) { // память поднимается выше и замирает; «пути разошлись» — звезда уходит в сторону
      const u = r.until, base = this.ownPosRaw(i, tt, out), q = ease(Math.min(1, (tt - u.t) / (u.kind === "memory" ? 2 : 1.5)));
      const vy = this.yOf(this.valueAt(r, Math.min(u.t, r.values.length - 1))) - this.yOf(this.valueAt(r, Math.min(tt, r.values.length - 1)));
      if (u.kind === "memory") return base.set(base.x, base.y + vy + 2.6 * q, base.z);
      const side = this.laneX(i) >= 0 ? 1 : -1;
      return base.set(base.x + side * this.lane * 1.8 * q, base.y + vy + 1.2 * q, base.z + 8 * q);
    }
    return this.ownPosRaw(i, tt, out);
  }
  private ownPosRaw(i: number, tt: number, out = new THREE.Vector3()) {
    const r = this.spec!.racers[i];
    const [dx, dy] = this.drift(i, tt + this.cruise);
    const y = this.yOf(this.valueAt(r, Math.min(tt, r.values.length - 1))) + dy, z = -(tt + this.cruise) * ZY;
    if (!r.lanes) return out.set(this.laneX(i) + dx, y, z);
    const st = this.rankState(i, tt);
    return out.set(st.x + dx * 0.6, y + st.dy, z + st.dz);
  }

  // Строй-клин: 1-е место впереди по центру, остальные — по бокам и чуть позади.
  private slot(rank: number): [number, number] {
    const K = this.spec!.slots ?? 10, half = Math.max(1, Math.ceil((K - 1) / 2));
    if (rank === 0) return [0, 0];
    const side = rank % 2 ? -1 : 1, step = Math.ceil(rank / 2);
    return [side * step * ((this.lane * 1.15) / half), step * 3.2];
  }
  private rankState(i: number, tt: number): { x: number; dz: number; dy: number; vis: boolean; tr?: boolean } {
    const L = this.spec!.racers[i].lanes!, n = L.length - 1;
    const k = Math.min(n, Math.max(0, Math.floor(tt))), f = tt >= n ? 0 : tt - k;
    const a = L[k], b = k < n ? L[k + 1] : L[k];
    if (a != null && (b != null || f === 0)) {
      const [x0, z0] = this.slot(a), [x1, z1] = b != null ? this.slot(b) : [x0, z0], e = ease(f);
      return { x: x0 + (x1 - x0) * e, dz: z0 + (z1 - z0) * e, dy: 0, vis: true, tr: true };
    }
    if (a == null && b != null) { // влетает новичок
      const [tx, tz] = this.slot(b), side = tx >= 0 ? 1 : -1;
      const fx = tx + side * this.lane * 1.9, fz = tz + 55, fy = 7;
      const j = this.via.get(`${i}:${k}`);
      if (j !== undefined && f < 0.55) { // летит прямо в выбывающего
        const ja = this.spec!.racers[j].lanes![k]!; const [vx, vz] = this.slot(ja); const p = Math.pow(f / 0.55, 1.6);
        const yv = this.yOf(this.valueAt(this.spec!.racers[j], tt)) - this.yOf(this.valueAt(this.spec!.racers[i], tt));
        return { x: fx + (vx - fx) * p, dz: fz + (vz - fz) * p, dy: fy * (1 - p) + yv * p, vis: true };
      }
      if (j !== undefined) { const ja = this.spec!.racers[j].lanes![k]!; const [vx, vz] = this.slot(ja); const p = ease((f - 0.55) / 0.45);
        const yv = this.yOf(this.valueAt(this.spec!.racers[j], tt)) - this.yOf(this.valueAt(this.spec!.racers[i], tt));
        return { x: vx + (tx - vx) * p, dz: vz + (tz - vz) * p, dy: yv * (1 - p), vis: true }; }
      const p = easeOut(f);
      return { x: fx + (tx - fx) * p, dz: fz + (tz - fz) * p, dy: fy * (1 - p), vis: true };
    }
    if (a != null && b == null) { // выбывает: стоит до удара, затем улетает за кадр
      const [sx, sz] = this.slot(a), side = sx >= 0 ? 1 : -1;
      if (f < 0.55) return { x: sx, dz: sz, dy: 0, vis: true };
      const q = (f - 0.55) / 0.45;
      return { x: sx + side * this.lane * 2.6 * q, dz: sz + 34 * q * q, dy: -5 * q, vis: q < 0.98 };
    }
    return { x: 0, dz: 0, dy: 0, vis: false };
  }
  // след рисуем только в строю: влёт и вылет — без хвоста, чтобы не было «паутины»
  private trailAt(i: number, tt: number) { const r = this.spec!.racers[i]; return this.visibleAt(i, tt) && (!r.lanes || !!this.rankState(i, tt).tr); }
  private visibleAt(i: number, tt: number) { const r = this.spec!.racers[i]; if (r.join && tt < r.join.t) return false;
    if (r.until?.kind === "apart" && tt > r.until.t + 1.5) return false; return !r.lanes || this.rankState(i, tt).vis; }

  // Траектория никогда не прямая: лёгкое «дыхание» жизни + манёвры на событиях. Функция детерминированная —
  // след, перемотка и повтор рисуют один и тот же путь.
  private drift(i: number, tt: number): [number, number] {
    const ph = i * 1.7 + 0.4, gap = this.spec!.racers.length > 1 ? (2 * this.lane) / (this.spec!.racers.length - 1) : 4;
    const amp = this.spec!.formation === "ranks" ? 0.4 : Math.min(0.55, gap * 0.12);
    let x = amp * (Math.sin(tt * 1.15 + ph) * 0.65 + Math.sin(tt * 2.6 + ph * 2.3) * 0.35);
    let y = 0.12 * Math.sin(tt * 1.9 + ph * 1.3);
    for (const m of this.moves[i] ?? []) {
      const d = tt - m.t0;
      if (m.kind === "bump") { const g = Math.exp(-(d * d) / (m.w * m.w)); x += m.ax * g; y += m.ay * g; }
      else if (m.kind === "jolt") { if (d > 0) { const e = (d / m.w) * Math.exp(1 - d / m.w); x += m.ax * e; y += m.ay * e; } }
      else if (d > 0 && d < m.w * 3) { const a = (d / m.w) * Math.PI * 2, fade = Math.sin((d / (m.w * 3)) * Math.PI); x += Math.cos(a) * m.ax * fade; y += Math.sin(a) * m.ay * fade; }
    }
    return [x, y];
  }

  private buildManeuvers(spec: RaceSpec) {
    const rnd = (k: number) => { const v = Math.sin(k * 12.9898) * 43758.5453; return v - Math.floor(v); };
    return spec.racers.map((r, i) => {
      const list: Maneuver[] = [];
      const side = (k: number) => (rnd(i * 31 + k) > 0.5 ? 1 : -1);
      r.events.forEach((e, k) => {
        const t0 = e.age - spec.startAge;
        switch (e.type) {
          case "wedding": list.push({ t0, kind: "bump", ax: 1.4 * side(k), ay: 0.35, w: 0.7 }); break;      // разворот навстречу паре
          case "child": list.push({ t0, kind: "spiral", ax: 0.9, ay: 0.6, w: 0.35 }); break;              // виток вокруг новой звезды
          case "move": list.push({ t0, kind: "bump", ax: 2.6 * side(k), ay: 0.2, w: 0.9 }); break;        // перелёт на другую траекторию
          case "biz": list.push({ t0, kind: "bump", ax: 1.6 * side(k), ay: 0.5, w: 0.6 }); break;         // рывок в сторону
          case "promo": list.push({ t0, kind: "bump", ax: 0.8 * side(k), ay: 0.6, w: 0.45 }); break;
          case "study": list.push({ t0, kind: "bump", ax: 0.6 * side(k), ay: 0.3, w: 0.4 }); break;
          case "hard": list.push({ t0, kind: "bump", ax: 1.0 * side(k), ay: -0.6, w: 1.0 }); break;       // шатает весь трудный год
          case "jobloss": list.push({ t0: t0 - 0.35 + METEOR_FLIGHT, kind: "jolt", ax: 2.4 * (this.laneX(i) >= 0 ? 1 : -1), ay: -1.1, w: 0.3 }); break;
        }
      });
      // удар метеорита при падении уровня — отбрасывает наружу от центра
      this.impacts.filter(m => m.i === i).forEach(m => list.push({ t0: m.t + METEOR_FLIGHT, kind: "jolt", ax: 2.0 * (this.laneX(i) >= 0 ? 1 : -1), ay: -0.9, w: 0.3 }));
      // кризисы и мировые события: каждая звезда уворачивается от астероидов
      spec.crises.forEach((c, k) => list.push({ t0: c.age - spec.startAge + 0.15, kind: "bump", ax: (1.2 + rnd(i + k * 7) * 1.2) * side(100 + k), ay: (rnd(i * 3 + k) - 0.5) * 0.8, w: 0.45 }));
      return list;
    });
  }
  private heroIndex() { return Math.max(0, this.spec?.racers.findIndex(r => r.hero) ?? 0); }

  // ---------- объекты ----------
  private additive(map: THREE.Texture, color: THREE.Color | number | string, opacity = 1) {
    return new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity, fog: false });
  }

  private makeStar(r: Racer): StarState {
    const color = new THREE.Color(r.color);
    const group = new THREE.Group();
    const add = (map: THREE.Texture, scale: number, c: THREE.Color | number, op = 1) => { const s = new THREE.Sprite(this.additive(map, c, op)); s.scale.setScalar(scale); group.add(s); return s; };
    const glow = add(this.tex.glow, r.hero ? 3.8 : 2.1, color, r.hero ? 0.9 : 0.7);
    const core = add(this.tex.glow, r.hero ? 1.3 : 0.8, 0xffffff, 1);
    let flare: THREE.Sprite | undefined, streak: THREE.Sprite | undefined;
    if (r.hero) {
      flare = add(r.style === "radiant" ? this.tex.flare8 : this.tex.flare4, 6, color, 0.7);
      streak = add(this.tex.streak, 1, color, 0.42); streak.scale.set(13, 0.4, 1);
    }
    this.world.add(group);

    const labelEl = document.createElement("div"); labelEl.className = r.hero ? "slabel hero" : this.spec!.racers.length > 8 ? "slabel mini" : "slabel";
    const nameEl = document.createElement("div"); nameEl.className = "sname"; nameEl.textContent = r.short; nameEl.style.color = r.color;
    const levelEl = document.createElement("div"); levelEl.className = "slevel";
    labelEl.append(nameEl, levelEl);
    const label = new CSS2DObject(labelEl); label.center.set(0.5, 1.35); group.add(label);

    const mk = (width: number, op: number) => {
      const g = new LineGeometry(); g.setPositions([0, 0, 0, 0, 0, -0.01]); g.setColors([0, 0, 0, 0, 0, 0]);
      const m = new LineMaterial({ linewidth: width, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: op, worldUnits: false });
      m.resolution.set(this.W, this.H);
      const l = new Line2(g, m); l.frustumCulled = false; this.world.add(l); return l;
    };
    const trailWide = mk(r.hero ? 10 : 6, r.hero ? 0.22 : 0.14);
    const trailCore = mk(r.hero ? 2.8 : 1.7, r.hero ? 1 : 0.75);
    return { group, glow, core, flare, streak, label, levelEl, trailWide, trailCore, samples: [], fired: new Set(), sats: [], partner: null, comet: r.style === "comet", pulse: 0, fog: null, fogLife: 0, color, style: r.style, kOff: new THREE.Vector3(), kVel: new THREE.Vector3(), grad: null, retired: false, baseColor: color.clone(), shown: true, joined: false, gone: false, memo: [] };
  }

  private resetStar(s: StarState) {
    s.samples = []; s.fired = new Set(); s.pulse = 0; s.kOff.set(0, 0, 0); s.kVel.set(0, 0, 0);
    s.sats.forEach(x => s.group.remove(x)); s.sats = [];
    if (s.partner) { s.group.remove(s.partner); s.partner = null; }
    if (s.fog) { s.group.remove(s.fog); s.fog = null; }
    s.comet = s.style === "comet"; s.joined = false;
    if (s.gone) { s.gone = false; s.memo.forEach(m => s.group.remove(m)); s.memo = []; (s.glow.material as THREE.SpriteMaterial).color.copy(s.baseColor); }
    if (s.grad) { s.group.remove(s.grad); s.grad = null; }
    this.setRetired(s, false);
  }
  private addGrad(s: StarState, hero: boolean) {
    if (s.grad) return;
    s.grad = new THREE.Sprite(this.additive(this.tex.ring, "#ffe08a", 0.55)); s.grad.scale.setScalar(hero ? 3.4 : 2.4); s.group.add(s.grad);
  }
  // пенсия: звезда становится тёплой, янтарной и чуть мягче
  private setRetired(s: StarState, on: boolean) {
    s.retired = on;
    (s.glow.material as THREE.SpriteMaterial).opacity = on ? 0.5 : (s.flare ? 0.9 : 0.7);
    (s.core.material as THREE.SpriteMaterial).opacity = on ? 0.75 : 1;
    const c = on ? new THREE.Color("#ffb066") : s.baseColor;
    (s.glow.material as THREE.SpriteMaterial).color.copy(c);
    if (s.flare) (s.flare.material as THREE.SpriteMaterial).color.copy(c);
    if (s.streak) (s.streak.material as THREE.SpriteMaterial).color.copy(c);
    s.color.copy(c);
  }
  private addSat(s: StarState) { const sp = new THREE.Sprite(this.additive(this.tex.glow, 0xffffff)); sp.scale.setScalar(0.9); s.group.add(sp); s.sats.push(sp); }
  // созвездие-память: звезда становится мягкой и светлой, рядом загораются несколько маленьких звёзд
  private setMemory(s: StarState) {
    if (s.gone) return; s.gone = true;
    (s.glow.material as THREE.SpriteMaterial).color.set("#d6e4ff");
    [[1.4, 0.9], [-1.2, 1.3], [0.4, 2.1], [-0.6, -0.9], [1.9, -0.4]].forEach(([x, y]) => {
      const sp = new THREE.Sprite(this.additive(this.tex.glow, "#e8efff", 0.8)); sp.scale.setScalar(0.45); sp.position.set(x, y, 0); s.group.add(sp); s.memo.push(sp);
    });
  }
  private dropSat(s: StarState) { const x = s.sats.pop(); if (x) s.group.remove(x); }
  private addPartner(s: StarState) {
    if (s.partner) return;
    s.partner = new THREE.Sprite(this.additive(this.tex.glow, "#ff9ec7")); s.partner.scale.setScalar(1.6); s.group.add(s.partner);
  }

  private clearWorld() {
    this.clearEffects();
    this.stars.forEach(s => {
      this.world.remove(s.group, s.trailWide, s.trailCore);
      s.label.element.remove();
      s.trailWide.geometry.dispose(); s.trailCore.geometry.dispose();
      s.trailWide.material.dispose(); s.trailCore.material.dispose();
    });
    this.stars = [];
  }
  private clearEffects() {
    this.meteors.forEach(m => this.world.remove(m.mesh)); this.meteors = [];
    this.rocks.forEach(r => this.world.remove(r.mesh)); this.rocks = [];
    this.fx.forEach(f => this.world.remove(f.mesh)); this.fx = [];
    this.popups.forEach(p => { this.world.remove(p.obj); p.obj.element.remove(); }); this.popups = [];
    this.particles = [];
  }

  // направляющие уровней: светящиеся линии по бокам дороги и подписи у левого края
  private rebuildGuides() {
    for (const c of [...this.guides.children]) {
      this.guides.remove(c);
      if (c instanceof CSS2DObject) c.element.remove();
      else if (c instanceof THREE.Line) c.geometry.dispose();
    }
    const a = this.spec!.axis;
    const marks: { y: number; label: string; line: boolean }[] = [];
    if (a.kind === "levels" && a.bands) a.bands.forEach((b, i) => {
      const y0 = this.yOf(b.from), y1 = i < a.bands!.length - 1 ? this.yOf(a.bands![i + 1].from) : HMAX;
      if (i > 0) marks.push({ y: y0, label: "", line: true });
      marks.push({ y: (y0 + y1) / 2, label: b.name, line: false });
    });
    else a.ticks?.forEach(tk => marks.push({ y: this.yOf(tk.v), label: tk.label, line: true }));
    const xEdge = this.lane + 3.4;
    const mat = new THREE.LineBasicMaterial({ color: 0x8a98d8, transparent: true, opacity: 0.2, depthWrite: false });
    for (const m of marks) {
      if (m.line) for (const x of [-xEdge, xEdge]) {
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, m.y, 70), new THREE.Vector3(x, m.y, -450)]);
        this.guides.add(new THREE.Line(g, mat));
      }
      if (m.label) {
        const el = document.createElement("div"); el.className = "glabel"; el.textContent = m.label;
        const o = new CSS2DObject(el); o.position.set(-xEdge, m.y, 0); o.center.set(1, 0.5);
        this.guides.add(o);
      }
    }
  }

  private rebuildTrails() {
    if (!this.spec) return;
    this.stars.forEach((s, i) => {
      const end = Math.min(this.t, this.spec!.racers[i].values.length - 1);
      s.samples = [];
      for (let q = 0; q <= end + 1e-9; q += SAMPLE) { if (this.trailAt(i, q)) s.samples.push(this.posOf(i, q)); else s.samples = []; }
      this.updateTrail(s);
    });
  }
  private updateTrail(s: StarState) {
    const n = s.samples.length;
    if (n < 2) { s.trailWide.visible = s.trailCore.visible = false; return; }
    s.trailWide.visible = s.trailCore.visible = true;
    const pos: number[] = [], col: number[] = [];
    const from = Math.max(0, n - (this.spec?.formation === "ranks" ? 110 : 700)); // в гонке стран — короткие хвосты, без «паутины»
    for (let k = from; k < n; k++) {
      const p = s.samples[k], f = Math.pow((k - from) / Math.max(1, n - 1 - from), 1.4);
      pos.push(p.x, p.y, p.z); col.push(s.color.r * f, s.color.g * f, s.color.b * f);
    }
    for (const line of [s.trailWide, s.trailCore]) {
      line.geometry.dispose();
      const g = new LineGeometry(); g.setPositions(pos); g.setColors(col);
      line.geometry = g;
    }
  }

  // ---------- эффекты ----------
  private emit(p: THREE.Vector3, color: string | THREE.Color, n: number, spread: number, size = 0.5, decay = 0.8, g = 0) {
    const k = this.reduce ? Math.round(n / 3) : n, c = color instanceof THREE.Color ? color : new THREE.Color(color);
    for (let i = 0; i < k; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((0.25 + Math.random()) * spread);
      this.particles.push({ p: p.clone(), v, life: 1, decay: decay * (0.7 + Math.random() * 0.6), size: size * (0.5 + Math.random()), c, drag: 0.955, g });
    }
  }
  private ring(p: THREE.Vector3, color: string, grow = 9, decay = 0.9, thick = 0.06) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(1 - thick, 1, 96), m);
    mesh.position.copy(p); mesh.scale.setScalar(0.3); this.world.add(mesh);
    this.fx.push({ mesh, life: 1, decay, grow });
  }
  private flareAt(p: THREE.Vector3, color: string, scale: number, decay: number, grow = 0) {
    const s = new THREE.Sprite(this.additive(this.tex.glow, color)); s.position.copy(p); s.scale.setScalar(scale); this.world.add(s);
    this.fx.push({ mesh: s, life: 1, decay, grow });
  }
  private beam(i: number, color: string) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 60, 24, 1, true), m);
    const p = this.posOf(i, this.t); mesh.position.set(p.x, 30, p.z);
    this.world.add(mesh); this.fx.push({ mesh, life: 1, decay: 0.7, grow: 0, follow: i });
  }

  private fire(i: number, ev: RaceEvent) {
    const r = this.spec!.racers[i], s = this.stars[i], p = this.posOf(i, this.t);
    this.onEvent?.(r, ev);
    if (r.hero && !this.reduce) { this.slow = 1.9; this.onBars?.(true); }
    if (!r.hero) this.popup(i, ev.note ?? ev.label);
    s.pulse = 1;
    switch (ev.type) {
      case "jobloss": this.launchMeteor(i, ev.label); break;
      case "hard": {
        const fog = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color: 0x8e98b8, transparent: true, opacity: 0.6, depthWrite: false, fog: false }));
        fog.scale.setScalar(9); s.group.add(fog); s.fog = fog; s.fogLife = 1;
        this.ring(p, "#8e98b8", 6, 0.6); break;
      }
      case "child":
        this.onFlash?.("#ffffff", 0.3);
        this.ring(p, "#ffffff", 12, 0.85); this.ring(p, r.color, 7, 0.7, 0.03);
        this.emit(p, "#ffffff", 90, 9, 0.55); this.emit(p, r.color, 70, 6, 0.7);
        this.addSat(s); break;
      case "wedding": {
        this.onFlash?.("#ff9ec7", 0.22);
        const k = this.reduce ? 16 : 90, c1 = new THREE.Color("#ff9ec7"), c2 = new THREE.Color("#ffd6ea");
        for (let j = 0; j < k; j++) {
          const side = j % 2 ? 1 : -1, a = (j / k) * Math.PI * 6 * side, d = 8 + (j / k) * 6;
          const off = new THREE.Vector3(Math.cos(a) * d, Math.sin(a) * d * 0.6, Math.sin(a * 0.5) * 4);
          this.particles.push({ p: p.clone().add(off), v: off.clone().multiplyScalar(-1.5), life: 1, decay: 0.85, size: 0.65, c: j % 3 ? c1 : c2, drag: 0.94, g: 0 });
        }
        this.ring(p, "#ff9ec7", 9, 0.8); this.addPartner(s); break;
      }
      case "biz":
        this.onFlash?.(r.color, 0.18);
        this.ring(p, r.color, 13, 0.8, 0.04); this.emit(p, r.color, 80, 12, 0.6); s.comet = true; break;
      case "move":
        this.warp = 1; this.fovKick = 1; this.ring(p, "#6ee7c8", 14, 0.9); this.emit(p, "#6ee7c8", 50, 9); break;
      case "promo":
        this.beam(i, r.color); this.ring(p, r.color, 8, 0.8); this.emit(p, "#fff3c4", 50, 5, 0.5, 0.8, 6); break;
      case "study":
        this.ring(p, "#ffe08a", 7, 0.8, 0.04); this.emit(p, "#ffe08a", 50, 6, 0.5, 0.8, -3); this.addGrad(s, !!r.hero); break;
      case "divorce": {
        if (s.partner) { const pp = p.clone().add(s.partner.position); this.emit(pp, "#ff9ec7", 40, 7, 0.5); s.group.remove(s.partner); s.partner = null; }
        this.ring(p, "#c6a0c8", 7, 0.8, 0.04); break;
      }
      case "kidout": { // ребёнок вырос: спутник отрывается и улетает в свой путь
        this.dropSat(s); this.ring(p, "#ffffff", 9, 0.9, 0.03); this.emit(p, "#ffffff", 50, 8, 0.5); this.flareAt(p, "#ffffff", 3, 1.6, 4); break;
      }
      case "split":
        this.ring(p, "#ffe08a", 10, 0.8, 0.03); this.emit(p, "#ffe08a", 60, 9, 0.5); break;
      case "retire":
        this.ring(p, "#ffb066", 8, 0.6, 0.05); this.emit(p, "#ffcf9a", 40, 4, 0.5, 0.6, 2); this.setRetired(s, true); break;
    }
  }

  private launchMeteor(i: number, reason: string) {
    const p = this.posOf(i, this.t);
    const mesh = new THREE.Mesh(this.rockGeo, this.rockMat); mesh.scale.setScalar(0.8 + Math.random() * 0.3);
    const side = p.x > 0 ? -1 : 1;  // прилетает со стороны центра, чтобы удар был виден
    const from = p.clone().add(new THREE.Vector3(side * (14 + Math.random() * 6), 10 + Math.random() * 4, -60 - Math.random() * 20));
    mesh.position.copy(from); this.world.add(mesh);
    this.meteors.push({ i, mesh, from, t0: this.t, hit: false, spin: new THREE.Vector3(Math.random() * 3, Math.random() * 3, Math.random() * 3), reason });
    if (!this.reduce) { this.slow = Math.max(this.slow, 1.6); this.onBars?.(true); }
  }

  private popup(i: number, text: string) {
    const el = document.createElement("div"); el.className = "impact"; el.textContent = text;
    const o = new CSS2DObject(el); o.center.set(0.5, -0.6);
    o.position.copy(this.posOf(i, this.t)); this.world.add(o);
    this.popups.push({ obj: o, life: 1 });
  }

  private tempo(age: number) {
    if (!this.smart || !this.spec) return 1;
    let d = Infinity;
    for (const r of this.spec.racers) for (const e of r.events) d = Math.min(d, Math.abs(e.age - age));
    for (const c of this.spec.crises) d = Math.min(d, Math.abs(c.age - age));
    return d < 0.7 ? 0.6 : d > 1.5 ? 2 : 1;
  }

  // ---------- шаг времени ----------
  private step(dt: number) {
    const sp = this.spec!;
    const k = this.slow > 0 ? 0.28 : 1;
    const wasSlow = this.slow > 0;
    this.slow = Math.max(0, this.slow - dt);
    if (wasSlow && this.slow === 0 && this.meteors.length === 0) this.onBars?.(false);
    this.t = Math.min(this.span, this.t + (dt / (sp.secPerYear ?? 3)) * this.speed * k * this.tempo(sp.startAge + this.t) * (sp.nowT !== undefined && this.t > sp.nowT ? 1.8 : 1));
    if (this.stopAt !== null && this.t >= this.stopAt) { this.t = this.stopAt; this.stopAt = null; if (this.t < this.span) this.setPlaying(false); }
    const age = sp.startAge + this.t;
    sp.racers.forEach((r, i) => {
      const s = this.stars[i];
      this.sampleTrail(s, i);
      r.events.forEach((e, kk) => { if (!s.fired.has(kk) && age >= e.age - 0.35) { s.fired.add(kk); this.fire(i, e); } });
      if (r.hero && !this.reduce && Math.random() < (s.comet ? 0.95 : 0.5)) {
        this.particles.push({ p: this.posOf(i, this.t), v: new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, 2 + Math.random() * 3), life: 1, decay: s.comet ? 0.55 : 0.9, size: s.comet ? 0.7 : 0.45, c: s.color, drag: 0.985, g: 0 });
      }
    });
    for (const m of this.impacts) if (!m.fired && this.t >= m.t) { m.fired = true; this.launchMeteor(m.i, m.reason); }
    for (const w of this.swaps) if (!w.fired && this.t >= w.k + 0.55) {
      w.fired = true;
      const p = this.posOf(w.outI, this.t);
      this.emit(p, sp.racers[w.inI].color, 70, 12, 0.6); this.emit(p, sp.racers[w.outI].color, 50, 10, 0.5);
      this.ring(p, "#ffffff", 8, 1.1, 0.03); this.flareAt(p, sp.racers[w.inI].color, 6, 1.8, 6);
      if (!this.reduce) this.shake = Math.max(this.shake, 0.5);
      this.onReplace?.(sp.racers[w.inI], sp.racers[w.outI]);
    }
    sp.racers.forEach((r, i) => {
      const s = this.stars[i];
      if (r.join && !s.joined && this.t >= r.join.t) {
        s.joined = true;
        if (this.t - r.join.t > 0.5) return;
        const p = this.posOf(r.join.parent, this.t);
        this.ring(p, r.color, 9, 0.9, 0.04); this.emit(p, r.color, 70, 8, 0.6); this.flareAt(p, r.color, 4, 1.6, 5);
        if (r.join.text) this.popup(i, r.join.text);
        this.onJoin?.(r);
      }
    });
    sp.racers.forEach((r, i) => {
      const s = this.stars[i], u = r.until;
      if (!u || s.gone || this.t < u.t) return;
      const p = this.posOf(i, this.t);
      if (u.kind === "memory") { this.setMemory(s); this.ring(p, "#d6e4ff", 7, 0.45, 0.02); this.emit(p, "#e8efff", 30, 3, 0.4, 0.4, 1.5); }
      else { s.gone = true; this.emit(p, r.color, 25, 4, 0.4, 0.6); }
      this.popup(i, u.text); this.onLeave?.(r);
    });
    this.checkOvertakes();
    sp.crises.forEach((c, kk) => {
      if (!this.crisisFired.has(kk) && age >= c.age) {
        this.crisisFired.add(kk); this.onCrisis?.(c.text);
        if (!this.reduce) { this.slow = 1.7; this.onBars?.(true); }
        this.red = 1;
        const n = this.reduce ? 8 : 34, heroZ = -this.t * ZY;
        for (let j = 0; j < n; j++) {
          const mesh = new THREE.Mesh(this.rockGeo, this.rockMat);
          mesh.scale.setScalar(0.3 + Math.random() * 1.1);
          mesh.position.set((Math.random() - 0.5) * this.lane * 4.5, Math.random() * HMAX * 1.6 - 2, heroZ - 80 - Math.random() * 160);
          this.world.add(mesh);
          this.rocks.push({ mesh, v: new THREE.Vector3((Math.random() - 0.5) * 6, -2 - Math.random() * 3, 45 + Math.random() * 45), spin: new THREE.Vector3(Math.random() * 2, Math.random() * 2, Math.random() * 2) });
        }
      }
    });
  }

  // обгоны: сравниваем порядок звёзд по значению
  private checkOvertakes() {
    const sp = this.spec!;
    const vis = sp.racers.map((_, i) => i).filter(i => this.visibleAt(i, this.t) && (!sp.racers[i].lanes || sp.racers[i].lanes![Math.min(Math.floor(this.t), sp.racers[i].lanes!.length - 1)] != null));
    const now = [...vis].sort((a, b) => this.valueAt(sp.racers[b], this.t) - this.valueAt(sp.racers[a], this.t));
    if (this.order.length) {
      const prevRank = new Map(this.order.map((i, k) => [i, k]));
      let shown = 0;
      for (let k = 1; k < now.length && shown < 2; k++) {
        const a = now[k - 1], b = now[k];
        if (prevRank.has(a) && prevRank.has(b) && prevRank.get(a)! > prevRank.get(b)!) { this.onOvertake?.(sp.racers[a], sp.racers[b]); shown++; }
      }
    }
    this.order = now;
  }

  private sampleTrail(s: StarState, i: number) {
    if (!this.trailAt(i, this.t)) { if (s.samples.length) { s.samples = []; this.updateTrail(s); } return; }
    const cur = this.posOf(i, this.t), last = s.samples[s.samples.length - 1];
    if (!last || last.z - cur.z >= SAMPLE * ZY) { s.samples.push(cur); if (s.samples.length > 900) s.samples.splice(0, s.samples.length - 900); this.updateTrail(s); }
  }

  private animate(dt: number) {
    for (const m of this.meteors) {
      const prog = (this.t - m.t0) / METEOR_FLIGHT + (this.t >= this.span ? 1 : 0);
      const target = this.posOf(m.i, Math.min(this.t, m.t0 + METEOR_FLIGHT)), p = easeOut(Math.min(1, prog));
      m.mesh.position.lerpVectors(m.from, target, p);
      m.mesh.rotation.x += m.spin.x * dt; m.mesh.rotation.y += m.spin.y * dt;
      if (!m.hit && !this.reduce) for (let q = 0; q < 6; q++) this.particles.push({ p: m.mesh.position.clone(), v: new THREE.Vector3(2 + Math.random() * 3, 1.5 + Math.random() * 2, -5 - Math.random() * 6), life: 1, decay: 1.4, size: 0.9 + Math.random() * 0.6, c: new THREE.Color(q % 3 ? "#ff7a40" : "#ffd2a8"), drag: 0.95, g: 0 });
      if (prog >= 1 && !m.hit) {
        m.hit = true; this.world.remove(m.mesh);
        const st = this.stars[m.i], dir = target.clone().sub(m.from).normalize();
        void dir; if (st) st.pulse = 1;
        const r = this.spec?.racers[m.i];
        if (r && m.reason) { this.popup(m.i, `удар: ${m.reason}`); if (!r.hero || m.reason !== EVENT_JOBLOSS) this.onImpact?.(r, m.reason); }
        this.emit(target, "#ff7a40", 110, 13, 0.7); this.emit(target, "#ffd2a8", 60, 8, 0.5);
        this.ring(target, "#ff7a59", 9, 1.0, 0.035); this.ring(target, "#ffffff", 6, 1.2, 0.02);
        this.flareAt(target, "#ff8a50", 12, 1.6, 10);
        this.onFlash?.("#ff6a40", 0.4);
        if (!this.reduce) this.shake = 1.1;
      }
    }
    this.meteors = this.meteors.filter(m => !m.hit);
    for (const r of this.rocks) {
      r.mesh.position.addScaledVector(r.v, dt);
      r.mesh.rotation.x += r.spin.x * dt; r.mesh.rotation.y += r.spin.y * dt; r.mesh.rotation.z += r.spin.z * dt;
    }
    const camZ = this.camera.position.z;
    this.rocks = this.rocks.filter(r => { if (r.mesh.position.z > camZ + 5) { this.world.remove(r.mesh); return false; } return true; });
    for (const f of this.fx) {
      f.life -= dt * f.decay;
      if (f.mesh instanceof THREE.Sprite) { f.mesh.scale.setScalar(f.mesh.scale.x + f.grow * dt); (f.mesh.material as THREE.SpriteMaterial).opacity = Math.max(0, f.life); }
      else {
        const mat = f.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, f.life) * (f.follow !== undefined ? 0.45 : 1);
        if (f.follow !== undefined) { const p = this.posOf(f.follow, this.t); f.mesh.position.x = p.x; f.mesh.position.z = p.z; }
        else { f.mesh.scale.setScalar(f.mesh.scale.x + f.grow * dt * (0.4 + f.life)); f.mesh.quaternion.copy(this.camera.quaternion); }
      }
    }
    this.fx = this.fx.filter(f => { if (f.life <= 0) { this.world.remove(f.mesh); return false; } return true; });
    for (const pp of this.popups) { pp.life -= dt * 0.35; pp.obj.position.y += dt * 0.8; pp.obj.element.style.opacity = String(Math.min(1, pp.life * 2.5)); }
    this.popups = this.popups.filter(pp => { if (pp.life <= 0) { this.world.remove(pp.obj); pp.obj.element.remove(); return false; } return true; });
    for (const q of this.particles) { q.p.addScaledVector(q.v, dt); q.v.multiplyScalar(q.drag); q.v.y += q.g * dt; q.life -= dt * q.decay; }
    this.particles = this.particles.filter(q => q.life > 0);
    if (this.particles.length > this.MAXP) this.particles.splice(0, this.particles.length - this.MAXP);
    const P = this.partGeo.attributes.position as THREE.BufferAttribute, C = this.partGeo.attributes.aColor as THREE.BufferAttribute;
    const S = this.partGeo.attributes.aSize as THREE.BufferAttribute, A = this.partGeo.attributes.aAlpha as THREE.BufferAttribute;
    const n = this.particles.length;
    for (let i = 0; i < n; i++) {
      const q = this.particles[i];
      P.setXYZ(i, q.p.x, q.p.y, q.p.z); C.setXYZ(i, q.c.r, q.c.g, q.c.b); S.setX(i, q.size * 3 * Math.max(0.25, q.life)); A.setX(i, Math.max(0, q.life));
    }
    P.needsUpdate = C.needsUpdate = S.needsUpdate = A.needsUpdate = true;
    this.partGeo.setDrawRange(0, n);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.warp = Math.max(0, this.warp - dt * 1.0);
    this.fovKick = Math.max(0, this.fovKick - dt * 1.2);
    this.red = Math.max(0, this.red - dt * 0.4);
  }

  private updateStars(dt: number) {
    if (!this.spec) return;
    const sp = this.spec;
    this.stars.forEach((s, i) => {
      const r = sp.racers[i];
      // пружина: звезду отбрасывает ударом и она возвращается на свою дорожку
      s.kVel.addScaledVector(s.kOff, -dt * 16); s.kVel.multiplyScalar(Math.max(0, 1 - dt * 4.5)); s.kOff.addScaledVector(s.kVel, dt);
      s.group.position.copy(this.posOf(i, this.t)).add(s.kOff);
      const vis = this.visibleAt(i, this.t);
      if (vis !== s.shown) { s.shown = vis; s.group.visible = vis; }
      const lab = vis && !(r.join && this.t < r.join.t + JOIN * 0.6); // подпись — когда звезда уже отделилась
      if (s.label.visible !== lab) s.label.visible = lab;
      s.pulse = Math.max(0, s.pulse - dt * 0.8);
      const breathe = 1 + Math.sin(this.clock * 3 + i) * 0.06 + s.pulse * 0.5;
      const dim = s.gone && r.until?.kind === "memory" ? 0.6 : s.retired ? 0.72 : 1;  // на пенсии звезда мельче и мягче
      s.glow.scale.setScalar((r.hero ? 3.8 : 2.1) * breathe * dim);
      s.core.scale.setScalar((r.hero ? 1.3 : 0.8) * breathe * dim);
      if (s.flare) { s.flare.scale.setScalar(6 * breathe + s.pulse * 5); (s.flare.material as THREE.SpriteMaterial).rotation = this.clock * 0.25; }
      if (s.streak) s.streak.scale.set(13 * breathe + s.pulse * 8, 0.4, 1);
      s.sats.forEach((x, k) => { const a = -this.clock * 2 + k * 2.1; x.position.set(Math.cos(a) * 1.9, Math.sin(a) * 0.7, Math.sin(a) * 1.9); });
      if (s.partner) { const a = this.clock * 1.4; s.partner.position.set(Math.cos(a) * 1.3, Math.sin(a * 0.7) * 0.4, Math.sin(a) * 1.3); }
      if (s.fog) { s.fogLife = Math.max(0, s.fogLife - dt * 0.25); (s.fog.material as THREE.SpriteMaterial).opacity = 0.6 * s.fogLife; }
      const txt = (r.value ?? sp.axis.labelOf)(this.valueAt(r, this.t)) + (s.retired && !s.gone ? " · на пенсии" : "") + (s.gone && r.until?.kind === "memory" ? " · светлая память" : "") + (sp.nowT !== undefined && this.t > sp.nowT + 0.02 && r.hero ? " · прогноз" : "");
      if (s.levelEl.textContent !== txt) s.levelEl.textContent = txt;
    });
  }

  private updateCamera(dt: number) {
    if (!this.spec) return;
    // своя звезда в фокусе; в режиме «Страны» своей звезды нет — смотрим на центр группы
    const hi = this.spec.racers.findIndex(r => r.hero);
    const visIdx = this.spec.racers.map((_, i) => i).filter(i => this.visibleAt(i, this.t));
    const hero = hi >= 0 ? this.posOf(hi, this.t) : visIdx.reduce((acc, i) => acc.add(this.posOf(i, this.t).multiplyScalar(1 / Math.max(1, visIdx.length))), new THREE.Vector3());
    if (hi < 0 && this.spec.formation === "ranks") { hero.x = 0; hero.z = -(this.t + this.cruise) * ZY + 6; }
    const midY = HMAX * 0.45 + (hero.y - HMAX * 0.45) * 0.35;
    const sway = Math.sin(this.clock * 0.23) * 1.6;
    const want = new THREE.Vector3(sway + hero.x * 0.25, midY + 5.5, hero.z + 30);
    const look = new THREE.Vector3(hero.x * 0.15, midY - 0.5, hero.z - 26);
    if (this.intro > 0) {
      const p = easeOut(1 - this.intro / INTRO);
      want.lerpVectors(new THREE.Vector3(hero.x + 2.2, hero.y + 0.9, hero.z + 5.5), want, p);
      look.lerpVectors(hero, look, p);
    } else if (this.outro > 0) {
      const p = ease(this.outro), a = this.clock * 0.12;
      want.lerp(new THREE.Vector3(hero.x + Math.sin(a) * 24, hero.y + 6, hero.z + Math.cos(a) * 24), p * 0.55);
      look.lerp(hero, p * 0.6);
    }
    const k = this.intro > 0 ? 1 : Math.min(1, dt * 3);
    this.camPos.lerp(want, k); this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake * 0.9, (Math.random() - 0.5) * this.shake * 0.9, 0));
    this.camera.lookAt(this.camLook);
    const fov = 52 + this.fovKick * 14;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.nebula.position.copy(this.camera.position);
    this.guides.position.z = hero.z; // подписи уровней — на глубине звёзд, чтобы совпадали по высоте
  }

  private frame = (now: number) => {
    const dt = Math.min((now - this.last) / 1000, 0.05); this.last = now; this.clock += dt;
    if (this.spec && this.playing && this.intro > 0) this.intro = Math.max(0, this.intro - dt);
    else if (this.spec && this.playing && this.t < this.span) this.step(dt);
    else if (this.spec && this.intro <= 0) {
      // полёт не прекращается: на паузе и после финиша звёзды летят дальше на своей высоте
      this.cruise += (dt / (this.spec.secPerYear ?? 3)) * (this.t >= this.span ? 0.8 : 0.45);
      this.stars.forEach((st, i) => this.sampleTrail(st, i));
    }
    this.animate(dt);
    if (this.spec && this.playing && this.t >= this.span) {
      this.setPlaying(false); this.onTick?.(this.t, this.span); this.onFinish?.(); this.onBars?.(false);
      if (!this.reduce) {
        const i = this.heroIndex(), p = this.posOf(i, this.t), c = this.spec.racers[i].color;
        this.ring(p, c, 16, 0.7, 0.04); this.ring(p, "#ffffff", 10, 0.9, 0.02); this.emit(p, c, 140, 12, 0.7);
        this.onFlash?.(c, 0.28);
      }
    }
    if (this.spec && this.t >= this.span) this.outro = Math.min(1, this.outro + dt * 0.5);
    this.updateStars(dt);
    if (this.spec) this.updateCamera(dt);
    else { // заставка: камера медленно летит сквозь космос
      this.camPos.z -= dt * 9; this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camPos.x, this.camPos.y - 2, this.camPos.z - 60);
      this.nebula.position.copy(this.camera.position);
    }
    this.starsMat.uniforms.uCamZ.value = this.camera.position.z;
    this.starsMat.uniforms.uTime.value = this.clock;
    this.starsMat.uniforms.uWarp.value = this.warp;
    this.nebulaMat.uniforms.uTime.value = this.clock + this.t * 4;
    this.nebulaMat.uniforms.uRed.value = this.red;
    this.bloom.strength = 0.62 + this.warp * 0.45;
    if (this.spec && Math.abs(this.t - this.lastTickT) >= 1 / 24) { this.lastTickT = this.t; this.onTick?.(this.t, this.span); }
    this.composer.render();
    this.labelRenderer.render(this.scene, this.camera);
    this.onRendered?.();
    this.raf = requestAnimationFrame(this.frame);
  };
}
