/**
 * Alpha Map Calculator
 *
 * This module is ported from gemini-watermark-remover by journey-ad (Jad),
 * itself based on GeminiWatermarkTool by AllenK (Kwyshell).
 * Original: https://github.com/journey-ad/gemini-watermark-remover/blob/main/src/core/alphaMap.js
 * License: MIT - Copyright (c) 2025 Jad; Copyright (c) 2024 AllenK (Kwyshell)
 * Full retained notice: see /THIRD_PARTY_NOTICES.md
 *
 * Calculates alpha map from captured background watermark images.
 */

/**
 * Calculate alpha map from background captured image
 * @param bgCaptureImageData - ImageData object for background capture
 * @returns Float32Array containing alpha values (0.0-1.0)
 */
export function calculateAlphaMap(bgCaptureImageData: ImageData): Float32Array {
  const { width, height, data } = bgCaptureImageData;
  const alphaMap = new Float32Array(width * height);

  // For each pixel, take the maximum value of the three RGB channels and normalize it to [0, 1]
  for (let i = 0; i < alphaMap.length; i++) {
    const idx = i * 4; // RGBA format, 4 bytes per pixel
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    // Take the maximum value of the three RGB channels as the brightness value
    const maxChannel = Math.max(r, g, b);

    // Normalize to [0, 1] range
    alphaMap[i] = maxChannel / 255.0;
  }

  return alphaMap;
}

/**
 * Downsample an alpha map by averaging every source pixel covered by one target pixel.
 * This matches OpenCV INTER_AREA for integer-ratio shrinking, which the upstream V2
 * implementation uses when deriving the current 48px profile from the 96px capture.
 */
export function downsampleAlphaMapWithAreaAverage(
  alphaMap: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Float32Array {
  if (
    alphaMap.length !== sourceWidth * sourceHeight ||
    sourceWidth % targetWidth !== 0 ||
    sourceHeight % targetHeight !== 0
  ) {
    throw new Error('Alpha map dimensions must support integer-ratio area downsampling');
  }

  const scaleX = sourceWidth / targetWidth;
  const scaleY = sourceHeight / targetHeight;
  const sampleCount = scaleX * scaleY;
  const downsampled = new Float32Array(targetWidth * targetHeight);

  for (let targetY = 0; targetY < targetHeight; targetY++) {
    for (let targetX = 0; targetX < targetWidth; targetX++) {
      let sum = 0;
      for (let sourceY = targetY * scaleY; sourceY < (targetY + 1) * scaleY; sourceY++) {
        for (let sourceX = targetX * scaleX; sourceX < (targetX + 1) * scaleX; sourceX++) {
          sum += alphaMap[sourceY * sourceWidth + sourceX];
        }
      }
      downsampled[targetY * targetWidth + targetX] = sum / sampleCount;
    }
  }

  return downsampled;
}
