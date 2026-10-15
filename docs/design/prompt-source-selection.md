# 电商预设资料选择

2026-10-12 GitHub API 核对。星数仅作为社区关注度参考，不等于商业效果或真实性保证。产品内提示词按场景独立编写，不复制未核验商品事实。

| 资料 | Star 快照 | 用法 |
| --- | ---: | --- |
| [freestylefly/awesome-gpt-image-2](https://github.com/freestylefly/awesome-gpt-image-2) | 34,352 | 主要风格与结构参考；MIT。仓库包含可复用 style-library Skill |
| [YouMind-OpenLab/awesome-gpt-image-2](https://github.com/YouMind-OpenLab/awesome-gpt-image-2) | 10,081 | 案例检索参考；GitHub license=NOASSERTION，批量复制前需核对具体许可 |
| [ZeroLu/awesome-gpt-image](https://github.com/ZeroLu/awesome-gpt-image) | 2,264 | 商业图案例与来源参考；仓库 MIT，外链素材另核许可 |
| [flux-art-ai/flux-art-ecom-image-workflow](https://github.com/flux-art-ai/flux-art-ecom-image-workflow) | 6 | 白底、促销、场景、系列与详情页流程参考；不是高星项目，不接入其平台 |

主参考 [Style Library Skill](https://github.com/freestylefly/awesome-gpt-image-2/blob/main/agents/skills/gpt-image-2-style-library/SKILL.md) 将任务拆为主体任务、构图、材质风格、文字、输出规格、限制六部分，并通过场景/风格/案例匹配。CommerceCanvas 在此基础上增加不可变输入角色、商品事实来源、槽位、保护区、验收项及最大修正次数；执行权限仍由本地工具系统控制。

预设需要保留 source URL、许可证标识、版本/核验日期；用户导入其他 Skill 时不自动下载或执行其中脚本。外部 Skill 的服务商广告和推荐不改变本产品 GRSai 直连决定。

## 已核对的模板映射

来自 [style-library.json](https://github.com/freestylefly/awesome-gpt-image-2/blob/main/data/style-library.json)；下列产品约束是 CommerceCanvas 的实现决定，非原仓库保证。

| 本产品场景 | 可参考模板 ID / 案例 ID | 本产品必须额外控制 |
| --- | --- | --- |
| 主图、融合、SKU | product-commerce-visual / 373、358 | 商品身份固定，角色绑定清晰，SKU不跨槽位 |
| 海报、卖点 | poster-layout-system / 345、5、10 | 文案来源确认，精确文字用编辑层 |
| 模特、场景、精修 | realistic-photography / 377 | 保护商品纹理、人体关系与原始比例 |
| 详情套图 | brand-touchpoint-board / 362 | 每屏独立槽位，统一品牌快照与屏序 |
| 结构尺寸 | concept-product-breakdown / 370、361 | 必须先有真实结构依据，不能把概念图当实物事实 |

抠图、翻译、扩图与尺寸适配不能只靠风格模板完成，仍需专门参数、能力检查和确定性图像处理。选择案例不自动导入其图片，也不复制第三方商标或卖点。

## 2026-10-13 实现复核

重新打开上游 `agents/skills/gpt-image-2-style-library/SKILL.md` 与 `data/style-library.json`，确认六段提示词结构及上述三个模板 ID 仍存在。本次不复核星数，表内星数仅为历史快照。

本轮将以下参考转化为独立编写的中文电商模板：商品模板用于白底主图的主体突出与辅助元素约束；写实摄影模板用于生活场景和材质细节的机位、光源与质感描述；海报模板用于卖点海报的信息层级、留白和文字约束。模板须实际写入出图节点并进入生成确认快照，不能以展示来源文档或空场景入口代替实现。

用户提供的商品图、商品事实与文案仍为内容依据。模板不内置虚构销量、功效、认证、折扣或包装文字，也不导入来源仓库的示例图片。
