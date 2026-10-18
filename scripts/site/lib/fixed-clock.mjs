// Refs #46: preloaded into the demo build of `npm run fragments` (node --import) so the build sees a
// fixed "now" (FRAGMENTS_NOW, an ISO instant): the demo dates (src/lib/demo-clock.js), current year and
// periods then never depend on the day the fragments are regenerated. Time still advances from there.
const target = Date.parse(process.env.FRAGMENTS_NOW ?? '');
if (Number.isFinite(target)) {
  const RealDate = Date;
  const offset = target - RealDate.now();
  const now = () => RealDate.now() + offset;
  globalThis.Date = new Proxy(RealDate, {
    construct: (D, args, newTarget) => Reflect.construct(D, args.length ? args : [now()], newTarget),
    apply: () => new RealDate(now()).toString(),
    get: (D, key) => (key === 'now' ? now : Reflect.get(D, key)),
  });
}
