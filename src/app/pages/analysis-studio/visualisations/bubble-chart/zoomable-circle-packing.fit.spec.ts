import * as d3 from 'd3';
import { fitTopLevelToViewport } from './zoomable-circle-packing';

/** Top-level circles as drawn on the canvas for a root view, the same maths as zoomTo. */
function drawnExtent(root: d3.HierarchyCircularNode<any>, view: [number, number, number], width: number, height: number, size: number) {
  const k = size / view[2];
  const xs = (root.children ?? []).flatMap((d) => [(d.x - view[0]) * k + width / 2 - d.r * k, (d.x - view[0]) * k + width / 2 + d.r * k]);
  const ys = (root.children ?? []).flatMap((d) => [(d.y - view[1]) * k + height / 2 - d.r * k, (d.y - view[1]) * k + height / 2 + d.r * k]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Two big groups and a small one: d3.pack lays them out wider than tall or the reverse. */
function packed(size: number): d3.HierarchyCircularNode<any> {
  const group = (code: string, leaves: number) => ({
    code,
    children: Array.from({ length: leaves }, (_, i) => ({ code: `${code}${i}`, value: 1 })),
  });
  return d3.pack<any>().size([size, size]).padding(3)(
    d3.hierarchy<any>({ code: 'root', children: [group('a', 40), group('b', 40), group('c', 4)] })
      .sum((d: any) => d.value ?? 0)
      .sort((a: any, b: any) => (b.value ?? 0) - (a.value ?? 0))
  );
}

describe('fitTopLevelToViewport', () => {
  for (const [width, height] of [[688, 619], [800, 450], [420, 600]]) {
    it(`fills the tighter side of a ${width}x${height} canvas without running past any edge`, () => {
      const size = Math.min(width, height);
      const root = packed(size);
      const view = fitTopLevelToViewport(root, width, height, size);
      const box = drawnExtent(root, view, width, height, size);

      expect(box.minX).toBeGreaterThanOrEqual(9.5);
      expect(box.minY).toBeGreaterThanOrEqual(9.5);
      expect(box.maxX).toBeLessThanOrEqual(width - 9.5);
      expect(box.maxY).toBeLessThanOrEqual(height - 9.5);
      // One axis touches the 10px margins on both sides.
      const fillsWidth = Math.abs(box.maxX - box.minX - (width - 20)) < 0.5;
      const fillsHeight = Math.abs(box.maxY - box.minY - (height - 20)) < 0.5;
      expect(fillsWidth || fillsHeight).toBe(true);
    });
  }

  it('turns a cluster a quarter when that fits the canvas better, keeping every circle where it was relative to the others', () => {
    const size = 450;
    const root = packed(size);
    const [a, b] = root.children!;
    const gap = Math.hypot(a.x - b.x, a.y - b.y);
    const before = drawnExtent(root, [root.x, root.y, root.r * 2.05], 800, 450, size);
    const view = fitTopLevelToViewport(root, 800, 450, size);
    const after = drawnExtent(root, view, 800, 450, size);

    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(gap, 6); // rigid: no circle moves relative to another
    const area = (box: typeof before) => (box.maxX - box.minX) * (box.maxY - box.minY);
    expect(area(after)).toBeGreaterThan(area(before)); // fills more of the canvas than the old circle framing
  });
});
