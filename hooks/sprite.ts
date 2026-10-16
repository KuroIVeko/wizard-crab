export const COLUMNS = 11
export const ROWS = 7
export const WIDTH = COLUMNS * 2
export const HEIGHT = ROWS * 2
export const CYCLE = 8
export const FRAME_MS = 200

// Bits: top-left, top-right, bottom-left, bottom-right.
const QUADRANTS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'
const HAT = ['           ', '    ▗▄▟▘   ', '  ▗▟████▙  ', '▄▄▄▄▄▄▄▄▄▄▄']
const COLORS = { hat: '#4B2380', brim: '#6A3BB0', body: '#D77757' }

export type PixelGrid = boolean[][]
export type SpriteRow = { glyphs: string; color: string }

export function quadrant(mask: number): string {
  if (!Number.isInteger(mask) || mask < 0 || mask > 15) {
    throw new Error('A quadrant mask must be an integer from 0 to 15')
  }
  return QUADRANTS[mask]
}

export function encode(pixels: PixelGrid): string[] {
  if (pixels.length !== HEIGHT || pixels.some(row => row.length !== WIDTH)) {
    throw new Error('Unexpected sprite dimensions')
  }

  const rows: string[] = []
  for (let y = 0; y < HEIGHT; y += 2) {
    let row = ''
    for (let x = 0; x < WIDTH; x += 2) {
      const mask = Number(pixels[y][x])
        | (Number(pixels[y][x + 1]) << 1)
        | (Number(pixels[y + 1][x]) << 2)
        | (Number(pixels[y + 1][x + 1]) << 3)
      row += quadrant(mask)
    }
    rows.push(row)
  }
  return rows
}

export function sprite(frame: number) {
  const n = ((frame % CYCLE) + CYCLE) % CYCLE
  const isUp = n % 4 === 1 || n % 4 === 2
  const isBlink = n === 6
  const pixels: PixelGrid = Array.from({ length: HEIGHT }, () => Array<boolean>(WIDTH).fill(false))

  // Preserve the decorative hat; only the body and feet must be symmetric.
  HAT.forEach((row, y) => {
    Array.from(row).forEach((glyph, x) => {
      const mask = QUADRANTS.indexOf(glyph)
      if (mask < 0) throw new Error('Unknown hat quadrant')
      for (let bit = 0; bit < 4; bit++) {
        pixels[y * 2 + (bit >> 1)][x * 2 + (bit & 1)] = Boolean(mask & (1 << bit))
      }
    })
  })

  const pair = (x: number, y: number, value = true) => {
    pixels[y][x] = value
    pixels[y][WIDTH - 1 - x] = value
  }

  for (let y = 8; y <= 11; y++) {
    for (let x = 4; x < WIDTH / 2; x++) pair(x, y)
  }
  pair(2, 10)
  pair(3, 10)
  if (!isBlink) pair(6, 9, false)

  // Half-cell motion, mirrored around the same axis as the body and eyes.
  for (const x of isUp ? [4, 6] : [5, 7]) pair(x, 12)

  const rows: SpriteRow[] = encode(pixels).map((glyphs, y) => ({
    glyphs,
    color: y < 3 ? COLORS.hat : y === 3 ? COLORS.brim : COLORS.body,
  }))

  return { pixels, rows, isUp, isBlink }
}
