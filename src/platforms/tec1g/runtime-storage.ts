/**
 * @file TEC-1G SD card image load/persistence wiring.
 */

import * as fs from 'fs';
import type { Tec1gPlatformConfigNormalized } from '../types.js';
import { SdSpi } from './sd-spi.js';

/**
 * Builds SD SPI controller and optional image-backed persistence callbacks.
 */
export function createTec1gSdSpi(config: Tec1gPlatformConfigNormalized): {
  sdEnabled: boolean;
  sdSpi: SdSpi | null;
} {
  const sdEnabled = config.sdEnabled;
  const sdImagePath = config.sdImagePath;
  const sdHighCapacity = config.sdHighCapacity;

  let sdImage: Uint8Array | undefined;
  if (sdEnabled && typeof sdImagePath === 'string' && sdImagePath !== '') {
    try {
      sdImage = new Uint8Array(fs.readFileSync(sdImagePath));
    } catch {
      sdImage = undefined;
    }
  }

  const sdSpi = sdEnabled
    ? new SdSpi({
        highCapacity: sdHighCapacity,
        ...(sdImage ? { image: sdImage } : {}),
        ...(sdImagePath !== undefined && sdImagePath !== '' && sdImage
          ? {
              onWrite: (image): void => {
                try {
                  fs.writeFileSync(sdImagePath, image);
                } catch {
                  // Ignore persistence failures; runtime continues with in-memory image.
                }
              },
            }
          : {}),
      })
    : null;

  return { sdEnabled, sdSpi };
}
