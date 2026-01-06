import { storage } from "./storage";
import { Perplexity } from "@perplexity-ai/perplexity_ai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

export interface AIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICallResult {
  content: string;
  provider: "perplexity" | "gemini" | "openrouter";
  model?: string; // The specific model used (especially for OpenRouter)
}

/**
 * Call AI service with fallback: Try Perplexity first, fallback to Gemini if it fails
 * Respects user preference for AI provider (auto/perplexity/gemini/openrouter)
 * @param providerOverride - Optional provider to override user preference ("perplexity", "gemini", "openrouter", or "auto")
 */
export async function callAIWithFallback(
  messages: AIChatMessage[],
  model: string = "sonar-pro",
  userId: string,
  providerOverride?: "perplexity" | "gemini" | "openrouter" | "auto"
): Promise<AICallResult | null> {
  // Get user preference for AI provider, or use override if provided
  const providerPreference = providerOverride 
    ? { value: providerOverride }
    : await storage.getSetting("ai_provider_preference", userId);
  const preference = providerPreference?.value || "auto"; // auto, perplexity, gemini, or openrouter

  // If user specified a provider, use only that one
  if (preference === "perplexity") {
      const result = await tryPerplexity(messages, model, userId);
      if (result) {
        const { logAPICall } = await import("./api-usage");
        await logAPICall("Perplexity API", "perplexity", { model }, userId);
        return { content: result, provider: "perplexity", model };
      }
    console.log("Perplexity failed but it's the preferred provider, no fallback");
    return null;
  }

  if (preference === "gemini") {
    const result = await tryGemini(messages, userId);
    if (result) {
      const { logAPICall } = await import("./api-usage");
      await logAPICall("Gemini API", "gemini", { model: "gemini-2.5-flash" }, userId);
      return { content: result, provider: "gemini", model: "gemini-2.5-flash" };
    }
    console.log("Gemini failed but it's the preferred provider, no fallback");
    return null;
  }

  if (preference === "openrouter") {
    const modelSetting = await storage.getSetting("openrouter_model", userId);
    const selectedModel = modelSetting?.value || "meta-llama/llama-3.2-3b-instruct:free"; // Default to free model
    const result = await tryOpenRouter(messages, model, userId);
    if (result) {
      const { logAPICall } = await import("./api-usage");
      await logAPICall("OpenRouter API", "openrouter", { model: selectedModel }, userId);
      return { content: result, provider: "openrouter", model: selectedModel };
    }
    console.log("OpenRouter failed but it's the preferred provider, no fallback");
    return null;
  }

  // Auto mode: Try Perplexity first, then OpenRouter, then Gemini if both fail
  const perplexityResult = await tryPerplexity(messages, model, userId);
  if (perplexityResult) {
    // Log API usage
    const { logAPICall } = await import("./api-usage");
    await logAPICall("Perplexity API", "perplexity", { model }, userId);
    return { content: perplexityResult, provider: "perplexity", model };
  }

  // Fallback to OpenRouter
  console.log("Perplexity failed, trying OpenRouter...");
  const modelSetting = await storage.getSetting("openrouter_model", userId);
  const selectedModel = modelSetting?.value || "meta-llama/llama-3.2-3b-instruct:free"; // Default to free model
  const openrouterResult = await tryOpenRouter(messages, model, userId);
  if (openrouterResult) {
    const { logAPICall } = await import("./api-usage");
    await logAPICall("OpenRouter API", "openrouter", { model: selectedModel }, userId);
    return { content: openrouterResult, provider: "openrouter", model: selectedModel };
  }

  // Final fallback to Gemini
  console.log("OpenRouter failed, falling back to Gemini...");
  const geminiResult = await tryGemini(messages, userId);
  if (geminiResult) {
    // Log API usage
    const { logAPICall } = await import("./api-usage");
    await logAPICall("Gemini API", "gemini", { model: "gemini-2.5-flash" }, userId);
    return { content: geminiResult, provider: "gemini", model: "gemini-2.5-flash" };
  }

  return null;
}

/**
 * Try calling Perplexity API
 */
