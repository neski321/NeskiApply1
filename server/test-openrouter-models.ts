/**
 * OpenRouter Free Models Availability Test
 * 
 * Tests all AVAILABLE_OPENROUTER_MODELS by sending a minimal prompt to each.
 * Reads the OpenRouter API key from the database.
 * 
 * Usage: npx tsx server/test-openrouter-models.ts
 */

import "dotenv/config";
import OpenAI from "openai";
import pg from "pg";

const AVAILABLE_OPENROUTER_MODELS = [
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "arcee-ai/trinity-large-preview:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-4b-it:free",
  "google/gemma-3n-e2b-it:free",
  "google/gemma-3-12b-it:free",
  "google/gemma-3-27b-it:free",
];

const BROKEN_MODELS = [
  "google/gemini-2.0-flash-exp:free",
  "google/gemini-2.5-flash-preview:free",
  "mistralai/mistral-7b-instruct:free",
  "mistralai/devstral-2512:free",
  "mistralai/mistral-nemo:free",
  "xiaomi/mimo-v2-flash:free",
  "tngtech/deepseek-r1t-chimera:free",
  "tngtech/deepseek-r1t2-chimera:free",
  "qwen/qwen3-coder:free",
  "qwen/qwen-2.5-vl-7b-instruct:free",
  "qwen/qwen3-4b:free",
  "meta-llama/llama-3.1-405b-instruct:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "deepseek/deepseek-r1-0528:free",
  "deepseek/deepseek-r1:free",
];

interface TestResult {
  model: string;
  status: "✅ PASS" | "❌ FAIL" | "⚠️ SLOW";
  responseTime: number;
  preview: string;
  error?: string;
}

async function testModel(client: OpenAI, model: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Reply with exactly one word: WORKING" }],
      max_tokens: 10,
      temperature: 0,
    });

    const elapsed = Date.now() - start;
    const content = response.choices?.[0]?.message?.content?.trim() || "(empty)";

    return {
      model,
      status: elapsed > 15000 ? "⚠️ SLOW" : "✅ PASS",
      responseTime: elapsed,
      preview: content.substring(0, 50),
    };
  } catch (err: any) {
    return {
      model,
      status: "❌ FAIL",
      responseTime: Date.now() - start,
      preview: "",
      error: err.message?.substring(0, 120) || "Unknown error",
    };
  }
}

async function getApiKeyFromDb(): Promise<string | null> {
  if (!process.env.DATABASE_URL) {
    console.log("⚠️  DATABASE_URL not set, cannot read API key from DB.");
    return null;
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(
      `SELECT value FROM settings WHERE key = 'openrouter_api_key' AND value IS NOT NULL AND value != '' LIMIT 1`
    );
    if (result.rows.length > 0) {
      console.log("📌 Found OpenRouter API key in database\n");
      return result.rows[0].value;
    }
    return null;
  } catch (err) {
    console.log("⚠️  Database query failed:", (err as Error).message);
    return null;
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║       OpenRouter Free Models — Availability Test           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Try env var first, then database
  let apiKey = process.env.OPENROUTER_API_KEY || null;

  if (!apiKey) {
    apiKey = await getApiKeyFromDb();
  }

  if (!apiKey) {
    console.error("❌ No OpenRouter API key found!");
    console.error("   Set OPENROUTER_API_KEY env var or configure it in the app Settings.");
    process.exit(1);
  }

  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    defaultHeaders: {
      "HTTP-Referer": "https://neskiapply.ai",
      "X-Title": "NeskiApply Model Test",
    },
  });

  // Test AVAILABLE models
  console.log(`Testing ${AVAILABLE_OPENROUTER_MODELS.length} available models...\n`);
  console.log("─".repeat(80));

  const results: TestResult[] = [];

  for (const model of AVAILABLE_OPENROUTER_MODELS) {
    process.stdout.write(`  Testing ${model}... `);
    const result = await testModel(client, model);
    results.push(result);

    if (result.status === "❌ FAIL") {
      console.log(`${result.status} (${result.responseTime}ms) → ${result.error}`);
    } else {
      console.log(`${result.status} (${result.responseTime}ms) → "${result.preview}"`);
    }

    // Wait between tests to avoid rate-limiting (429 errors on free tier)
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Summary
  console.log("\n" + "═".repeat(80));
  const passed = results.filter(r => r.status === "✅ PASS").length;
  const slow = results.filter(r => r.status === "⚠️ SLOW").length;
  const failed = results.filter(r => r.status === "❌ FAIL").length;

  console.log(`\n📊 Results: ${passed} passed, ${slow} slow, ${failed} failed out of ${results.length} models`);

  if (failed > 0) {
    console.log("\n⚠️  Failed models that should be moved to BROKEN_MODELS:");
    for (const r of results.filter(r => r.status === "❌ FAIL")) {
      console.log(`   - ${r.model}: ${r.error}`);
    }
  }

  // Also check if any BROKEN models have been fixed
  console.log("\n" + "─".repeat(80));
  console.log(`\nRe-checking ${BROKEN_MODELS.length} known broken models (any recoveries?)...\n`);

  const recoveredResults: TestResult[] = [];
  for (const model of BROKEN_MODELS) {
    process.stdout.write(`  Checking ${model}... `);
    const result = await testModel(client, model);
    recoveredResults.push(result);

    if (result.status !== "❌ FAIL") {
      console.log(`🔄 RECOVERED! (${result.responseTime}ms) → "${result.preview}"`);
    } else {
      console.log(`Still broken (${result.responseTime}ms)`);
    }
  }

  const recovered = recoveredResults.filter(r => r.status !== "❌ FAIL");
  if (recovered.length > 0) {
    console.log(`\n🔄 ${recovered.length} model(s) may have been fixed and could be moved back to AVAILABLE:`);
    for (const r of recovered) {
      console.log(`   - ${r.model}`);
    }
  } else {
    console.log(`\n✅ All ${BROKEN_MODELS.length} broken models confirmed still broken.`);
  }

  console.log("\n" + "═".repeat(80));
  console.log("Done!\n");

  process.exit(passed + slow > 0 ? 0 : 1);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
