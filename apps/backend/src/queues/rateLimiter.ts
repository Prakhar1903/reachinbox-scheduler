import { redisCommandClient } from '../config/redis';

// Atomic Lua script: INCR key, and set TTL (3600 seconds) if it's the first hit
const rateLimitLua = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

export function getHourlyRateKey(senderId: string, date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  return `rate:${senderId}:${yyyy}${mm}${dd}${hh}`;
}

export function getMsUntilNextHour(now: Date = new Date()): { delayMs: number; nextHourDate: Date } {
  const nextHour = new Date(now);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1, 0, 0, 0);
  const delayMs = Math.max(1000, nextHour.getTime() - now.getTime());
  return { delayMs, nextHourDate: nextHour };
}

export async function checkAndIncrementHourlyRate(
  senderId: string,
  hourlyLimit: number
): Promise<{ allowed: boolean; currentCount: number }> {
  const key = getHourlyRateKey(senderId);
  const windowTtlSeconds = 3600;

  const result = await redisCommandClient.eval(
    rateLimitLua,
    1,
    key,
    windowTtlSeconds
  );

  const currentCount = Number(result);

  if (currentCount > hourlyLimit) {
    // Over the limit: rollback the counter so un-sent email doesn't exhaust next attempts prematurely
    await redisCommandClient.decr(key);
    return { allowed: false, currentCount: currentCount - 1 };
  }

  return { allowed: true, currentCount };
}

export async function decrementHourlyRate(senderId: string): Promise<void> {
  const key = getHourlyRateKey(senderId);
  const current = await redisCommandClient.get(key);
  if (current && parseInt(current, 10) > 0) {
    await redisCommandClient.decr(key);
  }
}

export async function getCurrentHourlyUsage(senderId: string): Promise<number> {
  const key = getHourlyRateKey(senderId);
  const count = await redisCommandClient.get(key);
  return count ? parseInt(count, 10) : 0;
}
