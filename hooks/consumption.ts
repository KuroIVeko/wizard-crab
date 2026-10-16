import type { ModelUsage } from 'claude-code'
import type { ConsumptionSample, ConsumptionState } from '../types'

export const CONSUMPTION_COLORS = { input: '#2a78d6', output: '#d95926' }
export const BAR_COLUMNS = 32

export function emptyConsumption(turnId: string | null = null): ConsumptionState {
  return { turnId, input: 0, output: 0, hasUsage: false, finalized: false, partial: false, steps: {} }
}

export function startConsumption(state: ConsumptionState, turnId: string): ConsumptionState {
  return state.turnId === turnId ? state : emptyConsumption(turnId)
}

function isCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

export function consumptionSample(usage: ModelUsage | null | undefined): ConsumptionSample | null {
  if (!usage) return null
  const counts = [usage.input_tokens, usage.cache_creation_input_tokens, usage.output_tokens]
  if (!counts.every(isCount)) return null
  // Cached reads are intentionally excluded; cache writes are uncached input.
  const input = usage.input_tokens + usage.cache_creation_input_tokens
  return isCount(input) ? { input, output: usage.output_tokens } : null
}

export function recordConsumption(
  state: ConsumptionState,
  turnId: string,
  index: number,
  usage: ModelUsage | null | undefined,
): ConsumptionState {
  if (state.turnId !== turnId || state.finalized || !isCount(index)) return state
  const sample = consumptionSample(usage)
  if (!sample) return state
  const previous = state.steps[String(index)]
  if (previous?.input === sample.input && previous.output === sample.output) return state
  const input = state.input - (previous?.input ?? 0) + sample.input
  const output = state.output - (previous?.output ?? 0) + sample.output
  if (!isCount(input) || !isCount(output)) return state
  return {
    ...state, input, output, hasUsage: true,
    steps: { ...state.steps, [String(index)]: sample },
  }
}

export function finishConsumption(
  state: ConsumptionState,
  turnId: string,
  usage: ModelUsage | null | undefined,
  interrupted = false,
): ConsumptionState {
  if (state.turnId !== null && state.turnId !== turnId) return state
  const sample = consumptionSample(usage)
  if (state.finalized && !sample) return state
  return {
    ...state, ...(sample ?? {}), turnId,
    hasUsage: state.hasUsage || sample !== null,
    finalized: true,
    partial: interrupted || sample === null,
    steps: {},
  }
}

export function consumptionPercent(part: number, total: number): string {
  if (total <= 0) return '-'
  const percent = (part / total) * 100
  if (part > 0 && percent < 0.1) return '<0.1%'
  if (part < total && percent > 99.9) return '>99.9%'
  return `${percent.toFixed(1)}%`
}

export function consumptionBar(state: ConsumptionState, columns = BAR_COLUMNS) {
  const width = Number.isFinite(columns) ? Math.max(0, Math.min(BAR_COLUMNS, Math.floor(columns))) : 0
  const total = state.input + state.output
  const ready = state.hasUsage && total > 0
  // Terminal cells are discrete: do not inflate a tiny share to a whole cell.
  const inputCells = ready ? Math.round((state.input / total) * width) : 0
  const outputCells = ready ? width - inputCells : 0
  return {
    input: '━'.repeat(inputCells),
    output: '━'.repeat(outputCells),
    empty: ready ? '' : '─'.repeat(width),
    inputPercent: ready ? consumptionPercent(state.input, total) : '-',
    outputPercent: ready ? consumptionPercent(state.output, total) : '-',
  }
}
