import type { Project } from '../../../../../packages/contracts/src/domain';
import { Button } from '../../../../../packages/ui/src/Button';
export function ProjectSwitcher({ projects, current, disabled, onSelect, onCreate, onRename }: { projects: Project[]; current?: Project; disabled: boolean; onSelect: (id: string) => void; onCreate: () => void; onRename: () => void }) {
  return <div className="project-switcher"><select aria-label="商品项目" value={current?.id ?? ''} disabled={disabled} onChange={e => onSelect(e.target.value)}>
    <option value="" disabled>选择商品项目</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
  </select><Button variant="icon" aria-label="创建项目" title="创建项目" onClick={onCreate} disabled={disabled}>+</Button><Button variant="quiet" onClick={onRename} disabled={!current || disabled}>重命名</Button></div>;
}
