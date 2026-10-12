# 全部电商图片场景实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任务实现，用复选框跟踪。

**目标：** 八类场景均具备必要输入、专门编辑器、生成工作流和验收，不能仅提供八个提示词按钮。

**架构：** 场景配方声明输入角色、必要能力、输出槽位和检查项，编译成 A3 的 RunPlan。编辑器收集结构化参数；生成经 G1–G4，确定性裁切和排版用本地图像工具。

**技术栈：** React、SVG／Canvas 区域编辑、Zod、Sharp、已有 Agent/Run/Gateway 端口、Vitest、Playwright。依赖 C1–C4、A1–A4、G1–G4。

---

公共文件：`packages/contracts/src/scenes.ts`、`packages/runtime/src/scenes/registry.ts`、`compile.ts`；`apps/desktop/src/renderer/scenes/SceneLauncher.tsx`。八个场景各有配方文件、编辑器和测试，不在一个巨大组件中用分支塞入全部功能。

```ts
export interface SceneRecipe {
  id:string; version:string; name:string;
  requiredRoles:InputRole[]; requiredCapabilities:string[];
  fields:Record<string,unknown>; checks:string[];
}
export interface Region { x:number;y:number;width:number;height:number }
export interface SceneInput {
  recipeId:string; projectId:string; references:AssetRef[];
  values:Record<string,unknown>;
}
```

`Region` 坐标归一化到原图 [0,1]，width/height 为正，x+width/y+height 不超 1。`compileScene(input, recipe, capabilities)` 输出未批准 RunPlan；字段数据用每场景 Zod schema 校验。单独点击某场景不自动调用图片接口。

## S1 精修、抠图与背景替换

**创建：** `recipes/retouch.ts`（位于 runtime scenes）、`apps/desktop/src/renderer/scenes/RetouchEditor.tsx`、`packages/ui/src/mask/MaskEditor.tsx`、`maskGeometry.ts`；测试 `packages/ui/test/maskGeometry.test.ts`、`tests/e2e/retouch.spec.ts`。

- [ ] 实现公共 registry/compile，写 requiredRoles 和能力不满足拒绝测试。预设 Skill 来源记录到 `packages/runtime/src/scenes/provenance.json`，改写模板并保留许可，不把营销素材当成事实。
- [ ] mask 测试原图 1000×500、显示 500×250 时视图点 (250,125) 对应归一化 (.5,.5)；缩放与平移后同一点不变；保护区域覆盖编辑区域时保护优先。

```ts
expect(normalizePoint({x:250,y:125},{left:0,top:0,width:500,height:250}))
  .toEqual({x:0.5,y:0.5});
expect(combineMask({edit:255,protect:255})).toBe(0);
```

- [ ] 运行 `npm test -- packages/ui/test/maskGeometry.test.ts` 确认失败，实现 normalizePoint、combineMask、笔刷大小、撤销／重做、区域反选和 clear。编辑遮罩保留独立版本并随任务快照，不覆盖原图。
- [ ] RetouchEditor 区分精修、透明抠图、纯色／场景换背景。明确输出透明能力，网关无法输出透明时使用支持的分割工具，不能把白底 JPEG 称为透明图。
- [ ] 执行 `npm run test:e2e -- tests/e2e/retouch.spec.ts`：绘制保护区、确认、对比与单区域返修；真实样例包含细边和反光物。提交 `git add packages/contracts/src/scenes.ts packages/runtime/src/scenes apps/desktop/src/renderer/scenes packages/ui/src/mask packages/ui/test/maskGeometry.test.ts tests/e2e/retouch.spec.ts`，`git commit -m "feat: add constrained retouch and background workflows"`。

## S2 融图、商品替换与道具

**创建：** `packages/runtime/src/scenes/recipes/fusion.ts`；`apps/desktop/src/renderer/scenes/FusionEditor.tsx`；测试 `packages/runtime/test/fusion.test.ts`、`tests/e2e/fusion.spec.ts`。

