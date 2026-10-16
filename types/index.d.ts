export type ConsumptionSample = { input: number; output: number }

export type ConsumptionState = ConsumptionSample & {
  turnId: string | null
  hasUsage: boolean
  finalized: boolean
  partial: boolean
  steps: Record<string, ConsumptionSample>
}

declare module 'claude-code' {
  interface PluginState {
    'wizard-crab': {
      frame: number
      consumption: ConsumptionState
      modelInfo: {
        model: string | null
        effort: string | number | null
      }
      metrics: {
        contextTokens: number
        contextWindow: number
        contextPercent: number
        cacheHitRate: number
        tokPerSec: number
        ttftMs: number
      } | null
    }
  }
}
