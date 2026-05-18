import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const modulePath = path.resolve("src/lib/agent/transport.ts");

function loadModule() {
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
      console,
      Date,
      Math,
      RegExp,
      String,
      Number,
    },
    { filename: modulePath }
  );
  return cjsModule.exports;
}

test("parses round-trip transport details from a Chinese travel request", () => {
  const { parseTransportRequest } = loadModule();

  const result = parseTransportRequest("我想2025-12-30到2026-1-7从北京去武汉 预算10000");

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    origin: "北京",
    destination: "武汉",
    departDate: "2025-12-30",
    returnDate: "2026-01-07",
    budget: 10000,
  });
});

test("builds mock outbound and return transport options", () => {
  const { buildMockTransportPlan } = loadModule();

  const plan = buildMockTransportPlan({
    origin: "北京",
    destination: "武汉",
    departDate: "2025-12-30",
    returnDate: "2026-01-07",
    budget: 10000,
  });

  assert.equal(plan.origin, "北京");
  assert.equal(plan.destination, "武汉");
  assert.equal(plan.outboundOptions.length, 3);
  assert.equal(plan.returnOptions.length, 3);
  assert.equal(plan.outboundOptions[0].mode, "train");
  assert.equal(plan.outboundOptions[0].provider, "mock");
  assert.equal(plan.outboundOptions[0].confidence, "estimated");
  assert.match(plan.disclaimer, /价格和余票以实际购票平台为准/);
});

test("builds a transport plan from route-only conversation using fallback date", () => {
  const { createTransportPlanFromMessages } = loadModule();

  const plan = createTransportPlanFromMessages(
    ["我要从北京去上海"],
    "2026-05-18"
  );

  assert.equal(plan.origin, "北京");
  assert.equal(plan.destination, "上海");
  assert.equal(plan.departDate, "2026-05-18");
  assert.equal(plan.outboundOptions.length, 3);
  assert.equal(plan.returnOptions.length, 0);
});

test("builds a transport plan from structured trip requirements", () => {
  const { createTransportPlanFromRequirements } = loadModule();

  const plan = createTransportPlanFromRequirements({
    origin: "北京",
    destination: "上海",
    startDate: "2026-06-01",
    endDate: "2026-06-03",
    budget: { min: 3000, max: 8000 },
  });

  assert.equal(plan.origin, "北京");
  assert.equal(plan.destination, "上海");
  assert.equal(plan.departDate, "2026-06-01");
  assert.equal(plan.returnDate, "2026-06-03");
  assert.equal(plan.outboundOptions.length, 3);
  assert.match(plan.fallbackPrompt, /已经购买好了出行车票/);
});

test("infers a return date from day count when structured dates are partial", () => {
  const { createTransportPlanFromRequirements } = loadModule();

  const plan = createTransportPlanFromRequirements({
    origin: "北京",
    destination: "上海",
    startDate: "2026-06-01",
    dayCount: 3,
  });

  assert.equal(plan.returnDate, "2026-06-03");
  assert.equal(plan.returnOptions.length, 3);
});
