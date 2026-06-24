import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";
import { createRequire } from "node:module";

const modulePath = path.resolve("src/lib/agent/sessionStore.ts");
const requireFromModule = createRequire(modulePath);

function createFailingSupabaseClient() {
  const fail = async () => ({
    data: null,
    error: { message: "network down", code: "TEST_NETWORK" },
  });
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: fail }) }),
      insert: async () => ({ error: { message: "network down", code: "TEST_NETWORK" } }),
      update: () => ({ eq: async () => ({ error: { message: "network down", code: "TEST_NETWORK" } }) }),
    }),
  };
}

function loadModule() {
  const source = fs.readFileSync(modulePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const cjsModule = { exports: {} };
  const sandboxGlobal = {};
  vm.runInNewContext(
    outputText,
    {
      module: cjsModule,
      exports: cjsModule.exports,
      require: (specifier) => {
        if (specifier === "@supabase/supabase-js") {
          return { createClient: () => createFailingSupabaseClient() };
        }
        if (specifier === "@/lib/auth/guestUser") {
          return { SERVER_ANONYMOUS_USER_ID: "anonymous-server-user" };
        }
        return requireFromModule(specifier);
      },
      process: {
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        },
      },
      globalThis: sandboxGlobal,
      crypto: { randomUUID: () => "session-id" },
      JSON,
      Date,
    },
    { filename: modulePath }
  );
  return cjsModule.exports;
}

test("falls back to in-memory agent sessions when Supabase persistence fails", async () => {
  const { saveAgentSession, loadAgentSession } = loadModule();
  const state = {
    threadId: "fallback-thread",
    userId: "local-user",
    currentMessage: "开始规划",
    parsedTripRequirements: { destination: "北京", dayCount: 3 },
  };

  const saveResult = await saveAgentSession(state, "awaiting_confirmation");
  const loaded = await loadAgentSession("fallback-thread");

  assert.equal(saveResult.persisted, false);
  assert.match(saveResult.error, /network down/);
  assert.equal(loaded.threadId, "fallback-thread");
  assert.equal(loaded.currentMessage, "开始规划");
});
