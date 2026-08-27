import {
  type ImageEditParams,
  defaultCrop,
  validateEditParams,
} from './image-edit';

const params = (overrides: Partial<ImageEditParams> = {}): ImageEditParams => ({
  crop: defaultCrop(),
  ...overrides,
});

describe('validateEditParams', () => {
  it('accepts a full-frame crop', () => {
    expect(validateEditParams(params()).isOk()).toBe(true);
  });

  it('accepts an inset crop', () => {
    const result = validateEditParams(params({ crop: { x: 0.25, y: 0.1, size: 0.5 } }));
    expect(result.isOk()).toBe(true);
  });

  it('rejects a crop running past the right edge', () => {
    const result = validateEditParams(params({ crop: { x: 0.8, y: 0, size: 0.5 } }));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('CROP_OUT_OF_BOUNDS');
  });

  it('rejects a crop running past the bottom edge', () => {
    const result = validateEditParams(params({ crop: { x: 0, y: 0.7, size: 0.4 } }));
    expect(result.isErr()).toBe(true);
  });

  it('rejects a zero-sized crop', () => {
    const result = validateEditParams(params({ crop: { x: 0, y: 0, size: 0 } }));
    expect(result.isErr()).toBe(true);
  });

  it('rejects a negative origin', () => {
    const result = validateEditParams(params({ crop: { x: -0.1, y: 0, size: 0.5 } }));
    expect(result.isErr()).toBe(true);
  });

  it('rejects NaN', () => {
    const result = validateEditParams(params({ crop: { x: Number.NaN, y: 0, size: 0.5 } }));
    expect(result.isErr()).toBe(true);
  });
});
