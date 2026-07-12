/**
 * @file Simple platform configuration normalization.
 */

import {
  SimpleMemoryRegion,
  SimplePlatformConfig,
  SimplePlatformConfigNormalized,
} from '../types.js';

/**
 * Normalizes memory region definitions for the simple platform.
 */
export function normalizeSimpleRegions(
  regions?: SimpleMemoryRegion[],
  fallback?: SimpleMemoryRegion[]
): SimpleMemoryRegion[] {
  const defaults = fallback ?? [
    { start: 0x0000, end: 0x07ff, kind: 'rom' },
    { start: 0x0800, end: 0xffff, kind: 'ram' },
  ];
  if (!Array.isArray(regions) || regions.length === 0) {
    return defaults;
  }

  const normalized: SimpleMemoryRegion[] = [];
  for (const region of regions) {
    if (region === undefined || !Number.isFinite(region.start) || !Number.isFinite(region.end)) {
      continue;
    }
    let start = Math.max(0, Math.min(0xffff, region.start));
    let end = Math.max(0, Math.min(0xffff, region.end));
    if (end < start) {
      [start, end] = [end, start];
    }
    const entry: SimpleMemoryRegion = { start, end, kind: region.kind ?? 'unknown' };
    if (region.readOnly !== undefined) {
      entry.readOnly = region.readOnly;
    }
    normalized.push(entry);
  }
  if (normalized.length === 0) {
    return defaults;
  }
  return normalized;
}

/**
 * Normalizes the simple platform config with defaults.
 */
export function normalizeSimpleConfig(cfg?: SimplePlatformConfig): SimplePlatformConfigNormalized {
  const config = cfg ?? {};
  const regions = normalizeSimpleRegions(config.regions, [
    { start: 0x0000, end: 0x07ff, kind: 'rom' },
    { start: 0x0800, end: 0xffff, kind: 'ram' },
  ]);
  const romRanges = regions
    .filter((region) => region.kind === 'rom' || region.readOnly === true)
    .map((region) => ({ start: region.start, end: region.end }));
  const appStart =
    Number.isFinite(config.appStart) && config.appStart !== undefined ? config.appStart : 0x0900;
  const entry =
    Number.isFinite(config.entry) && config.entry !== undefined
      ? config.entry
      : (romRanges[0]?.start ?? 0x0000);
  const binFrom =
    Number.isFinite(config.binFrom) && config.binFrom !== undefined ? config.binFrom : undefined;
  const binTo =
    Number.isFinite(config.binTo) && config.binTo !== undefined ? config.binTo : undefined;
  return {
    regions,
    romRanges,
    appStart: Math.max(0, Math.min(0xffff, appStart)),
    entry: Math.max(0, Math.min(0xffff, entry)),
    binFrom: binFrom !== undefined ? Math.max(0, Math.min(0xffff, binFrom)) : undefined,
    binTo: binTo !== undefined ? Math.max(0, Math.min(0xffff, binTo)) : undefined,
  };
}
