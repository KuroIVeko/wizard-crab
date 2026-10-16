import { expect, mock, test } from 'claude-code/testing'
import type { ModelUsage, RenderElement, RenderPropsOf } from 'claude-code'

import { COLUMNS, CYCLE, FRAME_MS, HEIGHT, ROWS, WIDTH, encode, quadrant, sprite } from './sprite'

// Independent visual definitions, rather than the encoder's bit table.
const SHAPES: Record<string, string[]> = {
  ' ': ['00', '00'], '▘': ['10', '00'], '▝': ['01', '00'], '▀': ['11', '00'],
  '▖': ['00', '10'], '▌': ['10', '10'], '▞': ['01', '10'], '▛': ['11', '10'],
  '▗': ['00', '01'], '▚': ['10', '01'], '▐': ['01', '01'], '▜': ['11', '01'],
  '▄': ['00', '11'], '▙': ['10', '11'], '▟': ['01', '11'], '█': ['11', '11'],
}

function decode(rows: string[]) {
  const pixels = Array.from({ length: HEIGHT }, () => Array<boolean>(WIDTH).fill(false))
  rows.forEach((row, y) => {
    Array.from(row).forEach((glyph, x) => {
      const shape = SHAPES[glyph]
      if (!shape) throw new Error(`Unknown quadrant: ${glyph}`)
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          pixels[y * 2 + dy][x * 2 + dx] = shape[dy][dx] === '1'
        }
      }
    })
  })
  return pixels
}

function checkGeometry(rows: string[]) {
  expect(rows).toHaveLength(ROWS)
  expect(rows.map(row => row.length)).toEqual(Array(ROWS).fill(COLUMNS))
  const pixels = decode(rows)
  for (let y = 8; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      expect(pixels[y][x]).toBe(pixels[y][WIDTH - 1 - x])
    }
  }
  const feet = pixels[12].flatMap((on, x) => on ? [x] : [])
  expect(feet).toHaveLength(4)
  expect(feet.reduce((sum, x) => sum + x, 0) / feet.length).toBe((WIDTH - 1) / 2)
  for (const x of feet) expect(pixels[11][x]).toBe(true)
  expect(pixels[13].some(Boolean)).toBe(false)
  return feet
}

const bandProps: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 20,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}

function textOf(tree: RenderElement | string): string {
  if (typeof tree === 'string') return tree
  return 'children' in tree ? (tree.children ?? []).map(textOf).join('') : ''
}

function physicalRows(tree: RenderElement) {
  if (tree.type !== 'Box') throw new Error('Expected the sprite Box')
  const crabBox = (tree.children?.[0] && typeof tree.children[0] === 'object' && 'type' in tree.children[0] && tree.children[0].type === 'Box')
    ? tree.children[0]
    : tree
  return (crabBox.children ?? []).map(textOf)
}

test('all 16 quadrant masks encode the intended four pixels', () => {
  const glyphs = new Set<string>()
  for (let mask = 0; mask < 16; mask++) {
    const glyph = quadrant(mask)
    glyphs.add(glyph)
    const shape = SHAPES[glyph]
    expect(shape[0]).toBe(`${Number(Boolean(mask & 1))}${Number(Boolean(mask & 2))}`)
    expect(shape[1]).toBe(`${Number(Boolean(mask & 4))}${Number(Boolean(mask & 8))}`)
  }
  expect(glyphs.size).toBe(16)
  expect(() => quadrant(-1)).toThrow()
  expect(() => quadrant(16)).toThrow()
  expect(() => quadrant(0.5)).toThrow()
  expect(() => encode([])).toThrow()
})

test('all encoded poses are symmetric, connected and fixed-size', () => {
  for (let n = 0; n < CYCLE; n++) {
    const pose = sprite(n)
    const rows = pose.rows.map(row => row.glyphs)
    expect(decode(rows)).toEqual(pose.pixels)
    const feet = checkGeometry(rows)
    expect(feet).toEqual(pose.isUp ? [4, 6, 15, 17] : [5, 7, 14, 16])
  }
  expect(sprite(CYCLE)).toEqual(sprite(0))
})

