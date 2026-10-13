import { useRef, useState, type KeyboardEvent } from 'react';
import type { BrandProfileInput, ProductUpdate, SkuInput } from '../../../../../packages/contracts/src/domain';
import { Button } from '../../../../../packages/ui/src/Button';
export type Draft = {
  facts: Record<string, string>;
  skus: SkuInput[];
  brand: BrandProfileInput | null;
};
const builtInFacts = ['商品名称', '核心卖点'];
const factLimit = 100;
export function RightPanel({ draft, change, disabled, save, conversation, setConversation, settings }: {
  draft: Draft | null;
  change: (value: Draft) => void;
  disabled: boolean;
  save: () => void;
  conversation: string;
  setConversation: (value: string) => void;
  settings: () => void;
}) {
  const [tab, setTab] = useState<'config' | 'chat'>('config');
  const [factName, setFactName] = useState('');
  const [factError, setFactError] = useState('');
  const configRef = useRef<HTMLButtonElement>(null);
  const chatRef = useRef<HTMLButtonElement>(null);
  const factCount = Object.keys(draft?.facts ?? {}).length;
  const visibleFacts = [...new Set([...builtInFacts, ...Object.keys(draft?.facts ?? {})])];
  function key(e: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key))
      return;
    e.preventDefault();
    const next = e.key === 'Home' ? 'config' : e.key === 'End' ? 'chat' : tab === 'config' ? 'chat' : 'config';
    setTab(next);
    (next === 'config' ? configRef : chatRef).current?.focus();
  }
  function updateFact(name: string, value: string) {
    if (!draft)
      return;
    if (!Object.hasOwn(draft.facts, name) && factCount >= factLimit) {
      setFactError('商品事实最多 100 条，请先删除不需要的字段。');
      return;
    }
    change({ ...draft, facts: { ...draft.facts, [name]: value } });
    setFactError('');
  }
  function addFact() {
    if (!draft)
      return;
    const name = factName.trim();
    if (!name || name === '__proto__' || visibleFacts.includes(name)) {
      setFactError('请输入不重复的事实名称。');
      return;
    }
    if (factCount >= factLimit) {
      setFactError('商品事实最多 100 条，请先删除不需要的字段。');
      return;
    }
    updateFact(name, '');
    setFactName('');
  }
  function removeFact(name: string) {
    if (!draft)
      return;
    const facts = { ...draft.facts };
    delete facts[name];
    change({ ...draft, facts });
    setFactError('');
  }
  return <aside className="right-panel" aria-label="创作助手">
    <div className="panel-heading">
      <h2>创作助手</h2>
      <span className="local-badge">本地草稿</span>
    </div>
    <div className="tabs" role="tablist" aria-label="助手面板" onKeyDown={key}>
      <button ref={configRef} role="tab" id="config-tab" aria-controls="config-panel" aria-selected={tab === 'config'} tabIndex={tab === 'config' ? 0 : -1} onClick={() => setTab('config')}>配置</button>
      <button ref={chatRef} role="tab" id="chat-tab" aria-controls="chat-panel" aria-selected={tab === 'chat'} tabIndex={tab === 'chat' ? 0 : -1} onClick={() => setTab('chat')}>对话</button>
    </div>
    <div className="panel-scroll" role="tabpanel" id="config-panel" aria-labelledby="config-tab" hidden={tab !== 'config'}>
      {!draft ? <p className="muted">创建或选择商品项目，开始整理创作资料。</p> : <fieldset disabled={disabled} className="project-form">
        <section>
          <div className="section-title">
            <h3>商品事实</h3>
            <small>{factCount} / {factLimit} 条</small>
          </div>
          {factCount >= factLimit && <small>字段已满，可编辑现有内容，或删除字段后再添加。</small>}
          {visibleFacts.map(name => <div key={name}>
            <label>{name}
              <textarea aria-label={name} rows={name === '商品名称' ? 1 : 2} maxLength={4000} value={draft.facts[name] ?? ''} disabled={factCount >= factLimit && !Object.hasOwn(draft.facts, name)} onChange={e => updateFact(name, e.target.value)} />
            </label>
            {!builtInFacts.includes(name) && <Button variant="quiet" aria-label={`删除事实 ${name}`} onClick={() => removeFact(name)}>删除字段</Button>}
          </div>)}
          <div className="fact-add">
            <input aria-label="新事实名称" placeholder="如：材质、适用人群" maxLength={100} value={factName} onChange={e => setFactName(e.target.value)} />
            <Button onClick={addFact}>添加</Button>
          </div>
          {factError && <p className="error" role="alert">{factError}</p>}
        </section>
        <section>
          <div className="section-title">
            <h3>SKU</h3>
            <small>{draft.skus.length} 个规格</small>
          </div>{draft.skus.map((sku, i) => <div className="sku-card" key={sku.id}>
            <label>SKU 编码<input maxLength={100} value={sku.code} onChange={e => change({ ...draft, skus: draft.skus.map((s, j) => j === i ? { ...s, code: e.target.value } : s) })} />
            </label>
            <label>SKU 名称<input maxLength={200} value={sku.name} onChange={e => change({ ...draft, skus: draft.skus.map((s, j) => j === i ? { ...s, name: e.target.value } : s) })} />
            </label>
            <Button variant="quiet" aria-label={`删除 SKU ${i + 1}`} onClick={() => change({ ...draft, skus: draft.skus.filter((_, j) => j !== i) })}>删除规格</Button>
          </div>)}<Button onClick={() => change({ ...draft, skus: [...draft.skus, { id: crypto.randomUUID(), code: '', name: '', attributes: {} }] })}>添加 SKU</Button>
        </section>
        <section>
          <div className="section-title">
            <h3>品牌资料</h3>
            <small>选填</small>
          </div>
          <label>品牌名称<input maxLength={200} value={draft.brand?.name ?? ''} onChange={e => change({ ...draft, brand: { description: '', guidelines: {}, ...draft.brand, name: e.target.value } })} />
          </label>
          <label>品牌描述<textarea maxLength={10000} value={draft.brand?.description ?? ''} onChange={e => change({ ...draft, brand: { name: '', guidelines: {}, ...draft.brand, description: e.target.value } })} />
          </label>
        </section>
        <Button variant="primary" onClick={save}>保存资料</Button>
        <small>资料保存在当前商品项目中。</small>
      </fieldset>}
    </div>
    <div className="panel-scroll chat-panel" role="tabpanel" id="chat-panel" aria-labelledby="chat-tab" hidden={tab !== 'chat'}>
      <div className="assistant-intro">
        <span className="assistant-mark">✦</span>
        <h3>先整理想法，再开始创作</h3>
        <p>连接创作助手后，可生成方案。</p>
        <Button onClick={settings}>连接创作助手</Button>
      </div>
      <div className="chat-compose">
        <label>创作需求<textarea value={conversation} onChange={e => setConversation(e.target.value)} placeholder="例如：保留瓶身和标签，换成浅灰摄影棚背景。" />
        </label>
        <small>需求草稿仅保留在本次会话。方案执行尚未接入。</small>
        <Button disabled>发送需求</Button>
      </div>
    </div>
  </aside>;
}
export function toUpdate(draft: Draft): ProductUpdate { return { ...draft, brand: draft.brand?.name.trim() ? draft.brand : null }; }
