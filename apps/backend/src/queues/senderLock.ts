import { redisCommandClient } from '../config/redis';

/**
 * Ensures minimum delay between emails for a specific sender across all concurrent workers.
 * Uses atomic SET ... NX PX.
 * Returns true if lock was acquired (slot available).
 * Returns false if another email was sent recently from this sender.
 */
export async function acquireSenderSlot(
  senderId: string,
  minDelayMs: number
): Promise<boolean> {
  const lockKey = `lock:sender:${senderId}`;
  // SET key value NX PX milliseconds: returns "OK" if key was set, null if key already exists
  const result = await redisCommandClient.set(lockKey, '1', 'PX', minDelayMs, 'NX');
  return result === 'OK';
}
