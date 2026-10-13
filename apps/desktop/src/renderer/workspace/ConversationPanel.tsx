import type { PanelState } from '../../../../../packages/contracts/src/canvas';
import { Button } from '../../../../../packages/ui/src/Button';
export function ConversationPanel({ panel, savedMessages, change, saveRequirement, disabled, settings }: {
  panel: PanelState; savedMessages: PanelState['messages']; change: (text: string) => void; saveRequirement: () => void; disabled: boolean; settings: () => void;
}) {
  return <>
    <div className="assistant-intro"><span className="assistant-mark">✦</span><h3>先整理想法，再开始创作</h3><p>创作执行尚未连接，可先保存需求。</p><Button onClick={settings}>连接创作助手</Button></div>
    <div aria-label="已保存需求">{savedMessages.map(message => <article key={message.id}><p>{message.text}</p><small>已保存用户需求 · {message.selectedNodes.length} 个输入快照 · 尚未执行</small></article>)}</div>
    <div className="chat-compose"><label>创作需求<textarea aria-label="创作需求" maxLength={100000} disabled={disabled} value={panel.chatDraft} onChange={event => change(event.target.value)} placeholder="例如：保留瓶身和标签，换成浅灰摄影棚背景。" /></label>
      <small>草稿和输入引用保存在当前画布。方案执行尚未接入。</small>
      <Button disabled={disabled || !panel.chatDraft.trim() || panel.messages.length >= 1000} onClick={saveRequirement}>保存需求</Button><Button disabled>发送需求（尚未连接）</Button>
    </div>
  </>;
}
