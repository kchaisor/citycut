import { buildWalkNetwork, isWalkNetworkRoad, type WalkNetwork } from "./walkRippleNetwork";
import type { RoadFeat } from "../types";

export const SIGNAL_TRACE_CENTRALITY_LABEL =
  "Street pulse rate uses an estimated centrality (node degree on the walkable road graph, not betweenness).";

export type EdgeCentrality = {
  edgeIndex: number;
  score: number;
};

export function degreeCentralityScores(network: WalkNetwork): Float32Array {
  const degree = new Uint16Array(network.nodes.length);
  for (const edge of network.edges) {
    degree[edge.a]! += 1;
    degree[edge.b]! += 1;
  }
  let maxDeg = 1;
  for (let i = 0; i < degree.length; i++) maxDeg = Math.max(maxDeg, degree[i]!);
  const scores = new Float32Array(network.edges.length);
  network.edges.forEach((edge, edgeIndex) => {
    const avg = (degree[edge.a]! + degree[edge.b]!) * 0.5;
    scores[edgeIndex] = avg / maxDeg;
  });
  return scores;
}

export function buildStreetCentrality(roads: readonly RoadFeat[]): {
  network: WalkNetwork;
  edgeScore: Float32Array;
} | null {
  const network = buildWalkNetwork(roads);
  if (!network) return null;
  return { network, edgeScore: degreeCentralityScores(network) };
}

export function pulseRateHzFromCentrality(score: number): number {
  const clamped = Math.max(0, Math.min(1, score));
  return 0.08 + clamped * 0.42;
}

export function walkableRoadCount(roads: readonly RoadFeat[]): number {
  return roads.filter(isWalkNetworkRoad).length;
}

export function edgePulseRate(edgeScore: Float32Array, edgeIndex: number): number {
  return pulseRateHzFromCentrality(edgeScore[edgeIndex] ?? 0);
}
