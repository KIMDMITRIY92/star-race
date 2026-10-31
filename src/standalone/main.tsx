// Точка входа для версии-артефакта: тот же компонент, что и на сайте, без Next.js.
import { createRoot } from "react-dom/client";
import StarRace from "@/components/StarRace";

createRoot(document.getElementById("root")!).render(<StarRace />);
