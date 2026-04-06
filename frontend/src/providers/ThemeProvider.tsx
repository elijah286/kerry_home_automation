"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "default" | "lcars";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "default",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("default");

  useEffect(() => {
    const saved = localStorage.getItem("ha-theme") as Theme | null;
    if (saved === "lcars") {
      setThemeState("lcars");
      document.documentElement.dataset.theme = "lcars";
    }
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    if (t === "lcars") {
      localStorage.setItem("ha-theme", "lcars");
      document.documentElement.dataset.theme = "lcars";
    } else {
      localStorage.removeItem("ha-theme");
      delete document.documentElement.dataset.theme;
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