test('opening moves both leg groups outwards by exactly half a character', () => {
  const closed = checkGeometry(sprite(0).rows.map(row => row.glyphs))
  const open = checkGeometry(sprite(1).rows.map(row => row.glyphs))
  expect(open.map((x, i) => x - closed[i])).toEqual([-1, -1, 1, 1])
  expect(open[3] - open[0]).toBe(13)
  expect(closed[3] - closed[0]).toBe(11)
})

test('blink changes only the two eye pixels and leaves the pose intact', () => {
  const open = sprite(2).pixels
  const blink = sprite(6).pixels
  const changed: number[][] = []
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (open[y][x] !== blink[y][x]) changed.push([x, y])
    }
  }
  expect(changed).toEqual([[6, 9], [15, 9]])
  expect(blink[9][6]).toBe(true)
  expect(blink[9][15]).toBe(true)
})

test('terminal mount follows the clock for a full cycle and stops at frame zero', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props: bandProps,
  })
  const initial = physicalRows(await ui.drawn())
  await clock.advance(FRAME_MS * 2)
  expect(physicalRows(await ui.drawn())).toEqual(initial)
  await $.prompt.submit({ text: 'animate', wait: false, origin: { kind: 'composer' } })
  await clock.advance(FRAME_MS - 1)
  expect(physicalRows(await ui.drawn())).toEqual(initial)
  await clock.advance(1)

  for (let n = 1; n <= CYCLE; n++) {
    const pose = sprite(n)
    const rows = physicalRows(await ui.drawn())
    expect(rows).toHaveLength(ROWS + 1)
    expect(rows.map(row => row.length)).toEqual(Array(ROWS + 1).fill(COLUMNS + 4))
    expect(pose.isUp ? rows[ROWS] : rows[0]).toBe(' '.repeat(COLUMNS + 4))
    const drawing = rows.slice(pose.isUp ? 0 : 1, pose.isUp ? ROWS : ROWS + 1)
    const glyphs = drawing.map(row => row.slice(0, COLUMNS))
    expect(glyphs).toEqual(pose.rows.map(row => row.glyphs))
    checkGeometry(glyphs)
    if (n < CYCLE) await clock.advance(FRAME_MS)
  }
  expect(physicalRows(await ui.drawn())).toEqual(initial)
  await clock.advance(FRAME_MS * 2)
  expect(physicalRows(await ui.drawn())).not.toEqual(initial)
  await $.turn.complete({ answer: 'done', durationMs: 2000, isAborted: false, turnId: 'test', reason: 'answer' })
  expect(physicalRows(await ui.drawn())).toEqual(initial)
  await clock.advance(FRAME_MS * CYCLE)
  expect(physicalRows(await ui.drawn())).toEqual(initial)
})

test('survey content passes through without drawing a crab', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: ['survey'] }))
  const ui = await $.ui.mount({
    plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt',
    props: { ...bandProps, hasSurvey: true },
  })
  expect(textOf(await ui.drawn())).toBe('survey')
})

test('spinner preserves engine rendering and only changes its spell word', async ($, on) => {
  const original: RenderPropsOf['Spinner'] = {
    word: 'Working', message: null, suffix: '…', mode: 'thinking',
  }
  let received: RenderPropsOf['Spinner'] | undefined
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    received = e.props
    return { type: 'Text', children: [e.props.word] }
  })
  const ui = await $.ui.mount({
    plugin: 'wizard-crab', surface: 'terminal', component: 'Spinner', props: original,
  })
  expect(textOf(await ui.drawn())).toMatch(/^🪄 (Casting spells|Chanting|Brewing potions|Summoning ideas|Enchanting|Stargazing)$/)
  expect(received).toEqual({ ...original, word: textOf(await ui.drawn()) })
})

