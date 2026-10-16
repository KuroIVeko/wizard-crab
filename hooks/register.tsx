import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, Register, SessionContextUsage } from 'claude-code'

import { COLUMNS, CYCLE, FRAME_MS, sprite } from './sprite'
import { BAR_COLUMNS, CONSUMPTION_COLORS, consumptionBar, emptyConsumption, finishConsumption, recordConsumption, startConsumption } from './consumption'

const SPELLS = ['Casting spells', 'Chanting', 'Brewing potions', 'Summoning ideas', 'Enchanting', 'Stargazing']

type MetricsState = {
  contextTokens: number
  contextWindow: number
  contextPercent: number
  cacheHitRate: number
  tokPerSec: number
  ttftMs: number
} | null

const frame = atom({ plugin: 'wizard-crab', key: 'frame' } as const, 0)
const metrics = atom({ plugin: 'wizard-crab', key: 'metrics' } as const, null as MetricsState)
const consumption = atom({ plugin: 'wizard-crab', key: 'consumption' } as const, emptyConsumption())
const modelInfo = atom({ plugin: 'wizard-crab', key: 'modelInfo' } as const, {
  model: null as string | null,
  effort: null as string | number | null,
})

// Wand animation: [head-row tail, body-row tail]
const WAND = [
  [' ✦', '╱'],
  [' ✧', '╱·'],
  [' ╱', '─✦'],
  [' ✧', '╱·'],
]
const WAND_COLUMNS = 4

