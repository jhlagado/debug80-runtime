import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // The filesystem image tests build whole disks and take seconds each on a busy machine.
    testTimeout: 30_000,
    // One file at a time keeps the run inside a small machine's memory.
    fileParallelism: false,
  },
});
