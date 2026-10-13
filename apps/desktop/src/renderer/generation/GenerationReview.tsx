import type {GenerationRun} from '../../../../../packages/contracts/src/imageGeneration';
import {Dialog} from '../../../../../packages/ui/src/Dialog';
export function GenerationReview({run,pending,error,onConfirm,onCancel,onSettings}:{run:GenerationRun;pending:boolean;error:string;onConfirm:()=>void;onCancel:()=>void;onSettings:()=>void}){return <Dialog title="确认图片生成" onClose={()=>{if(!pending)onCancel();}}>
 <p className="muted">确认后直接提交至 GRSai。以下参数与输入已固定，后续编辑只用于下一次生成。</p>
 <dl className="generation-review-grid"><dt>模型</dt><dd>{run.request.model}</dd><dt>目标尺寸</dt><dd>{run.request.width} × {run.request.height} px</dd><dt>数量</dt><dd>{run.settings.count} 张</dd><dt>输入</dt><dd>{run.inputs.length} 项素材</dd></dl>
 <div className="generation-snapshots">{run.inputs.map((input,i)=><div key={i}>{input.kind==='image'&&<img src={`commerce-asset://asset/${input.versionId}/thumbnail`} alt={`${input.role} 输入快照`}/>}<span>{input.role} · {input.kind==='text'?input.text?.slice(0,80):`图片 ${input.imageIndex??i+1}`}</span></div>)}</div>
 <details><summary>查看完整生成指令</summary><pre className="generation-prompt">{run.request.prompt}</pre></details>
 {error&&<p role="alert" className="error">{error}</p>}{error.includes('凭证')&&<button className="button" onClick={onSettings}>打开设置</button>}
 <div className="dialog-actions"><button className="button" disabled={pending} onClick={onCancel}>取消</button><button className="button primary" disabled={pending} onClick={onConfirm}>{pending?'正在提交…':'确认生成'}</button></div>
 </Dialog>;}
