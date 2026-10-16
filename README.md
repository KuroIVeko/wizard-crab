# Wizard Crab 🦀🪄

An animated wizard crab above the Claude Code prompt, with compact model and token metrics beside it.

一个戴着魔法帽、挥动魔杖的小螃蟹，同时显示模型、effort、上下文、缓存命中率、速度及本轮 token 消耗。

This is a community mod, not an official Anthropic plugin.

## Install / 一条命令安装

In a **compatible Claude Code terminal session**, paste:

```text
/plugin install wizard-crab --marketplace KuroIVeko/wizard-crab
```

Confirm adding the marketplace with `y`, then select an installation scope. Choose **user** to make it available across your sessions.

在 Claude Code 输入上面的命令，确认添加 marketplace，再选择安装范围；选择 **user** 可在后续会话中使用。

Alternatively, from your shell:

```sh
claude plugin install wizard-crab --marketplace KuroIVeko/wizard-crab
```

The repository includes its own marketplace manifest; no manual file copying or separate dependency installation is required on a compatible build.

### Compatibility

Tested with **Claude Code 2.1.301's function-hook mod API**, including `Register`, `atom`, `turn.step` and `ui.render` for `AbovePrompt`. Your build must expose these APIs; the version number alone is not a compatibility guarantee. Builds that support only traditional command hooks cannot run this mod.

Designed for the **terminal** UI with a monospaced font supporting Unicode quadrant/block characters. Other surfaces have not been verified. Widen the terminal if labels are truncated.

需要支持 function-hook mod API 的 Claude Code 版本。仅支持传统命令 hooks 的版本无法运行；终端字体需支持 Unicode 方块字符。

## Features

- Eight-frame wizard crab animation: jumping, mirrored leg movement, blinking, purple hat and animated wand.
- Spell-themed spinner words, while preserving the engine's spinner rendering.
- Model name and effort on one line.
- Context tokens, context-window capacity and fill percentage.
- Cache hit rate, output speed (`tok/s`) and latency (`TTFT`).
- A compact horizontal **Consumption · this turn** token-share bar.
- English panel labels, with `-` placeholders for unavailable speed and latency.
- Existing survey content is passed through instead of replaced by the crab.

## What the numbers mean

| Field | Meaning |
| --- | --- |
| Model | Selected main-session model, refreshed after `/model` and by a one-second check. A main request also supplies its model. |
| Effort | Selected effort when the engine exposes an effort configuration row; otherwise the latest main request's reported effort. Unknown values are omitted. |
| Context | Latest confirmed main-request input tokens: ordinary input + cache reads + cache writes. Capacity comes from the engine, not a hard-coded model table. |
| Cache hit | Cache-read input divided by ordinary input + cache-read input + cache-write input, for the latest reported main request. |
| Speed | Reported output tokens divided by elapsed time from the first stream chunk to stream completion. |
| TTFT | Time to the **first stream chunk**. A chunk can contain metadata rather than an actual token, so this is a latency approximation, not a guaranteed first-text-token measurement. |
| Uncached Input | Current-turn ordinary input + cache-write tokens; cache reads are excluded. |
| Output | Current-turn output tokens reported by the engine. |

### Consumption scope

A **turn** starts when a main-session turn starts and ends when its completion arrives. It may contain several model requests separated by tool calls.

- Adds completed main requests during that turn, with step deduplication.
- Uses final turn usage to replace, not add to, the provisional total.
- Excludes subagent requests.
- Resets when a new main turn starts, not when a prompt is merely queued.
- Retains confirmed usage and shows `(partial)` after an interruption or missing final usage.
- Percentages use `Uncached Input + Output` as the denominator. They are **token shares, not monetary cost shares**, context occupancy or session-lifetime totals.
- Tiny segments can round to zero terminal cells; their numeric percentages remain visible.

“本轮”不是单次 API 请求，也不是整个聊天历史：它包括一条用户消息触发的这一轮里，多次主模型请求的累计，不包含子代理。横条是 token 数量占比，不是费用占比。

### Refresh behavior and limitations

- Context/cache/speed update after each completed main model request, not token by token during a stream.
- Model selection, available effort configuration and window capacity are checked once a second. `/model` and `/effort` also trigger a check after execution.
- Immediate effort refresh depends on whether the host exposes the current effort in its public configuration rows. If it does not, the next main request is the fallback. This availability has not been verified across builds.
- A changed model with unavailable window metadata shows `/ -`; capacity is retried, not guessed. The engine may itself delay publishing new metadata.
- Switching models does not reset Consumption or erase the most recently confirmed request metrics.
- Hook-state tests do not substitute for checking font rendering or installation on another person's build.

## Privacy

The mod uses the host's model/configuration/usage interfaces, session state and timers. Its source makes no HTTP requests, reads no transcript or credential files, and starts no external processes. It does not estimate tokens by sending additional model requests. It does not add telemetry of its own.

## Development

Clone the repository, then validate and run the tests with a compatible Claude Code build:

```sh
git clone https://github.com/KuroIVeko/wizard-crab.git
cd wizard-crab
claude plugin validate .
claude plugin test .
```

For local development, start a separate session with the folder loaded:

```sh
claude --plugin-dir .
```

The source includes regression tests for quadrant geometry, animation, model/effort updates, context refresh, streaming pass-through and token accounting. The `claude-code` runtime and `claude-code/testing` are provided by the host; they are not third-party npm packages to install.

### Files

- `.claude-plugin/plugin.json`: plugin metadata and state contract reference.
- `.claude-plugin/marketplace.json`: GitHub-installable marketplace entry.
- `hooks/register.tsx`: lifecycle hooks and terminal UI.
- `hooks/sprite.ts`: shared pixel-grid sprite renderer.
- `hooks/consumption.ts`: pure token accounting and horizontal-bar helpers.
- `hooks/*.test.ts`: regression tests.
- `types/index.d.ts`: plugin state types.
