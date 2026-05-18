import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const modulePath = path.resolve("src/lib/weather/amapWeather.ts");

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
      URLSearchParams,
      Number,
      String,
      Math,
    },
    { filename: modulePath }
  );
  return cjsModule.exports;
}

test("builds AMap forecast weather params with city adcode", () => {
  const { buildAmapWeatherParams } = loadModule();

  const params = buildAmapWeatherParams({
    key: "test-key",
    city: "530100",
    extensions: "all",
  });

  assert.equal(params.get("key"), "test-key");
  assert.equal(params.get("city"), "530100");
  assert.equal(params.get("extensions"), "all");
  assert.equal(params.get("output"), "JSON");
});

test("normalizes AMap forecast casts into app weather forecasts", () => {
  const { normalizeAmapWeatherResponse } = loadModule();

  const result = normalizeAmapWeatherResponse(
    {
      status: "1",
      info: "OK",
      forecasts: [
        {
          city: "昆明市",
          adcode: "530100",
          province: "云南",
          reporttime: "2026-05-18 11:00:00",
          casts: [
            {
              date: "2026-05-18",
              dayweather: "小雨",
              nightweather: "多云",
              daytemp: "23",
              nighttemp: "14",
              daypower: "≤3",
            },
          ],
        },
      ],
    },
    3
  );

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    location: "云南 昆明市",
    forecasts: [
      {
        date: "2026-05-18",
        condition: "小雨转多云",
        tempHigh: 23,
        tempLow: 14,
        humidity: 0,
        windSpeed: 3,
        icon: "rainy",
        precipProbability: 0.6,
      },
    ],
  });
});

test("extracts adcode from a geocode response", () => {
  const { readAdcodeFromGeocodeResponse } = loadModule();

  assert.equal(
    readAdcodeFromGeocodeResponse({
      status: "1",
      geocodes: [{ adcode: "110100", city: "北京市" }],
    }),
    "110100"
  );
});