export const register: Register = (on) => {
  let isWorking = false
  let latestStep: { turnId: string; usage: ModelUsage } | null = null

  on('session.start', async ($, e, next) => {
    try {
      const model = await $.session.model()
      const effort = await selectedEffort($)
      await update($, modelInfo, () => ({ model, effort: effort ?? null }))
    } catch {}

    try {
      const usage = await $.session.usage()
      if (usage?.context) {
        const contextTokens = usage.context.tokens ?? 0
        const contextWindow = usage.context.window ?? 0
        const contextPercent = usage.context.percent ?? (contextWindow > 0 ? Math.round((contextTokens / contextWindow) * 100) : 0)
        await update($, metrics, () => ({
          contextTokens,
          contextWindow,
          contextPercent,
          cacheHitRate: 0,
          tokPerSec: 0,
          ttftMs: 0,
        }))
      }
    } catch {}

    $.clock.every(1000, () => refreshSelectedModel($))

    $.clock.every(FRAME_MS, async () => {
      if (isWorking) {
        await update($, frame, (n) => (n + 1) % CYCLE)
      }
    })

    return next(e)
  })

  on('command.run', { command: 'model' }, async ($, e, next) => {
    const result = await next(e)
    await refreshSelectedModel($)
    return result
  })

  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const result = await next(e)
    await refreshSelectedModel($)
    return result
  })

  on('prompt.submit', ($, e, next) => {
    isWorking = true

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      await update($, consumption, state => startConsumption(state, e.turnId))
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      await update($, consumption, state => startConsumption(state, e.turnId))
      await update($, modelInfo, () => ({ model: e.model, effort: e.effort ?? null }))
    }
    const t0 = Date.now()
    let tFirst: number | null = null
    const stream = next(e)

    for await (const chunk of stream) {
      if (tFirst === null) {
        tFirst = Date.now()
      }
      yield chunk
    }

    const tEnd = Date.now()
    const result = await stream.result
    if (!e.agentId) {
      try {
        await update($, consumption, state => recordConsumption(state, e.turnId, e.index, result.usage))
        const ttftMs = tFirst !== null ? Math.max(0, tFirst - t0) : 0
        const outTokens = result.usage?.output_tokens ?? 0
        const durationSec = Math.max(0.001, (tEnd - (tFirst ?? t0)) / 1000)
        const tokPerSec = outTokens > 0 ? Math.round((outTokens / durationSec) * 10) / 10 : 0
        if (result.usage) latestStep = { turnId: e.turnId, usage: result.usage }
        await refreshMetrics($, result.usage, true, { tokPerSec, ttftMs })
      } catch {}
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) return next(e)

    isWorking = false
    await update($, frame, () => 0)
    const result = await next(e)

    try {
      await update($, consumption, state => finishConsumption(state, e.turnId, e.usage, e.isAborted || e.reason === 'error'))
      const step = latestStep?.turnId === e.turnId ? latestStep : null
      // A turn sums several requests; it is not the size of the context window.
      await refreshMetrics($, step?.usage ?? e.usage, step !== null)
    } catch {}

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const n = await read($, frame)
    const data = await read($, metrics)
    const model = await read($, modelInfo)
    const spent = await read($, consumption)
    const infoColumns = Math.max(0, e.props.bodyColumns - COLUMNS - WAND_COLUMNS - 3)
    const bar = consumptionBar(spent, Math.min(BAR_COLUMNS, infoColumns))
    const { rows: drawing, isUp } = sprite(n)
    const [head, body] = WAND[n % WAND.length]
    const wand = drawing.map((_, y) => {
      const tail = y === 4 ? head : y === 5 ? body : ''
      return tail.padEnd(WAND_COLUMNS, ' ')
    })
    const rows = drawing.map((row, y) => (
      <Text key={`row-${y}`} wrap="truncate">
        <Text color={row.color}>{row.glyphs}</Text>
        <Text color="yellow">{wand[y]}</Text>
      </Text>
    ))
    const gap = <Text key="gap">{' '.repeat(COLUMNS + WAND_COLUMNS)}</Text>

    return (
      <Box flexDirection="row" alignItems="center">
        <Box flexDirection="column" width={COLUMNS + WAND_COLUMNS} flexShrink={0}>
          {isUp ? [...rows, gap] : [gap, ...rows]}
        </Box>
        <Box flexDirection="column" marginLeft={3} width={infoColumns}>
          <Text key="model" wrap="truncate">
            <Text dimColor>Model </Text>
            <Text color="cyan">{model.model ?? '-'}</Text>
            <Text color="yellow">{model.effort != null ? ` ${model.effort}` : ''}</Text>
          </Text>
          {data ? (
            <Box flexDirection="column">
              <Text wrap="truncate">
                <Text dimColor>Context </Text>
                <Text color="cyan">{formatNumber(data.contextTokens)}</Text>
                <Text dimColor>{data.contextWindow > 0 ? ` / ${formatNumber(data.contextWindow)} (${data.contextPercent}%)` : ' / -'}</Text>
              </Text>
              <Text wrap="truncate">
                <Text dimColor>Cache hit </Text>
                <Text color={data.cacheHitRate >= 80 ? 'green' : data.cacheHitRate >= 50 ? 'yellow' : 'gray'}>
                  {data.cacheHitRate}%
                </Text>
                <Text dimColor> ⚡</Text>
              </Text>
            </Box>
          ) : null}
          <Text wrap="truncate">
            <Text dimColor>Speed </Text>
            <Text color="magenta">{data && data.tokPerSec > 0 ? `${data.tokPerSec} tok/s` : '-'}</Text>
            <Text dimColor> · TTFT </Text>
            <Text color="blue">{data && data.ttftMs > 0 ? formatMs(data.ttftMs) : '-'}</Text>
          </Text>
          <Box flexDirection="column">
            <Text wrap="truncate">Consumption · this turn{spent.partial ? ' (partial)' : ''}</Text>
            <Text wrap="truncate">
              <Text color={CONSUMPTION_COLORS.input}>{bar.input}</Text>
              <Text color={CONSUMPTION_COLORS.output}>{bar.output}</Text>
              <Text dimColor>{bar.empty}</Text>
            </Text>
            <Text wrap="truncate">
              <Text color={CONSUMPTION_COLORS.input}>● </Text>
              <Text>{'Uncached Input'.padEnd(14)} {(spent.hasUsage ? formatNumber(spent.input) : '-').padStart(7)} {bar.inputPercent.padStart(7)}</Text>
            </Text>
            <Text wrap="truncate">
              <Text color={CONSUMPTION_COLORS.output}>● </Text>
              <Text>{'Output'.padEnd(14)} {(spent.hasUsage ? formatNumber(spent.output) : '-').padStart(7)} {bar.outputPercent.padStart(7)}</Text>
            </Text>
          </Box>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    const word = SPELLS[Math.abs(hash(e.requestId ?? e.props.word)) % SPELLS.length]

    return next({ ...e, props: { ...e.props, word: `🪄 ${word}` } })
  })
}

