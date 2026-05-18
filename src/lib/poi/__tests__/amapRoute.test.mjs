import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const modulePath = path.resolve("src/lib/poi/amapRoute.ts");
const nodesPath = path.resolve("src/lib/agent/nodes.ts");

function loadModule(fetchImpl = async () => ({ json: async () => ({}) })) {
  const source = fs.readFileSync(modulePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const cjsModule = { exports: {} };
  vm.runInNewContext(
    outputText,
    {
      module: cjsModule,
      exports: cjsModule.exports,
      URL,
      URLSearchParams,
      fetch: fetchImpl,
      process: { env: { NEXT_PUBLIC_AMAP_WEB_KEY: "test-key" } },
      AbortSignal: { timeout: () => undefined },
    },
    { filename: modulePath }
  );
  return cjsModule.exports;
}

test("buildAmapRouteUrl uses v5 direction route API with cost fields", () => {
  const { buildAmapRouteUrl } = loadModule();

  const url = buildAmapRouteUrl({
    key: "test-key",
    mode: "walking",
    origin: { lng: 100.1234567, lat: 25.1234567 },
    destination: { lng: 100.7654321, lat: 25.7654321 },
  });

  assert.equal(url.origin + url.pathname, "https://restapi.amap.com/v5/direction/walking");
  assert.equal(url.searchParams.get("key"), "test-key");
  assert.equal(url.searchParams.get("origin"), "100.123457,25.123457");
  assert.equal(url.searchParams.get("destination"), "100.765432,25.765432");
  assert.equal(url.searchParams.get("show_fields"), "cost");
  assert.equal(url.searchParams.get("output"), "json");
});

test("fetchAmapRoute parses distance and duration from route paths", async () => {
  const calls = [];
  const { fetchAmapRoute } = loadModule(async (url) => {
    calls.push(String(url));
    return {
      json: async () => ({
        status: "1",
        route: {
          paths: [
            { distance: "2300", cost: { duration: "720" } },
          ],
        },
      }),
    };
  });

  const route = await fetchAmapRoute({
    mode: "driving",
    origin: { lng: 100, lat: 25 },
    destination: { lng: 100.1, lat: 25.1 },
  });

  assert.equal(calls.length, 1);
  assert.equal(route.distanceMeters, 2300);
  assert.equal(route.durationSeconds, 720);
  assert.equal(route.mode, "driving");
});

test("agent route optimization awaits AMap travel minutes before falling back", () => {
  const source = fs.readFileSync(nodesPath, "utf8");

  assert.ok(source.includes("fetchAmapRoute"), "nodes should use the AMap route client");
  assert.ok(source.includes("await estimateRouteMinutesBetween"), "route optimizer should await real route minutes");
  assert.ok(source.includes("attachKnownPoiAndOptimizeRoutes("), "generated days should still run route optimization");
});
