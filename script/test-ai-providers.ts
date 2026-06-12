/**
 * Test script to check if configured AI APIs (Perplexity, Gemini, OpenRouter) are working.
 * Run with: npx tsx script/test-ai-providers.ts
 */

import "dotenv/config";
import { storage } from "../server/storage.js";
import { Perplexity } from "@perplexity-ai/perplexity_ai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

interface ProviderTestResult {
  username: string;
  provider: string;
  status: "configured" | "not_configured" | "success" | "error";
  model: string;
  response?: string;
  responseTimeMs?: number;
  error?: string;
}

async function testPerplexity(apiKey: string, model: string): Promise<Omit<ProviderTestResult, "provider" | "username">> {
  const startTime = Date.now();
  try {
    const perplexity = new Perplexity({ apiKey });
    const completion = await perplexity.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Respond in exactly 3 words: 'Perplexity is working'." }],
    });
    
    const contentRaw = completion.choices?.[0]?.message?.content;
    let content = "";
    if (typeof contentRaw === 'string') {
      content = contentRaw;
    } else if (Array.isArray(contentRaw)) {
      content = contentRaw.map(c => typeof c === 'string' ? c : (c as any)?.text || '').join('');
    } else {
      content = String(contentRaw || '');
    }

    return {
      status: "success",
      model,
      response: content.trim(),
      responseTimeMs: Date.now() - startTime,
    };
  } catch (err: any) {
    return {
      status: "error",
      model,
      error: err?.message || String(err),
      responseTimeMs: Date.now() - startTime,
    };
  }
}

async function testGemini(apiKey: string, model: string): Promise<Omit<ProviderTestResult, "provider" | "username">> {
  const startTime = Date.now();
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModelInstance = genAI.getGenerativeModel({ model });
    const result = await geminiModelInstance.generateContent("Respond in exactly 3 words: 'Gemini is working'.");
    const response = await result.response;
    const content = response.text();

    return {
      status: "success",
      model,
      response: content.trim(),
      responseTimeMs: Date.now() - startTime,
    };
  } catch (err: any) {
    return {
      status: "error",
      model,
      error: err?.message || String(err),
      responseTimeMs: Date.now() - startTime,
    };
  }
}

async function testOpenRouter(apiKey: string, model: string): Promise<Omit<ProviderTestResult, "provider" | "username">> {
  const startTime = Date.now();
  try {
    const openrouter = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://neskiapply.com",
        "X-Title": "NeskiApply",
      },
    });
    const completion = await openrouter.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Respond in exactly 3 words: 'OpenRouter is working'." }],
      max_tokens: 15,
    });

    const content = completion.choices?.[0]?.message?.content || "";

    return {
      status: "success",
      model,
      response: content.trim(),
      responseTimeMs: Date.now() - startTime,
    };
  } catch (err: any) {
    return {
      status: "error",
      model,
      error: err?.message || String(err),
      responseTimeMs: Date.now() - startTime,
    };
  }
}

async function main() {
  console.log("================================================================");
  console.log("🧪 STARTING AI PROVIDERS API TEST");
  console.log("================================================================\n");

  const allUsers = await storage.getAllUsers();
  if (allUsers.length === 0) {
    console.error("❌ No users found in the database.");
    process.exit(1);
  }

  const results: ProviderTestResult[] = [];

  for (const user of allUsers) {
    console.log(`👤 Checking configuration for user: "${user.username}" (ID: ${user.id})`);
    
    // Fetch API Keys
    const perplexityKey = (await storage.getSetting("perplexity_api_key", user.id))?.value || (user === allUsers[0] ? process.env.PERPLEXITY_API_KEY : "") || "";
    const geminiKey = (await storage.getSetting("gemini_api_key", user.id))?.value || (user === allUsers[0] ? process.env.GEMINI_API_KEY : "") || "";
    const openrouterKey = (await storage.getSetting("openrouter_api_key", user.id))?.value || (user === allUsers[0] ? process.env.OPENROUTER_API_KEY : "") || "";

    // Fetch preferred models
    const perplexityModel = (await storage.getSetting("perplexity_model", user.id))?.value || "sonar-pro";
    const geminiModel = (await storage.getSetting("gemini_model", user.id))?.value || "gemini-2.5-flash";
    const openrouterModel = (await storage.getSetting("openrouter_model", user.id))?.value || "mistralai/mistral-small-3.1-24b-instruct:free";

    // Test Perplexity
    if (perplexityKey) {
      console.log(`📡 Testing Perplexity API (Model: ${perplexityModel})...`);
      const res = await testPerplexity(perplexityKey, perplexityModel);
      results.push({ username: user.username, provider: "Perplexity", ...res });
      if (res.status === "success") {
        console.log(`   ✅ Success (${res.responseTimeMs}ms): "${res.response}"`);
      } else {
        console.log(`   ❌ Failed (${res.responseTimeMs}ms): ${res.error}`);
      }
    } else {
      results.push({ username: user.username, provider: "Perplexity", status: "not_configured", model: perplexityModel });
    }

    // Test Gemini
    if (geminiKey) {
      console.log(`📡 Testing Gemini API (Model: ${geminiModel})...`);
      const res = await testGemini(geminiKey, geminiModel);
      results.push({ username: user.username, provider: "Gemini", ...res });
      if (res.status === "success") {
        console.log(`   ✅ Success (${res.responseTimeMs}ms): "${res.response}"`);
      } else {
        console.log(`   ❌ Failed (${res.responseTimeMs}ms): ${res.error}`);
      }
    } else {
      results.push({ username: user.username, provider: "Gemini", status: "not_configured", model: geminiModel });
    }

    // Test OpenRouter
    if (openrouterKey) {
      console.log(`📡 Testing OpenRouter API (Model: ${openrouterModel})...`);
      const res = await testOpenRouter(openrouterKey, openrouterModel);
      results.push({ username: user.username, provider: "OpenRouter", ...res });
      if (res.status === "success") {
        console.log(`   ✅ Success (${res.responseTimeMs}ms): "${res.response}"`);
      } else {
        console.log(`   ❌ Failed (${res.responseTimeMs}ms): ${res.error}`);
      }
    } else {
      results.push({ username: user.username, provider: "OpenRouter", status: "not_configured", model: openrouterModel });
    }
    console.log();
  }

  // Print Summary Table
  console.log("================================================================");
  console.log("📊 SUMMARY OF TEST RESULTS");
  console.log("================================================================");
  console.table(
    results.map(r => ({
      User: r.username,
      Provider: r.provider,
      Model: r.model,
      Status: r.status === "success" ? "✅ Success" : r.status === "error" ? "❌ Failed" : "⚪ Not Configured",
      "Time (ms)": r.responseTimeMs != null ? `${r.responseTimeMs}ms` : "N/A",
      Details: r.error ? r.error.substring(0, 50) + "..." : r.response || "No response details"
    }))
  );
  console.log("================================================================\n");

  const hasFailures = results.some(r => r.status === "error");
  process.exit(hasFailures ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error running test script:", err);
  process.exit(1);
});