- [ ] 测试缺少 product 或 scene 引用拒绝；style 引用不能替代 product；同一素材可作为不同任务的不同角色；输出参数保留遮挡和位置。

```ts
expect(recipe.requiredRoles).toEqual(['product','scene']);
expect(parseFusion({placement:{x:.2,y:.3,width:.4,height:.5},occlusion:'behind'}).placement.x).toBe(.2);
expect(()=>parseFusion({placement:{x:.9,y:0,width:.4,height:1}})).toThrow();
```

- [ ] `npm test -- packages/runtime/test/fusion.test.ts` 失败后实现 parseFusion schema。FusionEditor 左右绑定商品与场景，画布框定位置，选择前景／背景遮挡、保持原场景或重构光影；把区域与输入顺序固定在计划中。
- [ ] 生成检查记录比例、接触阴影、透视与遮挡；允许选具体问题进行返修，不能默认扩大到整图。图 B 的商品外观不得覆盖图 A 的商品依据。
- [ ] `npm run test:e2e -- tests/e2e/fusion.spec.ts` 验证拖动定位、替换目标、区域保持。提交 `git add packages/runtime/src/scenes/recipes/fusion.ts apps/desktop/src/renderer/scenes/FusionEditor.tsx packages/runtime/test/fusion.test.ts tests/e2e/fusion.spec.ts`，`git commit -m "feat: support role-aware product fusion"`。

## S3 SKU 换色与多角度

**创建：** `packages/runtime/src/scenes/recipes/sku.ts`；`apps/desktop/src/renderer/scenes/SkuMatrixEditor.tsx`；测试 `packages/runtime/test/sku-plan.test.ts`、`tests/e2e/sku.spec.ts`。

- [ ] 测试 3 个 SKU × 2 个角度恰好生成 6 个唯一槽位，槽位 ID 稳定绑定 SKU／角度；缺背面参考时输出标为未核验，不生成“已真实确认”的标志。

```ts
expect(buildSkuSlots(['red','blue','black'],['front','back']).map(s=>s.id))
 .toEqual(['red:front','red:back','blue:front','blue:back','black:front','black:back']);
```

- [ ] `npm test -- packages/runtime/test/sku-plan.test.ts` 失败后实现 buildSkuSlots 与 schema；颜色需记录目标值、变更部位、参考样片，不能从颜色文字推断任意材质变化。
- [ ] 矩阵编辑器提供行列选择、单 SKU 参考、保护区、角度参照和批量预览。确认页展示笛卡尔积合计；失败只重跑对应槽位，不重抽整批。
- [ ] `npm run test:e2e -- tests/e2e/sku.spec.ts` 验证变更一个 SKU 不使其他 SKU 已选作品丢失。提交 `git add packages/runtime/src/scenes/recipes/sku.ts apps/desktop/src/renderer/scenes/SkuMatrixEditor.tsx packages/runtime/test/sku-plan.test.ts tests/e2e/sku.spec.ts`，`git commit -m "feat: plan versioned SKU image matrices"`。

## S4 模特换装与配饰试戴

**创建：** `packages/runtime/src/scenes/recipes/tryon.ts`；`apps/desktop/src/renderer/scenes/TryOnEditor.tsx`；测试 `packages/runtime/test/tryon.test.ts`、`tests/e2e/tryon.spec.ts`。

- [ ] 测试模特和服饰参考不能颠倒；缺商品参考阻止运行；配饰部位枚举 ear/neck/wrist/hand/foot 与服饰模式区分。网关不支持必要参考图数量时在执行前说明。
- [ ] `npm test -- packages/runtime/test/tryon.test.ts` 失败后实现 `parseTryOn`：`mode` 为 garment/accessory，`modelRef`、`productRef`、`placement`、`protectedRegions` 必填；accessory 还需 `bodyPart`。

