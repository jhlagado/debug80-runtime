/**
 * @file TEC Common Utilities Tests
 * @description Tests for shared TEC platform utilities
 */

import { describe, it, expect } from 'vitest';
import {
  TEC_SLOW_HZ,
  TEC_FAST_HZ,
  TEC_SILENCE_CYCLES,
  TEC_KEY_HOLD_MS,
  Z80_ADDRESS_SPACE,
  BYTE_MASK,
  ADDR_MASK,
  TEC1G_SHADOW_START,
  TEC1G_SHADOW_END,
  TEC1G_SHADOW_SIZE,
  TEC1G_EXPAND_START,
  TEC1G_EXPAND_END,
  TEC1G_EXPAND_SIZE,
  TEC1G_PROTECT_START,
  TEC1G_PROTECT_END,
  TEC1_ROM_LOAD_ADDR,
  KEY_RESET,
  KEY_NONE,
  clearSevenSegmentIntensitiesIfBlank,
  collectSevenSegmentIntensities,
  createSevenSegmentDutyState,
  maybeCommitSevenSegmentIntensitiesOnIdle,
  recordSevenSegmentDutyTransition,
  readSevenSegmentIntensities,
  updateDisplayDigits,
  updateMatrixRow,
  calculateSpeakerFrequency,
  calculateKeyHoldCycles,
  shouldUpdate,
  microsecondsToClocks,
  millisecondsToClocks,
  createSerialState,
  createTecSerialDecoder,
} from '@jhlagado/debug80-runtime/platforms/tec-common';
import { CycleClock } from '@jhlagado/debug80-runtime/platforms/cycle-clock';

describe('TEC Common Constants', () => {
  it('should have correct clock frequencies', () => {
    expect(TEC_SLOW_HZ).toBe(400000);
    expect(TEC_FAST_HZ).toBe(4000000);
  });

  it('should have correct timing constants', () => {
    expect(TEC_SILENCE_CYCLES).toBe(10000);
    expect(TEC_KEY_HOLD_MS).toBe(30);
  });

  it('should have correct memory map constants', () => {
    expect(Z80_ADDRESS_SPACE).toBe(0x10000);
    expect(BYTE_MASK).toBe(0xff);
    expect(ADDR_MASK).toBe(0xffff);
  });

  it('should have correct TEC-1G shadow ROM constants', () => {
    expect(TEC1G_SHADOW_START).toBe(0xc000);
    expect(TEC1G_SHADOW_END).toBe(0xc7ff);
    expect(TEC1G_SHADOW_SIZE).toBe(0x0800);
  });

  it('should have correct TEC-1G expansion memory constants', () => {
    expect(TEC1G_EXPAND_START).toBe(0x8000);
    expect(TEC1G_EXPAND_END).toBe(0xbfff);
    expect(TEC1G_EXPAND_SIZE).toBe(0x4000);
  });

  it('should have correct TEC-1G RAM protection constants', () => {
    expect(TEC1G_PROTECT_START).toBe(0x4000);
    expect(TEC1G_PROTECT_END).toBe(0x7fff);
  });

  it('should have correct ROM load address', () => {
    expect(TEC1_ROM_LOAD_ADDR).toBe(0xc000);
  });

  it('should have correct key constants', () => {
    expect(KEY_RESET).toBe(0x12);
    expect(KEY_NONE).toBe(0x7f);
  });
});