async function tryPerplexity(
  messages: AIChatMessage[],
  model: string = "sonar-pro",
  userId: string
): Promise<string | null> {
  try {
    const apiKeySetting = await storage.getSetting("perplexity_api_key", userId);
    
    if (!apiKeySetting || !apiKeySetting.value) {
      console.log("Perplexity API key not configured");
      return null;
    }

    const perplexity = new Perplexity({
      apiKey: apiKeySetting.value,
    });

    const completion = await perplexity.chat.completions.create({
      model: model,
      messages: messages.map(msg => ({
        role: msg.role === "system" ? "system" : msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      })),
    });

    const contentRaw = completion.choices?.[0]?.message?.content;
    
    // Handle content that might be string or array of chunks
    let content: string;
    if (typeof contentRaw === 'string') {
      content = contentRaw;
    } else if (Array.isArray(contentRaw)) {
      content = contentRaw
        .map(c => {
          if (typeof c === 'string') return c;
          if (c && typeof c === 'object' && 'text' in c) return (c as any).text || '';
          return '';
        })
        .join('');
    } else {
      content = String(contentRaw || '');
    }

    if (!content) {
      return null;
    }

    return content;
  } catch (error: any) {
    // Check if it's a rate limit or credit issue
    const errorMessage = error?.message || String(error);
    const isRateLimit = errorMessage.includes("rate limit") || 
                       errorMessage.includes("quota") || 
                       errorMessage.includes("credit") ||
                       errorMessage.includes("429") ||
                       error?.status === 429;
    
    if (isRateLimit) {
      console.log("Perplexity rate limit/quota exceeded, will try Gemini");
    } else {
      console.error("Perplexity API error:", errorMessage);
    }
    return null;
  }
}

/**
 * Try calling OpenRouter API
 */
async function tryOpenRouter(
  messages: AIChatMessage[],
  model: string = "meta-llama/llama-3.2-3b-instruct:free", // Default to free model
  userId: string
): Promise<string | null> {
  try {
    // STRICT ENFORCEMENT: Check usage BEFORE making API call
    const { getAPIUsage } = await import("./api-usage");
    const usage = await getAPIUsage(userId);
    const openrouterUsage = usage.providers.openrouter;
    
    // Block if daily limit is reached
    if (openrouterUsage.dailyCount >= openrouterUsage.dailyLimit) {
      console.error(`🚫 OpenRouter BLOCKED: Daily limit reached (${openrouterUsage.dailyCount}/${openrouterUsage.dailyLimit}). Resets at 12 AM.`);
      return null;
    }
    
    // Block if minute limit is reached
    if (openrouterUsage.minuteCount >= openrouterUsage.minuteLimit) {
      console.error(`🚫 OpenRouter BLOCKED: Rate limit reached (${openrouterUsage.minuteCount}/${openrouterUsage.minuteLimit}). Wait 1 minute.`);
      return null;
    }
    
    console.log(`✅ OpenRouter usage check passed: ${openrouterUsage.dailyCount}/${openrouterUsage.dailyLimit} daily, ${openrouterUsage.minuteCount}/${openrouterUsage.minuteLimit} per minute`);
    
    const apiKeySetting = await storage.getSetting("openrouter_api_key", userId);
    
    if (!apiKeySetting || !apiKeySetting.value) {
      console.log("OpenRouter API key not configured");
      return null;
    }

    // Get user's preferred OpenRouter model or use default
    const modelSetting = await storage.getSetting("openrouter_model", userId);
    const selectedModel = modelSetting?.value || "meta-llama/llama-3.2-3b-instruct:free"; // Default to free model

    const openrouter = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: apiKeySetting.value,
      defaultHeaders: {
        "HTTP-Referer": "https://neskiapply.com", // Replace with your actual domain
        "X-Title": "NeskiApply",
      },
    });

    const completion = await openrouter.chat.completions.create({
      model: selectedModel,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
    });

    const content = completion.choices?.[0]?.message?.content;

    if (!content) {
      return null;
    }

    return content;
  } catch (error: any) {
    // Check if it's a rate limit or credit issue
    const errorMessage = error?.message || String(error);
    const isRateLimit = errorMessage.includes("rate limit") || 
                       errorMessage.includes("quota") || 
                       errorMessage.includes("credit") ||
                       errorMessage.includes("429") ||
                       error?.status === 429;
    
    if (isRateLimit) {
      console.log("OpenRouter rate limit/quota exceeded");
    } else {
      console.error("OpenRouter API error:", errorMessage);
    }
    return null;
  }
}

/**
 * Try calling Gemini API
 */
async function tryGemini(messages: AIChatMessage[], userId: string): Promise<string | null> {
  try {
    const apiKeySetting = await storage.getSetting("gemini_api_key", userId);
    
    if (!apiKeySetting || !apiKeySetting.value) {
      console.log("Gemini API key not configured");
      return null;
    }

    const genAI = new GoogleGenerativeAI(apiKeySetting.value);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Convert messages to Gemini format
    // Gemini doesn't support system messages directly, so we'll prepend it to the first user message
    let prompt = "";
    const systemMessage = messages.find(m => m.role === "system");
    const userMessages = messages.filter(m => m.role === "user" || m.role === "assistant");
    
    if (systemMessage) {
      prompt += `System: ${systemMessage.content}\n\n`;
    }

    // Build conversation history
    for (const msg of userMessages) {
      if (msg.role === "user") {
        prompt += `User: ${msg.content}\n\n`;
      } else if (msg.role === "assistant") {
        prompt += `Assistant: ${msg.content}\n\n`;
      }
    }

    // Remove trailing newlines
    prompt = prompt.trim();

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const content = response.text();

    if (!content) {
      return null;
    }

    return content;
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || String(error));
    return null;
  }
}

