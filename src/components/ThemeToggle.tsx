"use client";

import { useEffect, useState } from "react";

type ThemePreference = "system" | "light" | "dark";

const storageKey = "society-manager-theme";

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  const resolvedTheme =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;

  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = preference;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>("system");

  useEffect(() => {
    const storedTheme =
      (window.localStorage.getItem(storageKey) as ThemePreference | null) ??
      "system";

    setTheme(storedTheme);
    applyTheme(storedTheme);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (storedTheme === "system") {
        applyTheme("system");
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const updateTheme = (nextTheme: ThemePreference) => {
    setTheme(nextTheme);
    window.localStorage.setItem(storageKey, nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <div className="print:hidden fixed right-5 top-5 z-50 rounded-full border border-gray-200 bg-white/90 px-3 py-2 shadow-md backdrop-blur">
      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
        Theme
        <select
          value={theme}
          onChange={(e) => updateTheme(e.target.value as ThemePreference)}
          className="rounded-full border border-gray-200 bg-transparent px-3 py-1 text-xs font-semibold text-gray-700 outline-none"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
    </div>
  );
}
