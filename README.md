# Wizard Crab 🦀🪄

An animated wizard crab above the Claude Code prompt, with compact model and token metrics beside it.

一个戴着魔法帽、挥动魔杖的小螃蟹，同时显示模型、effort、上下文、缓存命中率、速度及本轮 token 消耗。

This is a community mod, not an official Anthropic plugin.

本项目是社区 mod，并非 Anthropic 官方插件。

## Install / 一条命令安装

In a **compatible Claude Code terminal session**, paste:

在**支持该 mod API 的 Claude Code 终端会话**中，直接粘贴：

```text
/plugin install wizard-crab --marketplace KuroIVeko/wizard-crab
```

Confirm adding the marketplace with `y`, then select an installation scope. Choose **user** to make it available across your sessions.

在 Claude Code 输入上面的命令，确认添加 marketplace，再选择安装范围；选择 **user** 可在后续会话中使用。

Alternatively, from your shell:

也可以直接在 shell 中执行：

```sh
claude plugin install wizard-crab --marketplace KuroIVeko/wizard-crab
```

The repository includes its own marketplace manifest; no manual file copying or separate dependency installation is required on a compatible build.

仓库自带 marketplace 清单，在兼容版本上无需手动拷贝文件，也无需单独安装依赖。

### Compatibility / 兼容性

Tested with **Claude Code 2.1.301's function-hook mod API**, including `Register`, `atom`, `turn.step` and `ui.render` for `AbovePrompt`. Your build must expose these APIs; the version number alone is not a compatibility guarantee. Builds that support only traditional command hooks cannot run this mod.

已在 **Claude Code 2.1.301 的 function-hook mod API** 上测试，涉及 `Register`、`atom`、`turn.step` 以及用于 `AbovePrompt` 的 `ui.render`。你的版本必须实际暴露这些 API，仅版本号一致并不代表兼容；只支持传统命令 hooks 的版本无法运行本 mod。

Designed for the **terminal** UI with a monospaced font supporting Unicode quadrant/block characters. Other surfaces have not been verified. Widen the terminal if labels are truncated.

面向**终端**界面设计，等宽字体需支持 Unicode 象限/方块字符；其他界面尚未验证。若标签被截断，请加宽终端窗口。

## Features / 功能

- Eight-frame wizard crab animation: jumping, mirrored leg movement, blinking, purple hat and animated wand.
- 八帧巫师蟹动画：跳跃、镜像腿部动作、眨眼，紫色魔法帽与挥动的魔杖。
- Spell-themed spinner words, while preserving the engine's spinner rendering.
- 咒语主题的 spinner 文案，同时保留引擎原有的 spinner 渲染。
- Model name and effort on one line.
- 模型名称与 effort 显示在同一行。
- Context tokens, context-window capacity and fill percentage.
- 上下文 token 数、上下文窗口容量与占用百分比。
- Cache hit rate, output speed (`tok/s`) and latency (`TTFT`).
- 缓存命中率、输出速度（`tok/s`）与首字延迟（`TTFT`）。
- A compact horizontal **Consumption · this turn** token-share bar.
- 一条紧凑的横向 **Consumption · this turn** token 占比条。
- English panel labels, with `-` placeholders for unavailable speed and latency.
- 面板标签为英文；速度或延迟不可用时以 `-` 占位。
- Existing survey content is passed through instead of replaced by the crab.
- 原有的 survey 内容会原样透传，不会被螃蟹替换掉。

## What the numbers mean / 各项指标含义

| Field | Meaning | 含义 |
| --- | --- | --- |
| Model | Selected main-session model, refreshed after `/model` and by a one-second check. A main request also supplies its model. | 主会话当前选中的模型；`/model` 执行后以及每秒一次的检查会刷新它，主请求自身也会带上模型信息。 |
| Effort | Selected effort when the engine exposes an effort configuration row; otherwise the latest main request's reported effort. Unknown values are omitted. | 引擎暴露 effort 配置项时显示当前选中的 effort，否则取最近一次主请求上报的 effort；未知值不显示。 |
| Context | Latest confirmed main-request input tokens: ordinary input + cache reads + cache writes. Capacity comes from the engine, not a hard-coded model table. | 最近一次确认的主请求输入 token：普通输入 + 缓存读取 + 缓存写入。窗口容量由引擎提供，不使用写死的模型对照表。 |
| Cache hit | Cache-read input divided by ordinary input + cache-read input + cache-write input, for the latest reported main request. | 最近一次上报的主请求中，缓存读取输入 ÷（普通输入 + 缓存读取输入 + 缓存写入输入）。 |
| Speed | Reported output tokens divided by elapsed time from the first stream chunk to stream completion. | 上报的输出 token 数 ÷ 从首个流式分片到流结束所用的时间。 |
| TTFT | Time to the **first stream chunk**. A chunk can contain metadata rather than an actual token, so this is a latency approximation, not a guaranteed first-text-token measurement. | 到**首个流式分片**的时间。分片里可能是元数据而不是真正的 token，因此这是一个延迟近似值，不保证等同于首个正文 token 的时间。 |
| Uncached Input | Current-turn ordinary input + cache-write tokens; cache reads are excluded. | 本轮的普通输入 + 缓存写入 token；不含缓存读取。 |
| Output | Current-turn output tokens reported by the engine. | 引擎上报的本轮输出 token。 |

### Consumption scope / 本轮统计范围

A **turn** starts when a main-session turn starts and ends when its completion arrives. It may contain several model requests separated by tool calls.

