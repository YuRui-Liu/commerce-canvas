import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DesktopBridge } from '../../../contracts/src/bridge';
import type { Theme } from '../../../contracts/src/domain';
import './tokens.css';
const ThemeContext = createContext<{ theme: Theme; changeTheme: (theme: Theme) => void; error: string }>({ theme: 'studio', changeTheme: () => {}, error: '' });
export function ThemeProvider({ bridge, children }: { bridge: DesktopBridge; children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('studio');
  const [error, setError] = useState('');
  const queue = useRef(Promise.resolve());
  const changed = useRef(false);
  useEffect(() => { let active = true; void bridge.getTheme().then(t => { if (active && !changed.current) setTheme(t); }).catch(() => setError('外观读取失败，请重试切换。')); return () => { active = false; }; }, [bridge]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const changeTheme = (next: Theme) => {
    changed.current = true;
    queue.current = queue.current.then(async () => { try { setTheme(await bridge.setTheme({ theme: next })); setError(''); } catch { setError('外观保存失败，请重试切换。'); } });
  };
  return <ThemeContext.Provider value={{ theme, changeTheme, error }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
