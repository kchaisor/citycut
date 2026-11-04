import json
import math
import struct
import sys
import urllib.request
from pathlib import Path

import h3
import networkx as nx
import osmnx as ox
from pyrosm import OSM

WALK_KMH = 4.8
WALK_MPM = WALK_KMH * 1000.0 / 60.0
PBF_URL = "https://download.geofabrik.de/australia-oceania/australia/victoria-latest.osm.pbf"


def haversine_m(a_lat, a_lon, b_lat, b_lon):
    r = 6371000.0
    d_lat = math.radians(b_lat - a_lat)
    d_lon = math.radians(b_lon - a_lon)
    lat1 = math.radians(a_lat)
    lat2 = math.radians(b_lat)
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def ensure_pbf(cache_dir: Path) -> Path:
    pbf_path = cache_dir / "victoria-latest.osm.pbf"
    if pbf_path.exists() and pbf_path.stat().st_size > 10_000_000:
        return pbf_path
    cache_dir.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {PBF_URL}…", flush=True)
    urllib.request.urlretrieve(PBF_URL, pbf_path)
    return pbf_path


def main() -> None:
    out_dir = Path(sys.argv[1])
    cells = json.loads((out_dir / "cells.json").read_text())
    lats = []
    lons = []
    for cell in cells:
        lat, lng = h3.cell_to_latlng(cell)
        lats.append(lat)
        lons.append(lng)
    pad = 0.03
    north = max(lats) + pad
    south = min(lats) - pad
    east = max(lons) + pad
    west = min(lons) - pad
    pbf_path = ensure_pbf(out_dir / "_cache")
    print("Extracting walk network from Geofabrik Victoria PBF…", flush=True)
    osm = OSM(str(pbf_path), bounding_box=[west, south, east, north])
    nodes, edges = osm.get_network(network_type="walking", nodes=True)
    graph = osm.to_graph(
        nodes,
        edges,
        graph_type="networkx",
        osmnx_compatible=True,
        network_type="walking",
    )
    graph = ox.add_edge_speeds(graph, fallback=WALK_KMH)
    graph = ox.add_edge_travel_times(graph)
    graph = ox.project_graph(graph)
    index = {cell: i for i, cell in enumerate(cells)}
    lons = []
    lats = []
    for cell in cells:
        lat, lng = h3.cell_to_latlng(cell)
        lats.append(lat)
        lons.append(lng)
    print(f"Snapping {len(cells)} hex centres to walk network…", flush=True)
    hex_nodes = list(ox.nearest_nodes(graph, lons, lats))
    path_cache = {}
    chunks = []
    for i, cell in enumerate(cells):
        nbrs = []
        weights = []
        origin_node = hex_nodes[i]
        if origin_node not in path_cache:
            path_cache[origin_node] = nx.single_source_dijkstra_path_length(
                graph,
                origin_node,
                weight="travel_time",
                cutoff=7200,
            )
        lengths = path_cache[origin_node]
        for nh in h3.grid_disk(cell, 1):
            if nh == cell:
                continue
            j = index.get(nh)
            if j is None:
                continue
            lat_a, lon_a = h3.cell_to_latlng(cell)
            lat_b, lon_b = h3.cell_to_latlng(nh)
            geo_min = haversine_m(lat_a, lon_a, lat_b, lon_b) / WALK_MPM
            target = hex_nodes[j]
            seconds = lengths.get(target)
            if seconds is None:
                minutes = geo_min
            else:
                minutes = max(geo_min, seconds / 60.0)
            nbrs.append(j)
            weights.append(minutes)
        row = struct.pack("<B", len(nbrs))
        for k, w in zip(nbrs, weights):
            row += struct.pack("<HH", k, int(round(w * 1000)))
        chunks.append(row)
        if (i + 1) % 500 == 0:
            print(f"Walk edges {i + 1}/{len(cells)}…", flush=True)
    (out_dir / "graph.bin").write_bytes(b"".join(chunks))
    meta = {
        "source": "Geofabrik Victoria extract (Pyrosm walk network)",
        "url": PBF_URL,
        "walkSpeedKmh": WALK_KMH,
        "edgeCount": sum(len(h3.grid_disk(c, 1)) for c in cells),
    }
    (out_dir / "walk-build-meta.json").write_text(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