describe('updateDisplayDigits', () => {
  it('should update selected digits', () => {
    const digits = [0, 0, 0, 0, 0, 0];
    const result = updateDisplayDigits(digits, 0b000101, 0xab);
    expect(result).toBe(true);
    expect(digits).toEqual([0xab, 0, 0xab, 0, 0, 0]);
  });

  it('should return false when no digits selected', () => {
    const digits = [0, 0, 0, 0, 0, 0];
    const result = updateDisplayDigits(digits, 0, 0xab);
    expect(result).toBe(false);
    expect(digits).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('should update all digits when all selected', () => {
    const digits = [0, 0, 0, 0, 0, 0];
    const result = updateDisplayDigits(digits, 0b111111, 0xff);
    expect(result).toBe(true);
    expect(digits).toEqual([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  });
});

describe('seven-segment duty integration', () => {
  it('tracks segment brightness by cycle duty', () => {
    const duty = createSevenSegmentDutyState(6, 0);

    recordSevenSegmentDutyTransition(duty, 0, 0b000001, 0x01);
    recordSevenSegmentDutyTransition(duty, 10, 0b000010, 0x01);
    recordSevenSegmentDutyTransition(duty, 20, 0b100000, 0x01);
    recordSevenSegmentDutyTransition(duty, 120, 0, 0);

    const intensities = collectSevenSegmentIntensities(duty, 120);

    expect(intensities[0]).toBeCloseTo(10 / 120);
    expect(intensities[8]).toBeCloseTo(10 / 120);
    expect(intensities[40]).toBeCloseTo(100 / 120);
    expect(intensities[16]).toBe(0);
  });

  it('commits a scan frame when the digit scan wraps', () => {
    const duty = createSevenSegmentDutyState(6, 0);

    expect(recordSevenSegmentDutyTransition(duty, 0, 0b000001, 0x01)).toBe(false);
    expect(recordSevenSegmentDutyTransition(duty, 10, 0b000010, 0x01)).toBe(false);
    expect(recordSevenSegmentDutyTransition(duty, 20, 0b000100, 0x01)).toBe(false);
    expect(recordSevenSegmentDutyTransition(duty, 30, 0b001000, 0x01)).toBe(false);
    expect(recordSevenSegmentDutyTransition(duty, 40, 0b010000, 0x01)).toBe(false);
    expect(recordSevenSegmentDutyTransition(duty, 50, 0b100000, 0x01)).toBe(false);
    expect(recordSevenSegmentDutyTransition(duty, 60, 0b000001, 0x01)).toBe(true);

    const intensities = collectSevenSegmentIntensities(duty, 60);

    expect(intensities[0]).toBeCloseTo(10 / 60);
    expect(intensities[8]).toBeCloseTo(10 / 60);
    expect(intensities[16]).toBeCloseTo(10 / 60);
    expect(intensities[24]).toBeCloseTo(10 / 60);
    expect(intensities[32]).toBeCloseTo(10 / 60);
    expect(intensities[40]).toBeCloseTo(10 / 60);
  });

  it('keeps the last committed frame separate from active scan accumulation', () => {
    const duty = createSevenSegmentDutyState(6, 0);

    recordSevenSegmentDutyTransition(duty, 0, 0b000001, 0x01);
    recordSevenSegmentDutyTransition(duty, 10, 0b000010, 0x01);

    expect(readSevenSegmentIntensities(duty)[0]).toBe(0);

    const committed = collectSevenSegmentIntensities(duty, 20);

    expect(committed[0]).toBeCloseTo(10 / 20);
    expect(readSevenSegmentIntensities(duty)[0]).toBeCloseTo(10 / 20);
  });

  it('commits a partial scan after an idle timeout', () => {
    const duty = createSevenSegmentDutyState(6, 0);

    recordSevenSegmentDutyTransition(duty, 0, 0b000001, 0x01);
    recordSevenSegmentDutyTransition(duty, 10, 0b000010, 0x01);

    expect(maybeCommitSevenSegmentIntensitiesOnIdle(duty, 49, 1000, 40)).toBe(false);
    expect(readSevenSegmentIntensities(duty)[0]).toBe(0);

    expect(maybeCommitSevenSegmentIntensitiesOnIdle(duty, 50, 1000, 40)).toBe(true);
    expect(readSevenSegmentIntensities(duty)[0]).toBeCloseTo(10 / 50);
    expect(readSevenSegmentIntensities(duty)[8]).toBeCloseTo(40 / 50);
  });

  it('reports a stopped scan after an idle digit-select blank', () => {
    const duty = createSevenSegmentDutyState(6, 0);

    recordSevenSegmentDutyTransition(duty, 0, 0b000001, 0x7f);
    recordSevenSegmentDutyTransition(duty, 10, 0, 0x7f);

    expect(maybeCommitSevenSegmentIntensitiesOnIdle(duty, 49, 1000, 40)).toBe(false);
    expect(maybeCommitSevenSegmentIntensitiesOnIdle(duty, 50, 1000, 40)).toBe(true);
    expect(duty.scanStopped).toBe(true);
    expect(readSevenSegmentIntensities(duty).every((value) => value === 0)).toBe(true);
  });

  it('publishes an electrical blank immediately when both latches are cleared', () => {
    const duty = createSevenSegmentDutyState(6, 0);

    recordSevenSegmentDutyTransition(duty, 0, 0b111111, 0xef);
    recordSevenSegmentDutyTransition(duty, 100, 0b111111, 0xef);
    collectSevenSegmentIntensities(duty, 100);
    expect(readSevenSegmentIntensities(duty).some((value) => value > 0)).toBe(true);

    expect(recordSevenSegmentDutyTransition(duty, 110, 0, 0)).toBe(false);
    expect(clearSevenSegmentIntensitiesIfBlank(duty, 110)).toBe(true);
    expect(readSevenSegmentIntensities(duty).every((value) => value === 0)).toBe(true);
    expect(duty.segmentOnCycles.every((value) => value === 0)).toBe(true);

    expect(recordSevenSegmentDutyTransition(duty, 120, 0, 0)).toBe(false);
    duty.digitsVisitedMask = 0b000001;
    expect(clearSevenSegmentIntensitiesIfBlank(duty, 120)).toBe(false);
    expect(duty.digitsVisitedMask).toBe(0);
  });

  it('captures complete six-digit scans in electrical order', () => {
    const duty = createSevenSegmentDutyState(6, 0);
    let cycle = 0;

    for (let digit = 0; digit < 6; digit += 1) {
      recordSevenSegmentDutyTransition(duty, cycle, 1 << digit, 0x01 << digit);
      cycle += 10;
      recordSevenSegmentDutyTransition(duty, cycle, 0, 0);
      cycle += 5;
    }

    expect(duty.scanCycles).toEqual([
      {
        id: 0,
        startCycle: 0,
        endCycle: 85,
        phases: Array.from({ length: 6 }, (_, digit) => ({
          digitMask: 1 << digit,
          segments: 0x01 << digit,
          dwellCycles: 10,
        })),
      },
    ]);
  });

  it('bounds seven-segment playback backlog by complete scans', () => {
    const duty = createSevenSegmentDutyState(6, 0);
    let cycle = 0;

    for (let frame = 0; frame < 260; frame += 1) {
      for (let digit = 0; digit < 6; digit += 1) {
        recordSevenSegmentDutyTransition(duty, cycle, 1 << digit, 0xff);
        cycle += 1;
        recordSevenSegmentDutyTransition(duty, cycle, 0, 0);
        cycle += 1;
      }
    }

    expect(duty.scanCycles).toHaveLength(240);
    expect(duty.scanDroppedCycles).toBe(20);
    expect(duty.scanCycles.every((scan) => scan.phases.length === 6)).toBe(true);
  });
});

describe('updateMatrixRow', () => {
  it('should update the correct row', () => {
    const matrix = [0, 0, 0, 0, 0, 0, 0, 0];
    const result = updateMatrixRow(matrix, 0b00000100, 0xcd);
    expect(result).toBe(true);
    expect(matrix[2]).toBe(0xcd);
  });

  it('should return false for invalid row mask', () => {
    const matrix = [0, 0, 0, 0, 0, 0, 0, 0];
    const result = updateMatrixRow(matrix, 0, 0xcd);
    expect(result).toBe(false);
  });

  it('should handle row 0', () => {
    const matrix = [0, 0, 0, 0, 0, 0, 0, 0];
    const result = updateMatrixRow(matrix, 0b00000001, 0x55);
    expect(result).toBe(true);
    expect(matrix[0]).toBe(0x55);
  });

  it('should handle row 7', () => {
    const matrix = [0, 0, 0, 0, 0, 0, 0, 0];
    const result = updateMatrixRow(matrix, 0b10000000, 0xaa);
    expect(result).toBe(true);
    expect(matrix[7]).toBe(0xaa);
  });
});

describe('calculateSpeakerFrequency', () => {
  it('should calculate correct frequency', () => {
    // At 4MHz, 2000 cycles between edges = 1kHz
    const freq = calculateSpeakerFrequency(4000000, 2000);
    expect(freq).toBe(1000);
  });

  it('should return 0 for zero or negative delta', () => {
    expect(calculateSpeakerFrequency(4000000, 0)).toBe(0);
    expect(calculateSpeakerFrequency(4000000, -100)).toBe(0);
  });

  it('should return 0 for zero clock', () => {
    expect(calculateSpeakerFrequency(0, 2000)).toBe(0);
  });
});

describe('calculateKeyHoldCycles', () => {
  it('should calculate correct cycles at 4MHz', () => {
    // 30ms at 4MHz = 120000 cycles
    const cycles = calculateKeyHoldCycles(TEC_FAST_HZ, 30);
    expect(cycles).toBe(120000);
  });

  it('should calculate correct cycles at 400kHz', () => {
    // 30ms at 400kHz = 12000 cycles
    const cycles = calculateKeyHoldCycles(TEC_SLOW_HZ, 30);
    expect(cycles).toBe(12000);
  });

  it('should return minimum of 1 cycle', () => {
    const cycles = calculateKeyHoldCycles(1, 0);
    expect(cycles).toBeGreaterThanOrEqual(1);
  });
});

describe('shouldUpdate', () => {
  it('should return true when updateMs is 0', () => {
    expect(shouldUpdate(Date.now(), 0)).toBe(true);
  });

  it('should return true when enough time has elapsed', () => {
    const lastUpdate = Date.now() - 100;
    expect(shouldUpdate(lastUpdate, 50)).toBe(true);
  });

  it('should return false when not enough time has elapsed', () => {
    const lastUpdate = Date.now();
    expect(shouldUpdate(lastUpdate, 1000)).toBe(false);
  });
});

describe('microsecondsToClocks', () => {
  it('should convert microseconds to clocks', () => {
    // 37us at 4MHz = 148 cycles
    const cycles = microsecondsToClocks(4000000, 37);
    expect(cycles).toBe(148);
  });

  it('should return minimum of 1', () => {
    const cycles = microsecondsToClocks(1, 0);
    expect(cycles).toBe(1);
  });
});

describe('millisecondsToClocks', () => {
  it('should convert milliseconds to clocks', () => {
    // 400ms at 4MHz = 1600000 cycles
    const cycles = millisecondsToClocks(4000000, 400);
    expect(cycles).toBe(1600000);
  });

  it('should return minimum of 1', () => {
    const cycles = millisecondsToClocks(1, 0);
    expect(cycles).toBe(1);
  });
});

describe('createSerialState', () => {
  it('should create initial serial state with correct cyclesPerBit', () => {
    const state = createSerialState(4000000, 9600);
    expect(state.level).toBe(1);
    expect(state.rxLevel).toBe(1);
    expect(state.rxBusy).toBe(false);
    expect(state.rxToken).toBe(0);
    expect(state.rxQueue).toEqual([]);
    expect(state.cyclesPerBit).toBeCloseTo(4000000 / 9600, 2);
  });

  it('should handle different baud rates', () => {
    const state4800 = createSerialState(4000000, 4800);
    const state9600 = createSerialState(4000000, 9600);
    expect(state4800.cyclesPerBit).toBeCloseTo(4000000 / 4800, 2);
    expect(state9600.cyclesPerBit).toBeCloseTo(4000000 / 9600, 2);
    expect(state4800.cyclesPerBit).toBeGreaterThan(state9600.cyclesPerBit);
  });
});

describe('createTecSerialDecoder', () => {
  it('should create a decoder with basic config', () => {
    const clock = new CycleClock();
    const decoder = createTecSerialDecoder({
      cycleClock: clock,
      baud: 9600,
      clockHz: 4000000,
    });
    expect(decoder).toBeDefined();
  });

  it('should create a decoder with onByte callback', () => {
    const clock = new CycleClock();
    const receivedBytes: number[] = [];
    const decoder = createTecSerialDecoder({
      cycleClock: clock,
      baud: 9600,
      clockHz: 4000000,
      onByte: (byte) => receivedBytes.push(byte),
    });
    expect(decoder).toBeDefined();
  });
});
