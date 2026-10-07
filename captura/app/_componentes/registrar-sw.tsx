"use client";

import { useEffect } from "react";
import { sincronizar } from "@/lib/sync";

export function RegistrarSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    void sincronizar();
    const alVolverLaRed = () => void sincronizar();
    window.addEventListener("online", alVolverLaRed);
    return () => window.removeEventListener("online", alVolverLaRed);
  }, []);
  return null;
}
