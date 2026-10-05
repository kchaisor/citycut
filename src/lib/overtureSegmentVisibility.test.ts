import { describe, expect, it } from "vitest";
import {
  clipLineToGroundVisible,
  clipLineToVisibleSpans,
  deckPiecesFromLine,
  elevatedSpansFromOvertureProps,
  groundHiddenSpansForLine,
  groundHiddenSpansFromOvertureProps,
  hiddenSpansFromOvertureProps,
} from "./overtureSegmentVisibility";
import { MIN_DECK_SPAN_M } from "./roadDrape";

describe("overtureSegmentVisibility", () => {
  it("marks tunnels, covered spans, and negative levels as hidden", () => {
    expect(hiddenSpansFromOvertureProps({ road_flags: '[{"values":["is_tunnel"]}]' })).toEqual([[0, 1]]);
    expect(hiddenSpansFromOvertureProps({ level_rules: '[{"value":-1}]' })).toEqual([[0, 1]]);
    expect(
      hiddenSpansFromOvertureProps({
        road_flags: '[{"between":[0.2,0.8],"values":["is_tunnel"]}]',
      }),
    ).toEqual([[0.2, 0.8]]);
  });

  it("marks bridges and positive levels as elevated, and keeps tunnels hidden", () => {
    expect(elevatedSpansFromOvertureProps({ road_flags: '[{"values":["is_bridge"]}]' })).toEqual([[0, 1]]);
    expect(elevatedSpansFromOvertureProps({ level_rules: '[{"value":2}]' })).toEqual([[0, 1]]);
    expect(elevatedSpansFromOvertureProps({ rail_flags: '[{"values":["is_bridge"]}]' })).toEqual([[0, 1]]);
    expect(
      elevatedSpansFromOvertureProps({
        road_flags: '[{"values":["is_bridge","is_tunnel"]}]',
      }),
    ).toEqual([]);
    expect(
      groundHiddenSpansFromOvertureProps({
        road_flags: '[{"between":[0.2,0.5],"values":["is_bridge"]}]',
      }),
    ).toEqual([[0.2, 0.5]]);
  });

  it("extracts elevated spans along a centreline", () => {
    const line: [number, number][] = [
      [0, 0],
      [100, 0],
    ];
    const parts = clipLineToVisibleSpans(line, [[0.25, 0.75]]);
    expect(parts).toHaveLength(1);
    expect(parts[0][0][0]).toBeCloseTo(25, 0);
    expect(parts[0][1][0]).toBeCloseTo(75, 0);
  });

  it("drops short elevated pieces from deck meshing but keeps long spans", () => {
    const line: [number, number][] = [
      [0, 0],
      [100, 0],
    ];
    const props = { level_rules: '[{"between":[0.05,0.12],"value":1},{"between":[0.2,0.5],"value":1}]' };
    const pieces = deckPiecesFromLine(line, props, "road", "arterial");
    expect(pieces).toHaveLength(1);
    expect(pieces[0][0][0]).toBeCloseTo(20, 0);
    expect(pieces[0][1][0]).toBeCloseTo(50, 0);
    const hidden = groundHiddenSpansForLine(line, props, "road", "arterial");
    expect(hidden).toEqual([[0.2, 0.5]]);
    expect(MIN_DECK_SPAN_M).toBeGreaterThan(0);
  });

  it("clips a centreline to the visible spans", () => {
    const line: [number, number][] = [
      [0, 0],
      [100, 0],
    ];
    const hidden = hiddenSpansFromOvertureProps({
      road_flags: '[{"between":[0.4,0.6],"values":["is_tunnel"]}]',
    });
    const parts = clipLineToGroundVisible(line, hidden);
    expect(parts).toHaveLength(2);
    expect(parts[0][0]).toEqual([0, 0]);
    expect(parts[0][1][0]).toBeCloseTo(40, 0);
    expect(parts[1][0][0]).toBeCloseTo(60, 0);
    expect(parts[1][1]).toEqual([100, 0]);
  });
});
