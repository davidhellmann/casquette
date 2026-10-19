/**
 * Test adapter for the Strava client (createStravaClient): same interface, answers from a local
 * function instead of the API. Shared by all sync and backfill tests; never used in production.
 */
import { DailyLimitError } from './strava.ts';
import type { GetOptions, QueryParams, StravaClient } from './strava.ts';

/** Answer per request: a value, a promise, or a throw. Throw `fake.dailyLimit()` to simulate the daily rate limit. */
export type FakeResponder = (path: string, params: QueryParams, options: GetOptions) => unknown;

/** The Strava client interface plus what tests inspect and steer. */
export type StravaFake = StravaClient & {
  /** Every request as [path, params, options]. */
  calls: [path: string, params: QueryParams, options: GetOptions][];
  /** The error the real client throws at the daily limit. */
  dailyLimit(): DailyLimitError;
  /** Replace the answers for the following requests. */
  respondWith(next: FakeResponder): void;
};

export function createStravaFake(respond: FakeResponder = () => null): StravaFake {
  const calls: StravaFake['calls'] = [];
  let handler = respond;
  return {
    calls,
    async get(path, params = {}, options = {}) {
      calls.push([path, params, options]);
      return handler(path, params, options);
    },
    usage: () => ({ calls: calls.length, daily: calls.length, dailyLimit: 1000, short: 0, shortLimit: 100 }),
    isDailyLimit: (error) => error instanceof DailyLimitError,
    dailyLimit: () => new DailyLimitError('Strava daily limit reached'),
    respondWith(next) { handler = next; },
  };
}
