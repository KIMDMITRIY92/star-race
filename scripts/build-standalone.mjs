// Собирает один HTML-файл (dist/star-race.html) из того же кода, что и сайт.
// Запуск: npm run build:standalone
import { build } from "esbuild";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const res = await build({
  entryPoints: ["src/standalone/main.tsx"],
  bundle: true, minify: true, write: false, format: "iife", target: "es2020",
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '""', "process.env.NEXT_PUBLIC_SUPABASE_KEY": '""', "process.env.NEXT_PUBLIC_TG_APP": '""' },
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = readFileSync("src/app/globals.css", "utf8");
const html = `<title>Звёздная гонка</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700&family=Manrope:wght@400;500;700&display=swap">
<style>${css}</style>
<div id="root"></div>
<script>${js}</script>
`;
mkdirSync("dist", { recursive: true });
writeFileSync("dist/star-race.html", html);
console.log("Готово: dist/star-race.html,", Math.round(html.length / 1024), "КБ");
