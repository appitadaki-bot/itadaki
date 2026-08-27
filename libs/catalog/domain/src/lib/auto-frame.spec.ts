import { type LumaGrid, proposeFrame } from './auto-frame';

/**
 * Builds a grid that is flat everywhere except a textured patch, standing in
 * for a dish on a plain table.
 */
function gridWithSubject(
  width: number,
  height: number,
  patch: { left: number; top: number; size: number },
): LumaGrid {
  const data = new Uint8Array(width * height);
  data.fill(120);

  for (let y = patch.top; y < patch.top + patch.size; y += 1) {
    for (let x = patch.left; x < patch.left + patch.size; x += 1) {
      if (x >= width || y >= height) continue;
      data[y * width + x] = (x + y) % 2 === 0 ? 240 : 20;
    }
  }
  return { width, height, data };
}

describe('proposeFrame', () => {
  it('slides the window towards a subject on the left', () => {
    const grid = gridWithSubject(400, 200, { left: 20, top: 40, size: 120 });
    const { crop } = proposeFrame(grid);

    // The 200px window should sit near the left edge, not centred at 0.25.
    expect(crop.x).toBeLessThan(0.15);
    expect(crop.y).toBe(0);
    expect(crop.size).toBe(1);
  });

  it('slides the window towards a subject on the right', () => {
    const grid = gridWithSubject(400, 200, { left: 260, top: 40, size: 120 });
    const { crop } = proposeFrame(grid);

    expect(crop.x).toBeGreaterThan(0.35);
  });

  it('handles a portrait image by sliding vertically', () => {
    const grid = gridWithSubject(200, 400, { left: 40, top: 250, size: 120 });
    const { crop } = proposeFrame(grid);

    expect(crop.x).toBe(0);
    expect(crop.y).toBeGreaterThan(0.25);
  });

  it('returns the whole frame for an already-square image', () => {
    const grid = gridWithSubject(200, 200, { left: 20, top: 20, size: 60 });
    const { crop } = proposeFrame(grid);

    expect(crop.x).toBe(0);
    expect(crop.y).toBe(0);
    expect(crop.size).toBe(1);
  });

  it('survives a degenerate one-pixel image', () => {
    const tiny: LumaGrid = { width: 1, height: 1, data: new Uint8Array([200]) };
    const { crop } = proposeFrame(tiny);

    expect(crop.size).toBe(1);
  });

  it('produces a crop the render pipeline accepts', () => {
    const grid = gridWithSubject(900, 600, { left: 600, top: 200, size: 200 });
    const { crop } = proposeFrame(grid);

    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.size).toBeGreaterThan(0);
    expect(crop.size).toBeLessThanOrEqual(1);

    // `size` es fracción del lado corto y `x`/`y` del lado que le toca, así
    // que la invariante se mide en píxeles: la ventana tiene que entrar.
    const corto = Math.min(grid.width, grid.height);
    expect(crop.x * grid.width + crop.size * corto).toBeLessThanOrEqual(grid.width + 0.5);
    expect(crop.y * grid.height + crop.size * corto).toBeLessThanOrEqual(grid.height + 0.5);
  });
});