```ts
const request = parseTryOn({mode:'accessory',modelRef:'m1',productRef:'p1',
  bodyPart:'wrist',placement:{x:.2,y:.3,width:.1,height:.1},protectedRegions:[]});
expect(request.productRef).toBe('p1');
```

- [ ] UI 双素材选择、身体区域框选、纹理／版型保留要求、佩戴比例和遮挡预览。检查问题定位衣物边缘、印花、穿模、配饰数量；保持人物区域不被无意整体重绘。
- [ ] `npm run test:e2e -- tests/e2e/tryon.spec.ts`，真实验收至少服装、首饰、鞋类各一例，记录失败与返修，不把通用生成按钮称为试穿交付。提交 `git add packages/runtime/src/scenes/recipes/tryon.ts apps/desktop/src/renderer/scenes/TryOnEditor.tsx packages/runtime/test/tryon.test.ts tests/e2e/tryon.spec.ts`，`git commit -m "feat: add garment and accessory placement editors"`。

## S5 主图、海报与卖点图

**创建：** `packages/runtime/src/scenes/recipes/marketing.ts`；`apps/desktop/src/renderer/scenes/MarketingEditor.tsx`；`packages/contracts/src/textLayers.ts`；测试 `packages/runtime/test/marketing-copy.test.ts`、`tests/e2e/marketing.spec.ts`。

- [ ] 定义文字层的位置、精确文本、字号、对齐、颜色与字体引用，避免用未经转义的用户文本拼 SVG。

```ts
export interface TextLayer {
  id:string; text:string; region:Region; fontId:string; fontSize:number;
  align:'left'|'center'|'right'; color:string;
}
```

- [ ] 测试用户批准的 3 条文案只出现 3 条；从参考海报读取的促销价格不自动加入；必需字体不可用时返回 FONT_UNAVAILABLE。`npm test -- packages/runtime/test/marketing-copy.test.ts` 确认失败。
- [ ] MarketingEditor 提供主图／促销／卖点布局、文案分区、品牌样式、主体保护与输出比例；精确文字用 TextLayer 叠加，本地排版经 D2 输出，模型负责图像背景与构图。
- [ ] `npm run test:e2e -- tests/e2e/marketing.spec.ts` 验证编辑文字无需再次出图、切换 UI 主题不改作品配色。提交 `git add packages/runtime/src/scenes/recipes/marketing.ts apps/desktop/src/renderer/scenes/MarketingEditor.tsx packages/contracts/src/textLayers.ts packages/runtime/test/marketing-copy.test.ts tests/e2e/marketing.spec.ts`，`git commit -m "feat: compose editable marketing image layouts"`。

## S6 详情页与商品套图

**创建：** `packages/runtime/src/scenes/recipes/detail.ts`；`apps/desktop/src/renderer/scenes/DetailStoryboard.tsx`、`DetailPreview.tsx`；测试 `packages/runtime/test/detail-plan.test.ts`、`tests/e2e/detail.spec.ts`。

- [ ] 定义每屏 `id/order/purpose/inputRefs/copy/styleRef/outputVersionId`，用途至少支持首屏、卖点、场景、尺寸、细节和使用说明；不强制商品必须用固定六屏。
- [ ] 测试屏序重排不改变 screen ID，单屏返修只使该屏新版本失效，引用的品牌规范变更使所有相关屏需要更新。运行 `npm test -- packages/runtime/test/detail-plan.test.ts` 确认失败。

```ts
expect(reorderScreens([{id:'a',order:0},{id:'b',order:1}],['b','a']))
  .toEqual([{id:'b',order:0},{id:'a',order:1}]);
```

- [ ] 实现屏序卡片编辑、拖动排序、每屏目的与文案、跨屏风格锁定、独立重跑和整套预览。依赖多个产物的单屏任务明确引用版本；连接画布分组和屏序列表的选择状态。
- [ ] `npm run test:e2e -- tests/e2e/detail.spec.ts` 验证换一屏和排序不生成其他屏；D2 完成拼接后验证长图顺序。提交 `git add packages/runtime/src/scenes/recipes/detail.ts apps/desktop/src/renderer/scenes/DetailStoryboard.tsx apps/desktop/src/renderer/scenes/DetailPreview.tsx packages/runtime/test/detail-plan.test.ts tests/e2e/detail.spec.ts`，`git commit -m "feat: build editable product detail storyboards"`。

