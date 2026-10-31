"use client";
// Гонка работает только в браузере (canvas и localStorage), поэтому без серверного рендера.
import dynamic from "next/dynamic";

const StarRace = dynamic(() => import("./StarRace"), {
  ssr: false,
  loading: () => <div className="wrap"><p className="lead">Зажигаем звёзды…</p></div>,
});

export default function StarRaceClient() {
  return <StarRace />;
}
