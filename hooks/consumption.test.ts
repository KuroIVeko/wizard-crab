import { expect, test } from 'claude-code/testing'
import type { Mounted } from 'claude-code/testing'
import type { ModelUsage, RenderPropsOf } from 'claude-code'

import { consumptionBar, consumptionPercent, consumptionSample, emptyConsumption, finishConsumption, recordConsumption, startConsumption } from './consumption'

function usage(input: number, output: number, cached = 0, created = 0): ModelUsage {
  return { input_tokens: input, output_tokens: output, cache_read_input_tokens: cached, cache_creation_input_tokens: created }
}

const props: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false, isWorking: true, maxRows: 24, bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 24 }, view: {},
}

async function reading(ui: Mounted<'terminal', 'AbovePrompt'>) {
  const input = await ui.find({ type: 'Text', text: /^● Uncached Input/ })
  const output = await ui.find({ type: 'Text', text: /^● Output/ })
  const title = await ui.find({ type: 'Text', text: /^Consumption / })
  const bar = await ui.find({ type: 'Text', text: /^[━─]+$/ })
  return {
    input: input?.text.replace(/\s+/g, ' '),
    output: output?.text.replace(/\s+/g, ' '),
    title: title?.text,
    bar: bar?.text,
  }
}

test('consumption excludes cache reads and includes cache writes without estimating tokens', () => {
  expect(consumptionSample(usage(100, 20, 9000, 50))).toEqual({ input: 150, output: 20 })
  expect(consumptionSample(usage(0, 0, 10000, 0))).toEqual({ input: 0, output: 0 })
  expect(consumptionSample(null)).toBe(null)
  expect(consumptionSample(undefined)).toBe(null)
  for (const invalid of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(consumptionSample(usage(invalid, 1))).toBe(null)
  }
})

test('steps replace duplicate samples and completion replaces rather than adds the aggregate', () => {
  let state = startConsumption(emptyConsumption(), 'a')
  state = recordConsumption(state, 'a', 0, usage(100, 20, 1000, 10))
  expect({ input: state.input, output: state.output }).toEqual({ input: 110, output: 20 })
  expect(recordConsumption(state, 'a', 0, usage(100, 20, 1000, 10))).toBe(state)
  state = recordConsumption(state, 'a', 0, usage(150, 30))
  state = recordConsumption(state, 'a', 1, usage(200, 40))
  expect({ input: state.input, output: state.output }).toEqual({ input: 350, output: 70 })
  expect(recordConsumption(state, 'a', 2, null)).toBe(state)
  expect(recordConsumption(state, 'a', -1, usage(1, 1))).toBe(state)
  state = finishConsumption(state, 'a', usage(400, 90, 90000, 50))
  expect({ input: state.input, output: state.output }).toEqual({ input: 450, output: 90 })
  expect(state.finalized).toBe(true)
  expect(state.steps).toEqual({})
  expect(recordConsumption(state, 'a', 2, usage(1000, 1000))).toBe(state)
  expect(finishConsumption(state, 'a', usage(400, 90, 90000, 50))).toEqual(state)
  expect(finishConsumption(state, 'a', null)).toBe(state)

  state = startConsumption(state, 'b')
  expect(state).toEqual(emptyConsumption('b'))
  expect(recordConsumption(state, 'a', 3, usage(1000, 1000))).toBe(state)
  expect(finishConsumption(state, 'a', usage(1000, 1000))).toBe(state)
})

test('missing final usage preserves confirmed partial data and zero differs from unknown', () => {
  let state = recordConsumption(emptyConsumption('a'), 'a', 0, usage(100, 20))
  state = finishConsumption(state, 'a', undefined, true)
  expect(state.input).toBe(100)
  expect(state.output).toBe(20)
  expect(state.partial).toBe(true)
  expect(state.hasUsage).toBe(true)
  const zero = finishConsumption(emptyConsumption('zero'), 'zero', usage(0, 0))
  expect(zero.hasUsage).toBe(true)
  expect(zero.partial).toBe(false)
  expect(emptyConsumption().hasUsage).toBe(false)
})

test('horizontal bar has bounded width and truthful labels for tiny and zero shares', () => {
  const sample = finishConsumption(emptyConsumption('a'), 'a', usage(96000, 712))
  const bar = consumptionBar(sample)
  expect(bar.input.length + bar.output.length).toBe(32)
  expect(bar.inputPercent).toBe('99.3%')
  expect(bar.outputPercent).toBe('0.7%')
  expect(bar.output).toBe('') // Below the terminal's one-cell resolution, not a fake minimum share.
  expect(consumptionPercent(1, 1000000)).toBe('<0.1%')
  expect(consumptionPercent(999999, 1000000)).toBe('>99.9%')
  expect(consumptionPercent(0, 0)).toBe('-')
  for (const [input, output] of [[0, 0], [0, 100], [100, 0], [50, 50], [999, 1], [1, 999]]) {
    const state = finishConsumption(emptyConsumption('a'), 'a', usage(input, output))
    for (const columns of [0, 1, 2, 12, 32, 80, -1, NaN, Infinity]) {
      const result = consumptionBar(state, columns)
      const width = Number.isFinite(columns) ? Math.max(0, Math.min(32, Math.floor(columns))) : 0
      expect(result.input.length + result.output.length + result.empty.length).toBe(width)
      if (input + output > 0) {
        expect(Math.abs(result.input.length - input / (input + output) * width) <= 0.5).toBe(true)
      }
    }
  }
})

