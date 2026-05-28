import { useEffect, useState } from "react";

/**
 * Theme persistence + application.
 *
 * The app's tokens are defined under `@theme` (default dark) and re-pointed by
 * a `.light` class in `theme.css`. So toggling = swap `dark` ↔ `light` on
 * `<html>`. To avoid a flash of the default theme on reload, the initial class
 * is applied by the inline script in `index.html` before React mounts; this
 * hook owns the runtime toggle + cross-tab sync.
 */
export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "lifecoach.theme";

const readStored = (): Theme => {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
};

const applyToDocument = (theme: Theme): void => {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
};

export const useTheme = (): { theme: Theme; setTheme: (t: Theme) => void } => {
  const [theme, setThemeState] = useState<Theme>(readStored);

  // Cross-tab sync: if the user toggles in another window, follow it here too.
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== THEME_STORAGE_KEY) return;
      const next: Theme = e.newValue === "light" ? "light" : "dark";
      setThemeState(next);
      applyToDocument(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = (next: Theme): void => {
    setThemeState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    applyToDocument(next);
  };

  return { theme, setTheme };
};