async function selectedEffort($: EngineInterface): Promise<string | number | null | undefined> {
  try {
    const rows = await $.config.list()
    const row = rows.find(row => row.provider.plugin === 'engine'
      && (/^(?:reasoning)?effort(?:level)?$/i.test(row.key)
        || /^(?:reasoning\s+)?effort(?:\s+level)?$/i.test(row.label.trim())))
    if (!row) return undefined
    const value = row.value
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value
    return null
  } catch {
    return undefined
  }
}

async function refreshSelectedModel($: EngineInterface) {
  try {
    const model = await $.session.model()
    const effort = await selectedEffort($)
    const previous = await read($, modelInfo)
    const modelChanged = previous.model !== model
    const nextEffort = effort !== undefined ? effort : modelChanged ? null : previous.effort
    if (modelChanged || previous.effort !== nextEffort) {
      await update($, modelInfo, () => ({ model, effort: nextEffort }))
    }
    let context: SessionContextUsage | undefined
    try {
      context = (await $.session.usage()).context
    } catch {}
    await update($, metrics, prev => {
      if (!prev && !context) return prev
      const contextTokens = prev?.contextTokens ?? context?.tokens ?? 0
      const contextWindow = context?.window ?? (modelChanged ? 0 : prev?.contextWindow ?? 0)
      const contextPercent = contextWindow > 0
        ? Math.min(100, Math.round((contextTokens / contextWindow) * 100))
        : 0
      if (prev && prev.contextWindow === contextWindow && prev.contextPercent === contextPercent) return prev
      return {
        contextTokens, contextWindow, contextPercent,
        cacheHitRate: prev?.cacheHitRate ?? 0,
        tokPerSec: prev?.tokPerSec ?? 0,
        ttftMs: prev?.ttftMs ?? 0,
      }
    })
  } catch {}
}

async function refreshMetrics(
  $: EngineInterface,
  usage: ModelUsage | null | undefined,
  isStep: boolean,
  timing?: { tokPerSec: number; ttftMs: number },
) {
  let context: SessionContextUsage | undefined
  try {
    context = (await $.session.usage()).context
  } catch {}

  const totalInput = usage
    ? usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
    : undefined

  await update($, metrics, (prev) => {
    // The just-finished response is fresher than the engine's usage snapshot.
    const contextTokens = isStep
      ? totalInput ?? prev?.contextTokens ?? context?.tokens ?? 0
      : context?.tokens ?? prev?.contextTokens ?? 0
    const contextWindow = context?.window ?? prev?.contextWindow ?? 0
    const contextPercent = contextWindow > 0
      ? Math.min(100, Math.round((contextTokens / contextWindow) * 100))
      : 0
    const cacheHitRate = usage && totalInput !== undefined && totalInput > 0
      ? Math.round((usage.cache_read_input_tokens / totalInput) * 1000) / 10
      : prev?.cacheHitRate ?? 0

    return {
      contextTokens,
      contextWindow,
      contextPercent,
      cacheHitRate,
      tokPerSec: timing?.tokPerSec || prev?.tokPerSec || 0,
      ttftMs: timing?.ttftMs || prev?.ttftMs || 0,
    }
  })
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000
    return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)) + 'M'
  }
  if (n >= 1_000) {
    const v = n / 1_000
    return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)) + 'k'
  }
  return String(n)
}

function formatMs(ms: number): string {
  if (ms <= 0) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function hash(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return h
}