test('renders context tokens and cache hit rate alongside the crab after turn completes', async ($, on) => {
  mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({
    plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props: bandProps,
  })

  // 模拟 turn.complete 携带使用量
  await $.turn.complete({
    answer: 'ok',
    durationMs: 1500,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: {
      model: 'claude-3-7-sonnet',
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 900,
      cache_creation_input_tokens: 0,
    },
  })

  const drawnText = textOf(await ui.drawn())
  expect(drawnText).toContain('Context')
  expect(drawnText).toContain('Cache hit')
  expect(drawnText).toContain('90%')
})

test('measures TTFT and tok/s from turn.step streaming chunks', async ($, on) => {
  mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'Hello' }
    return {
      turnId: e.turnId,
      index: e.index,
      answer: 'Hello',
      toolUses: [],
      stopReason: 'end_turn',
      usage: {
        model: 'claude-3-7-sonnet',
        input_tokens: 50,
        output_tokens: 100,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    }
  })
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({
    plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props: bandProps,
  })

  const stream = $.turn.step({
    turnId: 't1',
    index: 0,
    model: 'claude-3-7-sonnet',
    messageCount: 1,
  })
  for await (const _ of stream) {}
  await stream.result

  const drawnText = textOf(await ui.drawn())
  expect(drawnText).toContain('Speed')
  expect(drawnText).toContain('tok/s')
  expect(drawnText).toContain('TTFT')
})

test('shows the selected model on startup even when usage is unavailable', async ($, on) => {
  mock.clock(on)
  on('session.model', () => ({ value: 'startup-model' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props: bandProps,
  })
  expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe('Model startup-model')
  expect(await ui.find({ type: 'Text', text: /^Effort / })).toBe(undefined)
})

test('shows speed and TTFT placeholders before any request with or without session usage', async ($, on) => {
  mock.clock(on)
  on('session.model', () => ({ value: 'startup-model' }))
  on('session.usage', () => ({ value: {
    startedAt: 0, context: { tokens: 0, window: 200_000, percent: 0 }, rateLimits: [],
  } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  const ui = await $.ui.mount({
    plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props: bandProps,
  })
  expect((await ui.find({ type: 'Text', text: /^Speed / }))?.text).toBe('Speed - · TTFT -')
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  expect((await ui.find({ type: 'Text', text: /^Context / }))?.text).toBe('Context 0 / 200k (0%)')
  expect((await ui.find({ type: 'Text', text: /^Speed / }))?.text).toBe('Speed - · TTFT -')
})

test('updates the selected model after a model command without a model request', async ($, on) => {
  mock.clock(on)
  let selected = 'old-model'
  on('session.model', () => ({ value: selected }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.run', { command: 'model' }, ($, e) => {
    selected = e.args
    return { text: 'model switched' }
  })
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props: bandProps,
  })
  expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe('Model old-model')
  const result = await $.command.run({ command: 'model', args: 'new-model' })
  expect(result.text).toBe('model switched')
  expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe('Model new-model')
})

test('reads selected effort at startup and refreshes commands and menu changes without requests', async ($, on) => {
  const clock = mock.clock(on)
  let selected = 'main-model'
  let configured: string | number | boolean = 'high'
  let unavailable = false
  let rejectCommand = false
  on('session.model', () => ({ value: selected }))
  on('config.list', () => {
    if (unavailable) throw new Error('unavailable')
    return { value: [{
      key: 'effortLevel', label: 'Effort level', kind: 'choice', value: configured,
      provider: { plugin: 'engine', tier: 'core' }, isLocked: false,
    }] }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.run', { command: 'effort' }, ($, e) => {
    if (rejectCommand) return { text: 'invalid effort' }
    configured = e.args
    return { text: 'effort switched' }
  })
  on('command.run', { command: 'model' }, ($, e) => {
    selected = e.args
    configured = 'medium'
    return { text: 'model switched' }
  })
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props: bandProps,
  })
  expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe('Model main-model high')
  const result = await $.command.run({ command: 'effort', args: 'low' })
  expect(result.text).toBe('effort switched')
  expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe('Model main-model low')
  rejectCommand = true
  await $.command.run({ command: 'effort', args: 'not-a-level' })
  expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe('Model main-model low')
  configured = 0
  await clock.advance(1000)
  expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe('Model main-model 0')
  configured = 'max'
  unavailable = true
  await clock.advance(1000)
  expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe('Model main-model 0')
  unavailable = false
  await clock.advance(1000)
  expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe('Model main-model max')
  await $.command.run({ command: 'model', args: 'next-model' })
  expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe('Model next-model medium')
  configured = false
  await clock.advance(1000)
  expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe('Model next-model')
})

