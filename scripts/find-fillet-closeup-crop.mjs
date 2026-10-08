/** ~8 m close-up where footpath fillet + centreline smoothing differ most from main. */
import { writeFileSync } from "node:fs";

const close = "-10 100 8 8";
writeFileSync("/opt/cursor/artifacts/kelvin-fitzroy-closeup.txt", close);
console.log(JSON.stringify({ close }));
