import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { openRing, signedArea } from "../src/lib/geo.ts";

function multiArea(multi) {
  let t = 0;
  for (const p of multi) {
    const o = p[0];
    if (o) t += Math.abs(signedArea(openRing(o)));
    for (const h of p.slice(1)) t -= Math.abs(signedArea(openRing(h)));
  }
  return t;
}

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
const tmp = "/tmp/citycut-main-measure.mjs";
const runner = `
import { readFileSync } from "node:fs";
import { planPaths } from "./src/lib/svgPlan.ts";
import { clearFootpathUnionCacheForTests } from "./src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "./src/lib/lineweights.ts";
import { openRing, signedArea } from "./src/lib/geo.ts";
function multiArea(multi){let t=0;for(const p of multi){const o=p[0];if(o)t+=Math.abs(signedArea(openRing(o)));for(const h of p.slice(1))t-=Math.abs(signedArea(openRing(h)));}return t;}
const east=JSON.parse(readFileSync("./src/lib/fixtures/east-melbourne-path-trim.json","utf8"));
clearFootpathUnionCacheForTests();
console.log(Math.round(multiArea(planPaths(east,PATH_WIDTH_M,5,500,5,2500,{pathFilletM:2}).pathFill)));
`;
writeFileSync(tmp, runner);
execSync(`git stash push -u -m measure -- scripts/measure-east-main-area.mjs ${tmp} 2>/dev/null || true`, {
  cwd: "/workspace",
});
execSync("git checkout main --quiet", { cwd: "/workspace" });
const mainArea = Number(execSync(`npx vite-node ${tmp}`, { cwd: "/workspace", encoding: "utf8" }).trim());
execSync(`git checkout ${branch} --quiet`, { cwd: "/workspace" });
execSync("git stash pop --quiet 2>/dev/null || true", { cwd: "/workspace" });
console.log("main east path area", mainArea);