test('does not treat another plugin effort setting as the selected engine effort', async ($, on) => {
  mock.clock(on)
  on('session.model', () => ({ value: 'main-model' }))
  on('config.list', () => ({ value: [{
    key: 'another-plugin.effort', label: 'Effort level', kind: 'choice', value: 'high',
    provider: { plugin: 'another-plugin', tier: 'user' }, isLocked: false,
  }] }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props: bandProps,
  })
  expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe('Model main-model')
})

test('refreshes context capacity on model switches without replacing confirmed request tokens', async ($, on) => {
  const clock = mock.clock(on)
  let selected = 'old-model'
  let window = 200_000
  let unavailable = false
  on('session.model', () => ({ value: selected }))
  on('session.usage', () => {
    if (unavailable) throw new Error('unavailable')
    return { value: { startedAt: 0, context: { tokens: 999, window }, rateLimits: [] } }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.run', { command: 'model' }, ($, e) => {
    selected = e.args
    window = 1_000_000
    return { text: 'model switched' }
  })
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'Hello' }
    return {
      turnId: e.turnId, index: e.index, answer: 'Hello', toolUses: [], stopReason: 'end_turn',
      usage: { model: e.model, input_tokens: 1000, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0, output_tokens: 10 },
    }
  })
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props: bandProps,
  })
  const stream = $.turn.step({ turnId: 'capacity', index: 0, model: selected, messageCount: 1 })
  for await (const _ of stream) {}
  expect((await ui.find({ type: 'Text', text: /^Context / }))?.text).toBe('Context 10k / 200k (5%)')
  const cache = (await ui.find({ type: 'Text', text: /^Cache hit / }))?.text
  const speed = (await ui.find({ type: 'Text', text: /^Speed / }))?.text
  await $.command.run({ command: 'model', args: 'large-model' })
  expect((await ui.find({ type: 'Text', text: /^Context / }))?.text).toBe('Context 10k / 1M (1%)')

  // Menu selection, followed by delayed availability of the new capacity.
  selected = 'small-model'
  unavailable = true
  await clock.advance(1000)
  expect((await ui.find({ type: 'Text', text: /^Context / }))?.text).toBe('Context 10k / -')
  window = 100_000
  unavailable = false
  await clock.advance(1000)
  expect((await ui.find({ type: 'Text', text: /^Context / }))?.text).toBe('Context 10k / 100k (10%)')
  expect((await ui.find({ type: 'Text', text: /^Cache hit / }))?.text).toBe(cache)
  expect((await ui.find({ type: 'Text', text: /^Speed / }))?.text).toBe(speed)
  // Capacity can settle after the model name has already updated.
  window = 200_000
  await clock.advance(1000)
  expect((await ui.find({ type: 'Text', text: /^Context / }))?.text).toBe('Context 10k / 200k (5%)')
})

