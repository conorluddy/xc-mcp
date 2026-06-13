/**
 * Jest-compatible shim for pixelmatch (pure ESM package).
 * Implements the same pixel comparison algorithm as pixelmatch@7 but as a CJS-friendly module.
 * Used only in test environments — production uses the real pixelmatch via dynamic import.
 */

function colorDelta(img1: Buffer, img2: Buffer, k: number, m: number, yOnly: boolean): number {
  const r1 = img1[k];
  const g1 = img1[k + 1];
  const b1 = img1[k + 2];
  const a1 = img1[k + 3];
  const r2 = img2[m];
  const g2 = img2[m + 1];
  const b2 = img2[m + 2];
  const a2 = img2[m + 3];

  // Blend with white background if semi-transparent
  const blendR1 = (r1 * a1) / 255 + 255 * (1 - a1 / 255);
  const blendG1 = (g1 * a1) / 255 + 255 * (1 - a1 / 255);
  const blendB1 = (b1 * a1) / 255 + 255 * (1 - a1 / 255);
  const blendR2 = (r2 * a2) / 255 + 255 * (1 - a2 / 255);
  const blendG2 = (g2 * a2) / 255 + 255 * (1 - a2 / 255);
  const blendB2 = (b2 * a2) / 255 + 255 * (1 - a2 / 255);

  if (yOnly) {
    // Luminance only
    const y1 = 0.2126 * blendR1 + 0.7152 * blendG1 + 0.0722 * blendB1;
    const y2 = 0.2126 * blendR2 + 0.7152 * blendG2 + 0.0722 * blendB2;
    return y1 - y2;
  }

  return Math.max(
    Math.abs(blendR1 - blendR2),
    Math.abs(blendG1 - blendG2),
    Math.abs(blendB1 - blendB2)
  );
}

/**
 * Compare two RGBA pixel buffers and write diff to output buffer.
 * Returns count of different pixels.
 */
function pixelmatch(
  img1: Buffer,
  img2: Buffer,
  output: Buffer | null,
  width: number,
  height: number,
  options: { threshold?: number } = {}
): number {
  const threshold = options.threshold ?? 0.1;
  // Scale threshold: 0.1 means allow color delta of 0.1 * 255 = ~25.5
  const maxDelta = threshold * 255;

  let differentPixels = 0;

  for (let i = 0; i < width * height; i++) {
    const k = i * 4;
    const delta = colorDelta(img1, img2, k, k, false);

    if (delta > maxDelta) {
      differentPixels++;
      if (output) {
        // Red highlight for different pixels
        output[k] = 255;
        output[k + 1] = 0;
        output[k + 2] = 0;
        output[k + 3] = 255;
      }
    } else {
      if (output) {
        // Dimmed original for same pixels
        output[k] = img1[k] / 2;
        output[k + 1] = img1[k + 1] / 2;
        output[k + 2] = img1[k + 2] / 2;
        output[k + 3] = img1[k + 3];
      }
    }
  }

  return differentPixels;
}

export default pixelmatch;
