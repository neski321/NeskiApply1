/**
 * Test script to check which OpenRouter free models are working
 * Run with: npx tsx script/test-openrouter-models.ts
 * 
 * This script:
 * 1. Gets the first user's OpenRouter API key from the database
 * 2. Tests all free models in parallel
 * 3. Shows which models work, which return 404, and which are rate-limited
 */

import OpenAI from "openai";
import "dotenv/config";
import { storage } from "../server/storage.js";

// Current free models on OpenRouter (Sep 2026)
const modelsToTest = [
  // Current working free models (Sep 2026)
  "qwen/qwen3.8-27b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-26b-a4b-it:free",
  "thinkingmachines/inkling:free",
  "thinkingmachines/inkling-small:free",
  "poolside/laguna-s-2.1:free",
  "poolside/laguna-xs-2.1:free",
  "dots-studio/dots-3-note-preview:free",
  "nvidia/nemotron-3.5-lightning:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "nvidia/nemotron-3.5-content-safety:free",
  "cohere/north-mini-code:free",
  "liquid/lfm-2.5-2.6b:free",
  "inclusionai/ling-3.0-flash-sante:free",

  // Previously used models (verify they're still broken)
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "arcee-ai/trinity-large-preview:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-4b-it:free",
  "google/gemma-3n-e2b-it:free",
  "google/gemma-3-12b-it:free",
  "google/gemma-3-27b-it:free",
];

interface TestResult {
  model: string;
  status: "success" | "error" | "rate_limited" | "not_found" | "timeout";
  error?: string;
  responseTime?: number;
}

async function testModel(
  openai: OpenAI,
  model: string,
  timeout: number = 10000 // 10 second timeout for faster testing
): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const completion = await openai.chat.completions.create(
      {
        model: model,
        messages: [
          {
            role: "user",
            content: "Say 'test'",
          },
        ],
        max_tokens: 5,
      },
      {
        signal: controller.signal as any,
      }
    );
    
    clearTimeout(timeoutId);
    
    const responseTime = Date.now() - startTime;
    const content = completion.choices?.[0]?.message?.content;
    
    if (content) {
      return {
        model,
        status: "success",
        responseTime,
      };
    } else {
      return {
        model,
        status: "error",
        error: "No content in response",
        responseTime,
      };
    }
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error?.message || String(error);
    const statusCode = error?.status || error?.response?.status;
    
    // Check error type
    if (error.name === "AbortError" || errorMessage.includes("timeout")) {
      return {
        model,
        status: "timeout",
        error: "Request timeout",
        responseTime,
      };
    } else if (statusCode === 404 || errorMessage.includes("404") || errorMessage.includes("No endpoints found")) {
      return {
        model,
        status: "not_found",
        error: errorMessage,
        responseTime,
      };
    } else if (statusCode === 429 || errorMessage.includes("429") || errorMessage.includes("rate limit") || errorMessage.includes("rate-limited")) {
      return {
        model,
        status: "rate_limited",
        error: errorMessage,
        responseTime,
      };
    } else {
      return {
        model,
        status: "error",
        error: errorMessage,
        responseTime,
      };
    }
  }
}