test('polls menu model changes while idle, retaining effort only for the same model', async ($, on) => {
  const clock = mock.clock(on)
  let selected = 'old-model'
  let unavailable = false
  on('session.model', () => {
    if (unavailable) throw new Error('unavailable')
    return { value: selected }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'Hello' }
    return { turnId: e.turnId, index: e.index, answer: 'Hello', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props: bandProps,
  })
  const stream = $.turn.step({ turnId: 'models', index: 0, model: selected, effort: 'high', messageCount: 1 })
  for await (const _ of stream) {}
  await clock.advance(1000)
  expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe('Model old-model high')
  selected = 'menu-model'
  unavailable = true
  await clock.advance(1000)
  expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe('Model old-model high')
  unavailable = false
  await clock.advance(1000)
  expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe('Model menu-model')
})

test('updates model and effort from main requests without showing subagent settings', async ($, on) => {
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'Hello' }
    return {
      turnId: e.turnId, index: e.index, answer: 'Hello',
      toolUses: [], stopReason: 'end_turn', usage: null,
    }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const ui = await $.ui.mount({
    plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props: bandProps,
  })
  expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe('Model -')
  const cases = [
    { model: 'main-model', effort: 'high' as const, expectedModel: 'main-model', expectedEffort: 'high' },
    { model: 'agent-model', effort: 'low' as const, agentId: 'agent-1', expectedModel: 'main-model', expectedEffort: 'high' },
    { model: 'next-model', effort: 0, expectedModel: 'next-model', expectedEffort: '0' },
    { model: 'default-model', expectedModel: 'default-model', expectedEffort: '-' },
  ]
  for (const [index, item] of cases.entries()) {
    const { expectedModel, expectedEffort, ...request } = item
    const stream = $.turn.step({ ...request, turnId: 'models', index, messageCount: 1 })
    const first = await stream.next()
    expect(first.done).toBe(false)
    const effortSuffix = expectedEffort === '-' ? '' : ` ${expectedEffort}`
    expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe(`Model ${expectedModel}${effortSuffix}`)
    expect(await ui.find({ type: 'Text', text: /^Effort / })).toBe(undefined)
    for await (const _ of stream) {}
    await stream.result
  }
  await $.turn.complete({ answer: 'done', durationMs: 100, isAborted: false, turnId: 'models', reason: 'answer' })
  expect((await ui.find({ type: 'Text', text: /^Model / }))?.text).toBe('Model default-model')
  expect(await ui.find({ type: 'Text', text: /^Effort / })).toBe(undefined)
})

