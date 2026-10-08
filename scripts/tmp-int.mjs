import { intersection } from "polygon-clipping";

const park = [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]];
const road = [[[-10, -40], [10, -40], [10, 40], [-10, 40], [-10, -40]]];
console.log(JSON.stringify(intersection(park, road)));
