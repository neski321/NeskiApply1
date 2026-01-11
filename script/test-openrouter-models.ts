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

// List of free models to test
const modelsToTest = [
  // Google models
  "google/gemini-2.0-flash-exp:free",
  "google/gemini-2.5-flash-preview:free",
  "google/gemma-3-27b-it:free",
  "google/gemma-3-4b-it:free",
  "google/gemma-3n-e2b-it:free",
  
  // Mistral models
  "mistralai/mistral-nemo:free",
  "mistralai/mistral-7b-instruct:free",
  "mistralai/devstral-2512:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  
  // Xiaomi models
  "xiaomi/mimo-v2-flash:free",
  
  // Meta Llama models
  "meta-llama/llama-3.3-70b-instruct:free",
  "meta-llama/llama-3.1-405b-instruct:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  
  // DeepSeek/TNG models
  "tngtech/deepseek-r1t2-chimera:free",
  "tngtech/deepseek-r1t-chimera:free",
  "tngtech/tng-r1t-chimera:free",
  "deepseek/deepseek-r1-0528:free",
  
  // Qwen models
  "qwen/qwen3-coder:free",
  "qwen/qwen-2.5-vl-7b-instruct:free",
  "qwen/qwen3-4b:free",
  
  // NVIDIA models
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "nvidia/nemotron-nano-9b-v2:free",
  
  // Z.AI models
  "z-ai/glm-4.5-air:free",
  
  // OpenAI models
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
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
