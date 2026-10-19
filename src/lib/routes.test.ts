import { expect, it } from 'vitest';
import { BASE, routes } from './routes.ts';

it('builds every internal URL under the site base', () => {
  expect(BASE.endsWith('/')).toBe(true);
  expect(routes.rides()).toBe(`${BASE}rides`);
  expect(routes.ride('demo-0001')).toBe(`${BASE}rides/demo-0001`);
  expect(routes.gear('b1')).toBe(`${BASE}gear/b1`);
  expect(routes.year(2024)).toBe(`${BASE}years/2024`);
  expect(routes.segment('42')).toBe(`${BASE}segments/42`);
  expect(routes.streams('7')).toBe(`${BASE}streams/7.json`);
});

it('encodes map filters and leaves out missing ones', () => {
  expect(routes.map()).toBe(`${BASE}map`);
  expect(routes.map({ country: 'United States', place: 'San José' })).toBe(`${BASE}map?country=United%20States&place=San%20Jos%C3%A9`);
  expect(routes.map({ country: '', place: 'Reno' })).toBe(`${BASE}map?country=&place=Reno`);
});
