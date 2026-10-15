import {expect,it} from 'vitest';
import {GenerationSettingsSchema} from '../../packages/contracts/src/imageGeneration';
import {scenarioTemplates,scenarioSettings} from '../../apps/desktop/src/renderer/generation/scenarios';
it('provides four distinct, valid and independently editable six-section commerce templates',()=>{
 expect(scenarioTemplates).toHaveLength(4);
 expect(new Set(scenarioTemplates.map(t=>scenarioSettings(t).prompt)).size).toBe(4);
 for(const template of scenarioTemplates){const settings=scenarioSettings(template);settings.ratio='16:9';expect(settings.prompt).toContain('按当前选择的画幅与尺寸');expect(template.sections[4]).not.toMatch(/正方形|横向|竖向/);}
 for(const template of scenarioTemplates){const settings=scenarioSettings(template);expect(GenerationSettingsSchema.safeParse(settings).success).toBe(true);for(const label of ['主体任务','构图','材质表达','文字','输出规格','约束'])expect(settings.prompt).toContain(label);expect(template.source.checkedAt).toBe('2026-10-13');settings.photography.lens='wide';expect(scenarioSettings(template).photography.lens).not.toBe('wide');}
});
