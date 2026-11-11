import heapq
import json
import sys
from pathlib import Path

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

UNREACHABLE = 255.0
BOARD_WAIT = {"weekday_am": 4.0, "midday": 6.0, "weekend": 8.0}


def read_graph(graph_path: Path, cell_count: int):
    buf = graph_path.read_bytes()
    view = memoryview(buf)
    o = 0
    nbr_index = []
    edge_minutes = []
    for _ in range(cell_count):
        count = view[o]
        o += 1
        nbrs = []
        weights = []
        for _k in range(count):
            nbrs.append(int.from_bytes(view[o : o + 2], "little"))
            o += 2
            weights.append(int.from_bytes(view[o : o + 2], "little") / 1000.0)
            o += 2
        nbr_index.append(nbrs)
        edge_minutes.append(weights)
    return nbr_index, edge_minutes


def walk_all_from(origin: int, nbr_index, edge_minutes, max_min: float):
    n = len(nbr_index)
    dist = np.full(n, np.inf, dtype=np.float64)
    dist[origin] = 0.0
    heap = [(0.0, origin)]
    while heap:
        t, i = heapq.heappop(heap)
        if t > dist[i] + 1e-6:
            continue
        if t > max_min:
            continue
        for j, w in zip(nbr_index[i], edge_minutes[i]):
            nt = t + w
            if nt < dist[j]:
                dist[j] = nt
                heapq.heappush(heap, (nt, j))
    return dist


def load_iv(iv_path: Path, stop_count: int) -> np.ndarray:
    raw = np.fromfile(iv_path, dtype=np.float32)
    if raw.size != stop_count * stop_count:
        raise SystemExit(f"iv size mismatch {raw.size} vs {stop_count**2}")
    return raw.reshape(stop_count, stop_count)


def all_pairs_iv(direct: np.ndarray, max_min: float) -> np.ndarray:
    n = direct.shape[0]
    mask = (direct > 0) & (direct < UNREACHABLE - 0.5)
    rows, cols = np.where(mask)
    data = direct[rows, cols].astype(np.float64)
    graph = csr_matrix((data, (rows, cols)), shape=(n, n))
    dist = dijkstra(graph, directed=True, limit=max_min + 60.0)
    dist[~np.isfinite(dist)] = UNREACHABLE
    dist[dist >= UNREACHABLE] = UNREACHABLE
    out = np.full((n, n), UNREACHABLE, dtype=np.float32)
    finite = dist < UNREACHABLE
    out[finite] = dist[finite].astype(np.float32)
    return out


def build_pt_table(
    profile: str,
    dist: np.ndarray,
    stops,
    cell_count: int,
    nbr_index,
    edge_minutes,
) -> bytes:
    wait = BOARD_WAIT[profile]
    walk_cache = {}
    table = np.full((len(stops), cell_count), UNREACHABLE, dtype=np.float32)
    max_board = 45.0
    for s in range(len(stops)):
        row = dist[s]
        reachable = np.where(row < max_board)[0]
        if reachable.size == 0:
            continue
        for t in reachable:
            iv_min = float(row[t])
            cell_idx = stops[t]["cellIndex"]
            if cell_idx not in walk_cache:
                walk_cache[cell_idx] = walk_all_from(cell_idx, nbr_index, edge_minutes, max_board)
            walk_off = walk_cache[cell_idx]
            totals = wait + iv_min + walk_off
            totals[~np.isfinite(totals)] = UNREACHABLE
            totals[totals > 254] = UNREACHABLE
            cur = table[s]
            np.minimum(cur, totals, out=cur)
    packed = np.ceil(table).astype(np.uint8)
    packed[packed >= UNREACHABLE] = int(UNREACHABLE)
    return packed.tobytes()


def main() -> None:
    out_dir = Path(sys.argv[1])
    meta = json.loads((out_dir / "pt-build-meta.json").read_text())
    stop_count = meta["stopCount"]
    cell_count = meta["cellCount"]
    profiles = meta["profiles"]
    stops = json.loads((out_dir / "stations-build.json").read_text())
    nbr_index, edge_minutes = read_graph(out_dir / "graph.bin", cell_count)
    for profile in profiles:
        direct = load_iv(out_dir / f"iv-{profile}.bin", stop_count)
        dist = all_pairs_iv(direct, 60.0)
        blob = build_pt_table(profile, dist, stops, cell_count, nbr_index, edge_minutes)
        name = (
            "pt-weekday-am.bin"
            if profile == "weekday_am"
            else "pt-midday.bin"
            if profile == "midday"
            else "pt-weekend.bin"
        )
        (out_dir / name).write_bytes(blob)


if __name__ == "__main__":
    main()
