import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const promptPath = path.resolve("src/lib/agent/prompts.ts");
const nodesPath = path.resolve("src/lib/agent/nodes.ts");

test("itinerary generation receives coordinates and hard route constraints", () => {
  const promptSource = fs.readFileSync(promptPath, "utf8");
  const nodesSource = fs.readFileSync(nodesPath, "utf8");

  assert.ok(promptSource.includes("相邻活动"), "prompt should constrain adjacent activity travel");
  assert.ok(promptSource.includes("用餐"), "prompt should constrain food stops near the route");
  assert.ok(promptSource.includes("折返"), "prompt should explicitly avoid backtracking");
  assert.ok(promptSource.includes("travelMinutesFromPrev"), "prompt should require travel time reasoning");
  assert.ok(nodesSource.includes("formatPlaceForRoutePrompt"), "candidate places should be formatted with route metadata");
  assert.ok(nodesSource.includes("坐标："), "candidate place prompt lines should include coordinates when available");
  assert.ok(nodesSource.includes("attachKnownPoiAndOptimizeRoutes"), "generated days should attach known POIs and run route optimization");
  assert.ok(nodesSource.includes("foodAfterHotelPenalty"), "route optimization should avoid far food immediately after hotel");
  assert.ok(nodesSource.includes("estimateCityTravelMinutes"), "travelMinutesFromPrev should be recalculated from coordinates");
});
