import { describe, it, expect } from 'vitest';
import { acquireSenderSlot } from './senderLock';
import { redisCommandClient } from '../config/redis';

describe('Sender Lock (Interval Enforcement)', () => {
  it('allows first caller and blocks concurrent caller within delay window', async () => {
    const testSenderId = `sender-lock-test-${Date.now()}`;
    const delayMs = 500;

    // First attempt should succeed
    const firstAcquire = await acquireSenderSlot(testSenderId, delayMs);
    expect(firstAcquire).toBe(true);

    // Immediate second attempt for same sender should be blocked
    const secondAcquire = await acquireSenderSlot(testSenderId, delayMs);
    expect(secondAcquire).toBe(false);

    // Wait for lock to expire
    await new Promise((resolve) => setTimeout(resolve, 550));

    // Third attempt after TTL should succeed again
    const thirdAcquire = await acquireSenderSlot(testSenderId, delayMs);
    expect(thirdAcquire).toBe(true);

    // Clean up
    await redisCommandClient.del(`lock:sender:${testSenderId}`);
  });
});
