/**
 * Test adapter for the Strava client (createStravaClient): same interface, answers from a local
 * function instead of the API. Shared by all sync and backfill tests; never used in production.
 */
import { DailyLimitError } from './strava.mjs';

/**
 * @param {(path: string, params: object, options: object) => any} respond answer per request
 *   (value, promise or throw). Throw `fake.dailyLimit()` to simulate the daily rate limit.
 */
export function createStravaFake(respond = () => null) {
  const calls = [];
  let handler = respond;
  return {
    /** Every request as [path, params, options]. */
    calls,
    async get(path, params = {}, options = {}) {
      calls.push([path, params, options]);
      return handler(path, params, options);
    },
    usage: () => ({ calls: calls.length, daily: calls.length, dailyLimit: 1000, short: 0, shortLimit: 100 }),
    isDailyLimit: (error) => error instanceof DailyLimitError,
    /** The error the real client throws at the daily limit. */
    dailyLimit: () => new DailyLimitError('Strava daily limit reached'),
    /** Replace the answers for the following requests. */
    respondWith(next) { handler = next; },
  };
}