一个**轮（turn）**从主会话的这一轮开始算起，到收到该轮完成事件时结束；其间可能包含被工具调用分隔开的多次模型请求。

- Adds completed main requests during that turn, with step deduplication.
- 累加该轮内已完成的主请求，并按 step 去重。
- Uses final turn usage to replace, not add to, the provisional total.
- 用该轮最终的 usage 覆盖（而不是叠加）临时统计的总量。
- Excludes subagent requests.
- 不包含子代理（subagent）发出的请求。
- Resets when a new main turn starts, not when a prompt is merely queued.
- 在新的主轮开始时重置，而不是在 prompt 刚进入队列时就重置。
- Retains confirmed usage and shows `(partial)` after an interruption or missing final usage.
- 中断或缺少最终 usage 时，保留已确认的用量并标注 `(partial)`。
- Percentages use `Uncached Input + Output` as the denominator. They are **token shares, not monetary cost shares**, context occupancy or session-lifetime totals.
- 百分比以 `Uncached Input + Output` 为分母，是 **token 数量占比，不是费用占比**，也不代表上下文占用或整个会话的累计。
- Tiny segments can round to zero terminal cells; their numeric percentages remain visible.
- 极小的分段可能四舍五入为 0 个终端字符宽度，但对应的数字百分比仍会显示。

“本轮”不是单次 API 请求，也不是整个聊天历史：它包括一条用户消息触发的这一轮里，多次主模型请求的累计，不包含子代理。横条是 token 数量占比，不是费用占比。

### Refresh behavior and limitations / 刷新机制与已知限制

- Context/cache/speed update after each completed main model request, not token by token during a stream.
- 上下文 / 缓存 / 速度在每次主模型请求完成后更新，而不是在流式过程中逐 token 更新。
- Model selection, available effort configuration and window capacity are checked once a second. `/model` and `/effort` also trigger a check after execution.
- 模型选择、可用的 effort 配置与窗口容量每秒检查一次；`/model` 与 `/effort` 执行后也会触发一次检查。
- Immediate effort refresh depends on whether the host exposes the current effort in its public configuration rows. If it does not, the next main request is the fallback. This availability has not been verified across builds.
- effort 能否立即刷新，取决于宿主是否在公开配置项中暴露当前 effort；若不暴露，则退回到下一次主请求时更新。该可用性尚未在各个版本上逐一验证。
- A changed model with unavailable window metadata shows `/ -`; capacity is retried, not guessed. The engine may itself delay publishing new metadata.
- 切换后的模型若拿不到窗口元数据，会显示 `/ -`；容量是重试获取而非猜测。引擎自身也可能延迟发布新的元数据。
- Switching models does not reset Consumption or erase the most recently confirmed request metrics.
- 切换模型不会重置 Consumption，也不会清掉最近一次已确认的请求指标。
- Hook-state tests do not substitute for checking font rendering or installation on another person's build.
- hook 状态测试不能替代在他人环境中检查字体渲染与实际安装效果。

## Privacy / 隐私

The mod uses the host's model/configuration/usage interfaces, session state and timers. Its source makes no HTTP requests, reads no transcript or credential files, and starts no external processes. It does not estimate tokens by sending additional model requests. It does not add telemetry of its own.

本 mod 只使用宿主提供的模型 / 配置 / 用量接口、会话状态与计时器。源码不发起任何 HTTP 请求，不读取会话记录或凭据文件，也不启动外部进程；不会通过额外发送模型请求来估算 token，自身也不添加任何遥测。

## Development / 开发

Clone the repository, then validate and run the tests with a compatible Claude Code build:

克隆仓库后，用兼容的 Claude Code 版本校验并运行测试：

```sh
git clone https://github.com/KuroIVeko/wizard-crab.git
cd wizard-crab
claude plugin validate .
claude plugin test .
```

For local development, start a separate session with the folder loaded:

本地开发时，可以另开一个会话并加载该目录：

```sh
claude --plugin-dir .
```

The source includes regression tests for quadrant geometry, animation, model/effort updates, context refresh, streaming pass-through and token accounting. The `claude-code` runtime and `claude-code/testing` are provided by the host; they are not third-party npm packages to install.

源码包含针对象限几何、动画、模型 / effort 更新、上下文刷新、流式透传与 token 统计的回归测试。`claude-code` 运行时与 `claude-code/testing` 由宿主提供，不是需要安装的第三方 npm 包。

### Files / 文件说明

- `.claude-plugin/plugin.json`: plugin metadata and state contract reference.
- `.claude-plugin/plugin.json`：插件元数据与 state 契约引用。
- `.claude-plugin/marketplace.json`: GitHub-installable marketplace entry.
- `.claude-plugin/marketplace.json`：可通过 GitHub 安装的 marketplace 条目。
- `hooks/register.tsx`: lifecycle hooks and terminal UI.
- `hooks/register.tsx`：生命周期 hooks 与终端 UI。
- `hooks/sprite.ts`: shared pixel-grid sprite renderer.
- `hooks/sprite.ts`：共用的像素网格精灵渲染器。
- `hooks/consumption.ts`: pure token accounting and horizontal-bar helpers.
- `hooks/consumption.ts`：纯 token 统计与横向占比条辅助函数。
- `hooks/*.test.ts`: regression tests.
- `hooks/*.test.ts`：回归测试。
- `types/index.d.ts`: plugin state types.
- `types/index.d.ts`：插件 state 类型定义。
