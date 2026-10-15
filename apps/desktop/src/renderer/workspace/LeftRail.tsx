import { Button } from '../../../../../packages/ui/src/Button';
export function Icon({ kind }: { kind: 'assets' | 'agent' | 'scene' | 'settings' | 'upload' }) {
  const paths = { assets: 'M4 4h16v16H4z M4 15l5-5 4 4 3-2 4 4 M15 8h.01', agent: 'M5 6h14v12H5z M9 10h.01 M15 10h.01 M9 14h6 M12 3v3', scene: 'M3 5h18v14H3z M3 15l6-6 5 5 3-3 4 4', settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6', upload: 'M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6' };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]}/></svg>;
}
export function LeftRail({ library, toggleLibrary, openSettings, openScenarios, onNotice }: { library: boolean; toggleLibrary: () => void; openSettings: () => void; openScenarios:()=>void; onNotice: (text: string) => void }) {
  return <nav className="left-rail" aria-label="工作区导航"><Button variant="icon" aria-label="素材库" aria-pressed={library} onClick={toggleLibrary}><Icon kind="assets"/></Button>
    <Button variant="icon" aria-label="Agent 编排（开发中）" title="Agent 编排正在开发" disabled><Icon kind="agent"/></Button>
    <Button variant="icon" aria-label="场景" onClick={openScenarios}><Icon kind="scene"/></Button>
    <div className="rail-spacer"/><Button variant="icon" aria-label="打开设置" onClick={openSettings}><Icon kind="settings"/></Button></nav>;
}
