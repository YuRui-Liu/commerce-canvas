import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { RuntimeHealth } from '../../../../packages/runtime/src/index';
import './style.css';

function App() {
  const [theme, setTheme] = useState('studio');
  const [health, setHealth] = useState<RuntimeHealth>();
  const [error, setError] = useState('');
  useEffect(() => { window.commerceCanvas.health().then(setHealth).catch((reason: unknown) => setError(String(reason))); }, []);
  const ready = health?.sqlite.ok && health?.sharp.ok;
  return <div className="app" data-theme={theme}>
    <header><div className="brand"><span className="mark">C</span> CommerceCanvas <small>电商图片工作台</small></div><div className="theme" aria-label="外观"><button aria-pressed={theme === 'studio'} onClick={() => setTheme('studio')}>冷白钴蓝</button><button aria-pressed={theme === 'editorial'} onClick={() => setTheme('editorial')}>纸白莓红</button></div></header>
    <div className="workspace"><aside className="library"><p className="eyebrow">工作空间</p><h2>素材与画布</h2><div className="library-empty"><span>▧</span><p>你的商品创作，从这里开始</p><small>素材导入将在后续版本开放</small></div></aside>
      <main><div className="canvas-title"><span>未命名画布</span><small>本地工作空间</small></div><div className="canvas"><div className="welcome"><div className="welcome-symbol">▧</div><p className="eyebrow">为商品留出空间</p><h1>把想法，变成下一张好图。</h1><p>一个属于你的本地电商图片工作台。</p><span className="phase">工程预览 · 创作功能开发中</span></div></div></main>
      <aside className="assistant"><p className="eyebrow">创作助手</p><h2>准备好，再开始创作</h2><p className="intro">后续可选择 DeepSeek、Codex 或 WorkBuddy，并直接连接 GRSai 生成图片。</p><div className="health" role="status"><span className={ready ? 'dot ready' : 'dot'}/><strong>{error ? '本地引擎连接失败' : health ? ready ? '本地引擎已就绪' : '本地引擎需要检查' : '正在检查本地引擎…'}</strong><p>运行在独立进程，不打断工作空间。</p>{health && <dl><dt>SQLite</dt><dd>{health.sqlite.ok ? '读写验证通过' : health.sqlite.error}</dd><dt>Sharp</dt><dd>{health.sharp.ok ? '图像处理验证通过' : health.sharp.error}</dd></dl>}{error && <p>{error}</p>}</div><div className="assistant-note">当前版本仅验证本地引擎，尚未连接图片生成服务。</div></aside>
    </div><footer><span>本地优先 · 独立工作台</span><span>{health ? `Electron ${health.electron} · Node ${health.node}` : '启动中'}</span></footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
