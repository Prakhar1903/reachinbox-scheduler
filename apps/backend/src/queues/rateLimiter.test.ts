import { describe, it, expect, beforeAll } from 'vitest';
import { getHourlyRateKey, getMsUntilNextHour, checkAndIncrementHourlyRate } from './rateLimiter';
import { redisCommandClient } from '../config/redis';

describe('Rate Limiter Tests', () => {
  beforeAll(async () => {
    // ensure redis connection is ready
    await redisCommandClient.ping();
  });

  it('generates consistent hourly rate keys', () => {
    const fixedDate = new Date('2026-10-24T18:30:00.000Z');
    const key = getHourlyRateKey('sender-123', fixedDate);
    expect(key).toBe('rate:sender-123:2026102418');
  });

  it('calculates millisecond delay until next hour correctly', () => {
    const fixedDate = new Date('2026-10-24T18:30:00.000Z');
    const { delayMs, nextHourDate } = getMsUntilNextHour(fixedDate);
    expect(delayMs).toBe(30 * 60 * 1000);
    expect(nextHourDate.getUTCHours()).toBe(19);
    expect(nextHourDate.getUTCMinutes()).toBe(0);
  });

  it('atomically enforces limits and rolls back when limit exceeded', async () => {
    const testSenderId = `test-sender-${Date.now()}`;
    const limit = 3;

    // Hit 1
    const res1 = await checkAndIncrementHourlyRate(testSenderId, limit);
    expect(res1.allowed).toBe(true);
    expect(res1.currentCount).toBe(1);

    // Hit 2
    const res2 = await checkAndIncrementHourlyRate(testSenderId, limit);
    expect(res2.allowed).toBe(true);
    expect(res2.currentCount).toBe(2);

    // Hit 3 (reaches limit)
    const res3 = await checkAndIncrementHourlyRate(testSenderId, limit);
    expect(res3.allowed).toBe(true);
    expect(res3.currentCount).toBe(3);

    // Hit 4 (exceeds limit: should return allowed: false, and roll back count to 3)
    const res4 = await checkAndIncrementHourlyRate(testSenderId, limit);
    expect(res4.allowed).toBe(false);
    expect(res4.currentCount).toBe(3);

    // Clean up test key
    const key = getHourlyRateKey(testSenderId);
    await redisCommandClient.del(key);
  });
});
