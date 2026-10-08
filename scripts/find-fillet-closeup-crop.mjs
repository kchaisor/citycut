/**
 * Close-up on a Fitzroy path–path crossing (arc tolerance visible at ~6 m).
 */
import { writeFileSync } from "node:fs";

const close = "-4 130 6 6";
writeFileSync("/opt/cursor/artifacts/kelvin-fitzroy-closeup.txt", close);
console.log(JSON.stringify({ close, crossing: [4, 132] }));
