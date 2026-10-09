import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CityModel } from "../types";
import { COLOUR_FALLBACK } from "./colours";
import { DEFAULT_LINE_STYLES } from "./drawingStyle";
import { clearFootpathUnionCacheForTests } from "./roadFill";
import { computeSmoothPlanPaths } from "./smoothPlanCompute";
import { planPathsFromSiteStyle, resetPlanPathsSessionForTests } from "./planPathsSession";
import { planSmoothJobKey } from "./planSmoothJobKey";
import {
  buildSmoothPlanPathsInWorker,
  SupersededSmoothPlanJob,
  terminateSmoothPlanWorkerForTests,
} from "./smoothPlanWorkerClient";
import type { SmoothPlanWorkerIn, SmoothPlanWorkerOut } from "./smoothPlan.worker";

type MockWorkerInstance = {
  onmessage: ((event: MessageEvent<SmoothPlanWorkerOut>) => void) | null;
  postMessage: (msg: SmoothPlanWorkerIn) => void;
  terminate: ReturnType<typeof vi.fn>;
  pending: SmoothPlanWorkerIn[];
};

const mockWorkers: MockWorkerInstance[] = [];

function testModel(): CityModel {
  return {
    placeLabel: "Worker queue test",
    center: { lon: 144.9631, lat: -37.8136 },
    sideM: 100,
    layers: { buildings: true, roads: true, waterGreen: true, trees: false },
    buildings: [],
    blocks: [],
    roads: [{ id: 1, line: [[-40, 0], [40, 0]], width: 8, kind: "road", grade: "arterial" }],
    areas: [],
    trees: [],
    roadKm: 0.1,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

function withColours(model = testModel()) {
  const request = planPathsFromSiteStyle(model, 1000, DEFAULT_LINE_STYLES);
  return { ...request, colourSnapshot: { ...COLOUR_FALLBACK } };
}

describe("smoothPlanWorkerClient queue", () => {
  beforeEach(() => {
    mockWorkers.length = 0;
    vi.stubGlobal(
      "Worker",
      vi.fn(() => {
        const instance: MockWorkerInstance = {
          onmessage: null,
          pending: [],
          terminate: vi.fn(),
          postMessage(msg: SmoothPlanWorkerIn) {
            instance.pending.push(msg);
          },
        };
        mockWorkers.push(instance);
        return instance;
      }),
    );
    clearFootpathUnionCacheForTests();
    resetPlanPathsSessionForTests();
    terminateSmoothPlanWorkerForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    terminateSmoothPlanWorkerForTests();
  });

  it("rejects superseded in-flight jobs when the job key changes", async () => {
    const model = testModel();
    const reqA = withColours(model);
    const reqB = {
      ...reqA,
      planOptions: { ...reqA.planOptions, pathFilletM: (reqA.planOptions?.pathFilletM ?? 2) + 4 },
    };
    clearFootpathUnionCacheForTests();
    const promiseA = buildSmoothPlanPathsInWorker(reqA);
    const promiseB = buildSmoothPlanPathsInWorker(reqB);
    await expect(promiseA).rejects.toBeInstanceOf(SupersededSmoothPlanJob);
    expect(mockWorkers.length).toBe(2);
    expect(mockWorkers[0]!.terminate).toHaveBeenCalled();

    const workerB = mockWorkers[1]!;
    const msg = workerB.pending[0]!;
    expect(msg.jobKey).toBe(planSmoothJobKey(reqB));
    clearFootpathUnionCacheForTests();
    const plan = computeSmoothPlanPaths(reqB);
    workerB.onmessage?.(
      new MessageEvent("message", {
        data: { id: msg.id, jobKey: msg.jobKey, token: msg.token, plan },
      }),
    );
    const resolved = await promiseB;
    expect(resolved.pathFill).toEqual(plan.pathFill);
  });

  it("ignores worker responses whose jobKey no longer matches", async () => {
    const model = testModel();
    const reqA = withColours(model);
    const reqB = {
      ...reqA,
      planOptions: { ...reqA.planOptions, pathFilletM: (reqA.planOptions?.pathFilletM ?? 2) + 2 },
    };
    clearFootpathUnionCacheForTests();
    const promiseB = buildSmoothPlanPathsInWorker(reqB);
    const workerB = mockWorkers[mockWorkers.length - 1]!;
    const msg = workerB.pending[0]!;
    clearFootpathUnionCacheForTests();
    const stale = computeSmoothPlanPaths(reqA);
    workerB.onmessage?.(
      new MessageEvent("message", {
        data: { id: msg.id, jobKey: planSmoothJobKey(reqA), token: msg.token, plan: stale },
      }),
    );
    clearFootpathUnionCacheForTests();
    const fresh = computeSmoothPlanPaths(reqB);
    workerB.onmessage?.(
      new MessageEvent("message", {
        data: { id: msg.id, jobKey: msg.jobKey, token: msg.token, plan: fresh },
      }),
    );
    await expect(promiseB).resolves.toEqual(fresh);
  });
});