## S7 结构拆解与尺寸参数图

**创建：** `packages/runtime/src/scenes/recipes/structure.ts`；`apps/desktop/src/renderer/scenes/StructureEditor.tsx`；测试 `packages/runtime/test/structure.test.ts`、`tests/e2e/structure.spec.ts`。

- [ ] 测试无内部结构依据时拒绝生成真实拆解图；参数无单位或负数拒绝；注释引用的部件 ID 必须存在于用户提供资料中。

```ts
expect(()=>validateStructure({parts:[],references:[],mode:'exploded'}))
  .toThrow('STRUCTURE_REFERENCE_REQUIRED');
```

- [ ] 运行 `npm test -- packages/runtime/test/structure.test.ts` 确认失败。实现 validateStructure，要求真实部件表、参考资料和单位；尺寸字段可由文字直接输入，模型不能自动填未知参数。
- [ ] UI 提供参数表、部件标注、引线锚点和资料缺失提示。尺寸数字作为确定性文字层；检查跨单位换算和图形比例，无法证实时标记人工核验。
- [ ] `npm run test:e2e -- tests/e2e/structure.spec.ts` 验证阻止编造、编辑标注、保存版本。提交 `git add packages/runtime/src/scenes/recipes/structure.ts apps/desktop/src/renderer/scenes/StructureEditor.tsx packages/runtime/test/structure.test.ts tests/e2e/structure.spec.ts`，`git commit -m "feat: ground structure diagrams in product evidence"`。

## S8 翻译、扩图与尺寸适配

**创建：** `packages/runtime/src/scenes/recipes/localize.ts`；`apps/desktop/src/renderer/scenes/LocalizationEditor.tsx`、`ResizeEditor.tsx`；测试 `packages/runtime/test/localization.test.ts`、`resize.test.ts`；`tests/e2e/localization.spec.ts`。

- [ ] OCR 结果先成为可编辑文字区域列表；用户确认源文和不翻译项，再提供目标语言。测试品牌、型号、容量保持；长度变化触发溢出提示；未识别区域标为未核验而不是无文字。
- [ ] `npm test -- packages/runtime/test/localization.test.ts packages/runtime/test/resize.test.ts` 确认失败。`planResize` 区分 contain/crop/outpaint，contain/crop 用确定性处理，只有 outpaint 调用网关。

```ts
expect(planResize({source:{width:1000,height:500},target:{width:800,height:800},mode:'contain'}))
  .toEqual({width:800,height:400,left:0,top:200,requiresGeneration:false});
```

- [ ] 实现源文／译文对照、品牌保护、文字框调整、编辑文字层；扩图明确原图保护区，裁切提供焦点与安全边距预览。平台尺寸预设从用户可维护配置读取。
- [ ] `npm run test:e2e -- tests/e2e/localization.spec.ts` 验证多语言长文本、竖版扩图、批量尺寸；D2 导出后校验实际像素。提交 `git add packages/runtime/src/scenes/recipes/localize.ts apps/desktop/src/renderer/scenes/LocalizationEditor.tsx apps/desktop/src/renderer/scenes/ResizeEditor.tsx packages/runtime/test/localization.test.ts packages/runtime/test/resize.test.ts tests/e2e/localization.spec.ts`，`git commit -m "feat: localize and adapt product image formats"`。

## 场景总验收

每个 S 任务在 `docs/evidence/scenarios/<场景ID>.md` 记录输入版本、预期、实际输出、检查问题及一次有效返修。文件只能引用获准素材，Token 与临时签名必须去除。自动测试通过但未做真实场景输出时，证据写“真实验收未执行”，该场景不能标记交付完成。
