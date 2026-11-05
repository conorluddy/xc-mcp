import { labelledLeafCoverage } from '../../../src/utils/ax-coverage.js';
it('ignores unlabelled full-screen containers and counts labelled leaves', () => {
  const frame = { x: 0, y: 0, width: 80, height: 80 };
  expect(labelledLeafCoverage([{ frame }], frame)).toBe(0);
  expect(
    labelledLeafCoverage(
      [
        {
          AXLabel: 'Container',
          frame,
          children: [{ AXLabel: 'Leaf', frame: { ...frame, width: 40 } }],
        },
      ],
      frame
    )
  ).toBe(0.5);
});
it('does not count the labelled application root in a flat idb tree', () => {
  const frame = { x: 0, y: 0, width: 80, height: 80 };
  expect(labelledLeafCoverage([{ type: 'Application', AXLabel: 'App', frame }], frame)).toBe(0);
});
