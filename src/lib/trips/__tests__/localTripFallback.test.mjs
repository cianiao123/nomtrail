import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";
import { createRequire } from "node:module";

const modulePath = path.resolve("src/lib/trips/localTripStore.ts");
const requireFromModule = createRequire(modulePath);

function loadModule() {
  const source = fs.readFileSync(modulePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const items = new Map();
  const db = {
    put: (_collection, item) => {
      items.set(item.id, item);
      return item;
    },
    getById: (_collection, id) => items.get(id) ?? null,
    query: (_collection, predicate) => [...items.values()].filter(predicate),
    delete: (_collection, id) => items.delete(id),
  };
  const cjsModule = { exports: {} };
  vm.runInNewContext(
    outputText,
    {
      module: cjsModule,
      exports: cjsModule.exports,
      require: (specifier) => {
        if (specifier === "@/lib/db/store") return { db };
        return requireFromModule(specifier);
      },
    },
    { filename: modulePath }
  );
  return cjsModule.exports;
}

function sampleTrip(id, userId = "local-user", createdAt = "2026-06-24T00:00:00.000Z") {
  return {
    id,
    userId,
    title: "北京之旅",
    destination: "北京",
    destinationCoord: { lat: 0, lng: 0 },
    startDate: "2026-06-24",
    endDate: "2026-06-26",
    travelers: { adults: 2, children: 0 },
    budget: { currency: "CNY", min: 3000, max: 8000 },
    preferences: ["休闲度假"],
    days: [],
    status: "generated",
    isPublic: false,
    createdAt,
    updatedAt: createdAt,
  };
}

test("local trip store can save, load, list, and delete trips", () => {
  const { saveLocalTrip, loadLocalTrip, listLocalTrips, deleteLocalTrip } = loadModule();

  saveLocalTrip(sampleTrip("older", "local-user", "2026-06-23T00:00:00.000Z"));
  saveLocalTrip(sampleTrip("newer", "local-user", "2026-06-24T00:00:00.000Z"));
  saveLocalTrip(sampleTrip("other-user", "other-user", "2026-06-25T00:00:00.000Z"));

  assert.equal(loadLocalTrip("newer").destination, "北京");
  assert.deepEqual(listLocalTrips("local-user").map((trip) => trip.id), ["newer", "older"]);
  assert.equal(deleteLocalTrip("newer"), true);
  assert.equal(loadLocalTrip("newer"), null);
});

test("agent trip creation and trip detail API are wired to local fallback", () => {
  const nodesSource = fs.readFileSync(path.resolve("src/lib/agent/nodes.ts"), "utf8");
  const tripRouteSource = fs.readFileSync(path.resolve("src/app/api/trips/[id]/route.ts"), "utf8");

  assert.ok(nodesSource.includes("saveLocalTrip"), "createTripNode should save locally when Supabase insert fails");
  assert.ok(tripRouteSource.includes("loadLocalTrip"), "trip detail API should read local fallback when Supabase misses");
});