async function main() {
  try {
    // Try to get API key from environment variable first
    let apiKey = process.env.OPENROUTER_API_KEY;
    let userId: string | undefined;
    
    // If not in env, try to get from database (check all users)
    if (!apiKey) {
      const allUsers = await storage.getAllUsers();
      if (allUsers.length === 0) {
        console.error("❌ No users found in database");
        process.exit(1);
      }
      
      // Try to find a user with OpenRouter API key
      for (const user of allUsers) {
        const apiKeySetting = await storage.getSetting("openrouter_api_key", user.id);
        if (apiKeySetting?.value) {
          apiKey = apiKeySetting.value;
          userId = user.id;
          console.log(`👤 Found API key for user: ${user.username} (${user.id})\n`);
          break;
        }
      }
    }
    
    if (!apiKey) {
      console.error("❌ OpenRouter API key not found");
      console.log("\nPlease do one of the following:");
      console.log("1. Add your OpenRouter API key in Settings (in the app)");
      console.log("2. Set OPENROUTER_API_KEY environment variable in .env file");
      console.log("\nExample: OPENROUTER_API_KEY=your_key_here");
      process.exit(1);
    }
    console.log(`🔑 Found OpenRouter API key\n`);
    
    const openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://neskiapply.com",
        "X-Title": "NeskiApply",
      },
    });
    
    console.log(`🧪 Testing ${modelsToTest.length} free models in parallel...\n`);
    const startTime = Date.now();
    
    // Test all models in parallel
    const results = await Promise.allSettled(
      modelsToTest.map(model => testModel(openai, model))
    );
    
    const testResults: TestResult[] = results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        return {
          model: modelsToTest[index],
          status: "error",
          error: result.reason?.message || String(result.reason),
        };
      }
    });
    
    const totalTime = Date.now() - startTime;
    
    // Categorize results
    const successfulModels: string[] = [];
    const failedModels: string[] = [];
    const rateLimitedModels: string[] = [];
    const notFoundModels: string[] = [];
    const timeoutModels: string[] = [];
    
    testResults.forEach(result => {
      if (result.status === "success") {
        successfulModels.push(result.model);
      } else if (result.status === "not_found") {
        notFoundModels.push(result.model);
      } else if (result.status === "rate_limited") {
        rateLimitedModels.push(result.model);
      } else if (result.status === "timeout") {
        timeoutModels.push(result.model);
      } else {
        failedModels.push(result.model);
      }
    });
    
    // Print results
    console.log("\n" + "=".repeat(80));
    console.log("📊 TEST RESULTS");
    console.log("=".repeat(80));
    console.log(`⏱️  Total time: ${totalTime}ms\n`);
    
    console.log(`✅ Working Models (${successfulModels.length}):`);
    successfulModels.forEach(model => {
      const result = testResults.find(r => r.model === model);
      console.log(`   ✓ ${model} (${result?.responseTime}ms)`);
    });
    
    if (notFoundModels.length > 0) {
      console.log(`\n❌ Not Found (404) - ${notFoundModels.length}:`);
      notFoundModels.forEach(model => {
        console.log(`   ✗ ${model}`);
      });
    }
    
    if (rateLimitedModels.length > 0) {
      console.log(`\n⚠️  Rate Limited (429) - ${rateLimitedModels.length}:`);
      rateLimitedModels.forEach(model => {
        console.log(`   ⚠ ${model}`);
      });
    }
    
    if (timeoutModels.length > 0) {
      console.log(`\n⏱️  Timeout - ${timeoutModels.length}:`);
      timeoutModels.forEach(model => {
        console.log(`   ⏱ ${model}`);
      });
    }
    
    if (failedModels.length > 0) {
      console.log(`\n❌ Failed/Error - ${failedModels.length}:`);
      failedModels.forEach(model => {
        const result = testResults.find(r => r.model === model);
        const error = result?.error?.substring(0, 80) || "Unknown error";
        console.log(`   ✗ ${model}: ${error}...`);
      });
    }
    
    console.log("\n" + "=".repeat(80));
    console.log(`Total: ${modelsToTest.length} models`);
    console.log(`✅ Working: ${successfulModels.length}`);
    console.log(`❌ Failed: ${failedModels.length + notFoundModels.length + rateLimitedModels.length + timeoutModels.length}`);
    console.log("=".repeat(80));
    
    if (successfulModels.length > 0) {
      console.log("\n✨ Models ready to add to Settings:");
      successfulModels.forEach(model => {
        console.log(`   "${model}",`);
      });
    }
    
    // Exit with code 0 if we found at least some working models
    process.exit(successfulModels.length > 0 ? 0 : 1);
  } catch (error) {
    console.error("❌ Error running tests:", error);
    process.exit(1);
  }
}

main().catch(console.error);
