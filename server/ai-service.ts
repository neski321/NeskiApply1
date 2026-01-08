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
 * Call AI service with fallback: Try Perplexity first, then Gemini, then OpenRouter if both fail
 * Fallback order: Perplexity → Gemini → OpenRouter
 * Respects user preference for AI provider (auto/perplexity/gemini/openrouter)
 * @param providerOverride - Optional provider to override user preference ("perplexity", "gemini", "openrouter", or "auto")
 */
export async function callAIWithFallback(
  messages: AIChatMessage[],
  model: string = "sonar-pro",
  userId: string,
  providerOverride?: string
): Promise<AICallResult | null> {
  // Get user preference for AI provider, or use override if provided
  const providerPreference = providerOverride 
    ? { value: providerOverride }
    : await storage.getSetting("ai_provider_preference", userId);
  let preference = providerPreference?.value || "auto";
  
  // Handle "auto" as shorthand for all three providers
  if (preference === "auto") {
    preference = "perplexity,gemini,openrouter";
  }

  // Parse provider chain (comma-separated: "perplexity,gemini" or single: "perplexity")
  const providers = preference.split(",").map(p => p.trim()).filter(Boolean);
  
  if (providers.length === 0) {
    console.error("Invalid provider preference, defaulting to auto");
    providers.push("perplexity", "gemini", "openrouter");
  }

  // Get user's model preferences
  const perplexityModelSetting = await storage.getSetting("perplexity_model", userId);
  const perplexityModel = perplexityModelSetting?.value || "sonar-pro";
  
  const geminiModelSetting = await storage.getSetting("gemini_model", userId);
  const geminiModel = geminiModelSetting?.value || "gemini-2.5-flash";

  // Try each provider in order
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    
    if (provider === "perplexity") {
      try {
        // Use user's selected Perplexity model, or fallback to provided model parameter
        const selectedModel = model !== "sonar-pro" ? model : perplexityModel;
        const result = await tryPerplexity(messages, selectedModel, userId);
        if (result) {
          try {
            const { logAPICall } = await import("./api-usage");
            await logAPICall("Perplexity API", "perplexity", { model: selectedModel }, userId);
          } catch (logError) {
            console.error("Failed to log Perplexity API usage:", logError);
          }
          return { content: result, provider: "perplexity", model: selectedModel };
        }
        // If this is the last provider, don't continue
        if (i === providers.length - 1) {
          console.log("Perplexity failed and it's the last provider in chain");
          return null;
        }
        console.log("Perplexity failed, trying next provider in chain...");
      } catch (error: any) {
        // Re-throw authorization errors so they can be handled by the caller
        if (error?.message?.includes("unauthorized") || error?.message?.includes("invalid")) {
          throw error;
        }
        // If this is the last provider, return null
        if (i === providers.length - 1) {
          console.log("Perplexity failed and it's the last provider in chain");
          return null;
        }
        console.log("Perplexity failed, trying next provider in chain...");
      }
    } else if (provider === "gemini") {
      const result = await tryGemini(messages, geminiModel, userId);
      if (result) {
        try {
          const { logAPICall } = await import("./api-usage");
          await logAPICall("Gemini API", "gemini", { model: geminiModel }, userId);
        } catch (logError) {
          console.error("Failed to log Gemini API usage:", logError);
        }
        return { content: result, provider: "gemini", model: geminiModel };
      }
      // If this is the last provider, don't continue
      if (i === providers.length - 1) {
        console.log("Gemini failed and it's the last provider in chain");
        return null;
      }
      console.log("Gemini failed, trying next provider in chain...");
    } else if (provider === "openrouter") {
      const modelSetting = await storage.getSetting("openrouter_model", userId);
      const selectedModel = modelSetting?.value || "meta-llama/llama-3.2-3b-instruct:free";
      const result = await tryOpenRouter(messages, model, userId);
      if (result) {
        try {
          const { logAPICall } = await import("./api-usage");
          await logAPICall("OpenRouter API", "openrouter", { model: selectedModel }, userId);
        } catch (logError) {
          console.error("Failed to log OpenRouter API usage:", logError);
        }
        return { content: result, provider: "openrouter", model: selectedModel };
      }
      // If this is the last provider, don't continue
      if (i === providers.length - 1) {
        console.log("OpenRouter failed and it's the last provider in chain");
        return null;
      }
      console.log("OpenRouter failed, trying next provider in chain...");
    } else {
      console.warn(`Unknown provider in chain: "${provider}", skipping...`);
    }
  }

  // If we get here, all providers in the chain failed
  console.log(`All providers in chain failed: ${providers.join(" → ")}`);
  return null;
}

/**
 * Try calling Perplexity API
 */
async function tryPerplexity(
  messages: AIChatMessage[],
  model: string,
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
    // Check if it's an authorization error (401)
    const errorMessage = error?.message || String(error);
    const isUnauthorized = errorMessage.includes("unauthorized") || 
                          errorMessage.includes("not authorized") ||
                          errorMessage.includes("401") ||
                          error?.status === 401 ||
                          error?.response?.status === 401;
    
    // Check if it's a rate limit or credit issue
    const isRateLimit = errorMessage.includes("rate limit") || 
                       errorMessage.includes("quota") || 
                       errorMessage.includes("credit") ||
                       errorMessage.includes("429") ||
                       error?.status === 429;
    
    if (isUnauthorized) {
      console.error("Perplexity API authorization error (401): Invalid or expired API key");
      // Throw a specific error so it can be caught and handled appropriately
      throw new Error("Perplexity API key is invalid or unauthorized. Please check your API key in Settings.");
    } else if (isRateLimit) {
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
async function tryGemini(messages: AIChatMessage[], model: string, userId: string): Promise<string | null> {
  try {
    const apiKeySetting = await storage.getSetting("gemini_api_key", userId);
    
    if (!apiKeySetting || !apiKeySetting.value) {
      console.log("Gemini API key not configured");
      return null;
    }

    const genAI = new GoogleGenerativeAI(apiKeySetting.value);
    const geminiModelInstance = genAI.getGenerativeModel({ model: model });

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

    const result = await geminiModelInstance.generateContent(prompt);
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

