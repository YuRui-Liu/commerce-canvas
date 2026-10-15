import {useState} from 'react';
import {Dialog} from '../../../../../packages/ui/src/Dialog';
import {scenarioTemplates,type ScenarioTemplate} from './scenarios';
export function ScenarioDialog({onClose,onChoose}:{onClose:()=>void;onChoose:(template:ScenarioTemplate)=>void}){
 const [copied,setCopied]=useState<string>();
 return <Dialog title="从一个创作方向开始" onClose={onClose}><p className="muted">创建新的出图节点，保留当前草稿。连接商品参考后，可继续修改每一项要求。</p><div className="scenario-grid">{scenarioTemplates.map(template=><article className={`scenario-card scenario-${template.id}`} key={template.id}>
  <div className="scenario-art" aria-hidden="true"><span className="scenario-plinth"/><span className="scenario-product"/><span className="scenario-shadow"/><span className="scenario-line"/></div>
  <div className="scenario-content"><small>{template.tag} · {template.ratio}</small><h3>{template.name}</h3><p>{template.subtitle}</p><button className="button primary" aria-label={`使用 ${template.name}`} onClick={()=>onChoose(template)}>使用此场景 ↗</button>
  <details><summary>模板内容与来源</summary><p>{template.sections.join('\n')}</p><p>来源模板：{template.source.templateId}<br/>{template.source.license}<br/>核验：{template.source.checkedAt}</p><p>{template.source.url}</p><button className="button" onClick={()=>void navigator.clipboard.writeText(template.source.url).then(()=>setCopied(template.id)).catch(()=>setCopied('failed'))}>{copied===template.id?'已复制来源地址':'复制来源地址'}</button>{copied==='failed'&&<p role="status">无法访问剪贴板，请复制上方地址。</p>}</details></div>
 </article>)}</div></Dialog>;
}