test('refreshes every main request before turn completion and ignores subagent metrics', async ($, on) => {
  let responseUsage: ModelUsage | null = null
  // Deliberately stale: a just-finished step must use its own input counts.
  on('session.usage', () => ({ value: {
    startedAt: 0, context: { tokens: 999, window: 200_000, percent: 100 }, rateLimits: [],
  } }))
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'Hello' }
    return {
      turnId: e.turnId, index: e.index, answer: 'Hello', toolUses: [], stopReason: 'end_turn',
      usage: responseUsage ? { ...responseUsage, model: e.model } : null,
    }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const ui = await $.ui.mount({
    plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props: bandProps,
  })
  const samples = [
    { input: 1000, read: 9000, created: 0, context: 'Context 10k / 200k (5%)', cache: '90%' },
    { input: 3000, read: 15000, created: 2000, context: 'Context 20k / 200k (10%)', cache: '75%' },
    { input: 5000, read: 0, created: 0, context: 'Context 5k / 200k (3%)', cache: '0%' },
    { input: 0, read: 0, created: 0, context: 'Context 0 / 200k (0%)', cache: '0%' },
  ]
  for (const [index, sample] of samples.entries()) {
    responseUsage = {
      input_tokens: sample.input, cache_read_input_tokens: sample.read,
      cache_creation_input_tokens: sample.created, output_tokens: 10,
    }
    const stream = $.turn.step({ turnId: 'live', index, model: 'main-model', messageCount: 1 })
    const chunks = []
    let part = await stream.next()
    while (!part.done) {
      chunks.push(part.value)
      part = await stream.next()
    }
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({ kind: 'text', index: 0, text: 'Hello' })
    expect(part.value.answer).toBe('Hello')
    expect((await ui.find({ type: 'Text', text: /^Context / }))?.text).toBe(sample.context)
    expect((await ui.find({ type: 'Text', text: /^Cache hit / }))?.text).toBe(`Cache hit ${sample.cache} ⚡`)
  }

  const beforeAgent = textOf(await ui.drawn())
  responseUsage = { input_tokens: 50000, cache_read_input_tokens: 50000, cache_creation_input_tokens: 0, output_tokens: 100 }
  const agentStream = $.turn.step({ turnId: 'agent', index: 0, model: 'agent-model', agentId: 'agent-1', messageCount: 1 })
  for await (const _ of agentStream) {}
  await agentStream.result
  await $.turn.complete({ answer: 'agent done', durationMs: 100, isAborted: false, turnId: 'agent', agentId: 'agent-1', reason: 'answer' })
  expect(textOf(await ui.drawn())).toBe(beforeAgent)

  responseUsage = null
  const missingUsage = $.turn.step({ turnId: 'live', index: 4, model: 'main-model', messageCount: 1 })
  for await (const _ of missingUsage) {}
  await missingUsage.result
  expect((await ui.find({ type: 'Text', text: /^Context / }))?.text).toBe('Context 0 / 200k (0%)')
  expect((await ui.find({ type: 'Text', text: /^Cache hit / }))?.text).toBe('Cache hit 0% ⚡')

  await $.turn.complete({
    answer: 'done', durationMs: 1000, isAborted: false, turnId: 'live', reason: 'answer',
    usage: { input_tokens: 50000, cache_read_input_tokens: 50000, cache_creation_input_tokens: 0, output_tokens: 140, model: 'main-model' },
  })
  // Neither a stale snapshot nor the turn's aggregate may replace the last request.
  expect((await ui.find({ type: 'Text', text: /^Context / }))?.text).toBe('Context 0 / 200k (0%)')
  expect((await ui.find({ type: 'Text', text: /^Cache hit / }))?.text).toBe('Cache hit 0% ⚡')
})

test('uses step usage without inventing a context capacity when the session snapshot is unavailable', async ($, on) => {
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'Hello' }
    return {
      turnId: e.turnId, index: e.index, answer: 'Hello', toolUses: [], stopReason: 'end_turn',
      usage: { model: e.model, input_tokens: 1000, cache_read_input_tokens: 8000, cache_creation_input_tokens: 1000, output_tokens: 10 },
    }
  })
  const ui = await $.ui.mount({
    plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props: bandProps,
  })
  const stream = $.turn.step({ turnId: 'offline', index: 0, model: 'main-model', messageCount: 1 })
  for await (const _ of stream) {}
  await stream.result
  expect((await ui.find({ type: 'Text', text: /^Context / }))?.text).toBe('Context 10k / -')
  expect((await ui.find({ type: 'Text', text: /^Cache hit / }))?.text).toBe('Cache hit 80% ⚡')
})

test('calibrates context from the engine on completion, never from accumulated turn input', async ($, on) => {
  let contextTokens = 10000
  on('session.usage', () => ({ value: {
    startedAt: 0, context: { tokens: contextTokens, window: 200_000 }, rateLimits: [],
  } }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const ui = await $.ui.mount({
    plugin: 'wizard-crab', surface: 'terminal', component: 'AbovePrompt', props: bandProps,
  })
  for (const tokens of [10000, 0]) {
    contextTokens = tokens
    await $.turn.complete({
      answer: 'done', durationMs: 100, isAborted: false, turnId: `calibrate-${tokens}`, reason: 'answer',
      usage: { model: 'main-model', input_tokens: 90000, cache_read_input_tokens: 90000, cache_creation_input_tokens: 0, output_tokens: 10 },
    })
    const expected = tokens === 0 ? 'Context 0 / 200k (0%)' : 'Context 10k / 200k (5%)'
    expect((await ui.find({ type: 'Text', text: /^Context / }))?.text).toBe(expected)
  }
})