test('consumption updates during the turn, survives queued prompts, and finalizes without double counting', async ($, on) => {
  let sample = usage(80, 20, 1000, 20)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'Hello' }
    return { turnId: e.turnId, index: e.index, answer: 'Hello', toolUses: [], stopReason: 'end_turn', usage: { ...sample, model: e.model } }
  })
  const ui = await $.ui.mount({ plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props })
  expect((await reading(ui)).input).toBe('● Uncached Input - -')
  await $.turn.start({ turnId: 'a', text: 'hello' })
  const run = async (index: number) => {
    const stream = $.turn.step({ turnId: 'a', index, model: 'main', messageCount: 1 })
    for await (const _ of stream) {}
  }
  await run(0)
  expect(await reading(ui)).toMatchObject({ input: '● Uncached Input 100 83.3%', output: '● Output 20 16.7%' })
  await $.prompt.submit({ text: 'queued next turn', wait: true, origin: { kind: 'composer' }, turnId: 'a' })
  expect((await reading(ui)).input).toBe('● Uncached Input 100 83.3%')

  sample = usage(100, 30, 100000)
  await run(1)
  expect(await reading(ui)).toMatchObject({ input: '● Uncached Input 200 80.0%', output: '● Output 50 20.0%' })
  await run(1)
  expect((await reading(ui)).input).toBe('● Uncached Input 200 80.0%')
  sample = usage(150, 40)
  await run(1)
  expect(await reading(ui)).toMatchObject({ input: '● Uncached Input 250 80.6%', output: '● Output 60 19.4%' })

  await $.turn.complete({
    answer: 'done', durationMs: 100, isAborted: false, reason: 'answer', turnId: 'a',
    usage: { ...usage(200, 70, 999999, 50), model: 'main' },
  })
  expect(await reading(ui)).toMatchObject({ input: '● Uncached Input 250 78.1%', output: '● Output 70 21.9%' })
  expect((await reading(ui)).bar?.length).toBe(32)
})

test('consumption ignores subagents and late responses from a previous turn', async ($, on) => {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'Hello' }
    return { turnId: e.turnId, index: e.index, answer: 'Hello', toolUses: [], stopReason: 'end_turn', usage: { ...usage(100, 50), model: e.model } }
  })
  const ui = await $.ui.mount({ plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props })
  await $.turn.start({ turnId: 'a', text: 'first' })
  const late = $.turn.step({ turnId: 'a', index: 0, model: 'main', messageCount: 1 })
  await late.next()
  await $.turn.start({ turnId: 'b', text: 'second' })
  const pending = await reading(ui)
  for await (const _ of late) {}
  await $.turn.complete({ answer: 'old', durationMs: 10, isAborted: false, reason: 'answer', turnId: 'a', usage: { ...usage(1000, 1000), model: 'main' } })
  expect(await reading(ui)).toEqual(pending)

  await $.turn.start({ turnId: 'child', text: 'child', agentId: 'agent-1' })
  const child = $.turn.step({ turnId: 'child', index: 0, model: 'child', messageCount: 1, agentId: 'agent-1' })
  for await (const _ of child) {}
  await $.turn.complete({ answer: 'child', durationMs: 10, isAborted: false, reason: 'answer', turnId: 'child', agentId: 'agent-1', usage: { ...usage(1000, 1000), model: 'child' } })
  expect(await reading(ui)).toEqual(pending)
})

test('interruption retains known consumption, and a fresh turn resets it', async ($, on) => {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  let hasUsage = true
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'Hello' }
    return { turnId: e.turnId, index: e.index, answer: 'Hello', toolUses: [], stopReason: 'end_turn', usage: hasUsage ? { ...usage(10, 10), model: e.model } : null }
  })
  const ui = await $.ui.mount({ plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props })
  await $.turn.start({ turnId: 'a', text: 'hello' })
  for (const index of [0, 1]) {
    const stream = $.turn.step({ turnId: 'a', index, model: 'main', messageCount: 1 })
    for await (const _ of stream) {}
    hasUsage = false
  }
  expect(await reading(ui)).toMatchObject({ input: '● Uncached Input 10 50.0%', output: '● Output 10 50.0%' })
  await $.turn.complete({ answer: '', durationMs: 10, isAborted: true, reason: 'aborted', turnId: 'a' })
  expect(await reading(ui)).toMatchObject({ input: '● Uncached Input 10 50.0%', title: 'Consumption · this turn (partial)' })
  await $.turn.start({ turnId: 'b', text: 'new' })
  expect(await reading(ui)).toMatchObject({ input: '● Uncached Input - -', output: '● Output - -', title: 'Consumption · this turn' })
})

test('consumption stays horizontal with a shorter bar in narrow panels', async ($, on) => {
  on('turn.complete', ($, e) => ({ text: e.answer }))
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, reason: 'answer', turnId: 'a', usage: { ...usage(75, 25), model: 'main' } })
  for (const columns of [80, 50, 30]) {
    const ui = await $.ui.mount({ plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props: { ...props, bodyColumns: columns } })
    expect((await reading(ui)).bar?.length).toBe(Math.min(32, columns - 18))
  }
})
