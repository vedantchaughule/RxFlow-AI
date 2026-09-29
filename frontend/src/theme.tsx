import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ColorMode = 'light' | 'dark' | 'system';
type ThemeContextValue = { mode: ColorMode; setMode: (mode: ColorMode) => void; applyBrand: (primary?: string, accent?: string) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);
const key = 'rxflow:color-mode';

function effective(mode: ColorMode) { return mode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode; }
function valid(value?: string) { return Boolean(value && /^#[0-9a-f]{6}$/i.test(value)); }

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setStoredMode] = useState<ColorMode>(() => (localStorage.getItem(key) as ColorMode) || 'system');
  const setMode = (next: ColorMode) => { localStorage.setItem(key, next); setStoredMode(next); };
  useEffect(() => {
    const apply = () => { document.documentElement.dataset.theme = effective(mode); };
    apply(); const mq = matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', apply); return () => mq.removeEventListener('change', apply);
  }, [mode]);
  const value = useMemo(() => ({ mode, setMode, applyBrand: (primary?: string, accent?: string) => {
    if (valid(primary)) document.documentElement.style.setProperty('--brand', primary!);
    if (valid(accent)) document.documentElement.style.setProperty('--accent', accent!);
  } }), [mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() { const context = useContext(ThemeContext); if (!context) throw new Error('ThemeProvider missing'); return context; }
export function isValidHex(value: string) { return /^#[0-9a-fA-F]{6}$/.test(value); }
