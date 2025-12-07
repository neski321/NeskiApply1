import { storage } from "./storage";
import { Perplexity } from "@perplexity-ai/perplexity_ai";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface AIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICallResult {
  content: string;
  provider: "perplexity" | "gemini";
}

/**
 * Call AI service with fallback: Try Perplexity first, fallback to Gemini if it fails
 * Respects user preference for AI provider (auto/perplexity/gemini)
 */
export async function callAIWithFallback(
  messages: AIChatMessage[],
  model: string = "sonar-pro"
): Promise<AICallResult | null> {
  // Get user preference for AI provider
  const providerPreference = await storage.getSetting("ai_provider_preference");
  const preference = providerPreference?.value || "auto"; // auto, perplexity, or gemini

  // If user specified a provider, use only that one
  if (preference === "perplexity") {
    const result = await tryPerplexity(messages, model);
    if (result) {
      const { logAPICall } = await import("./api-usage");
      await logAPICall("Perplexity API", { provider: "perplexity", model });
      return { content: result, provider: "perplexity" };
    }
    console.log("Perplexity failed but it's the preferred provider, no fallback");
    return null;
  }

  if (preference === "gemini") {
    const result = await tryGemini(messages);
    if (result) {
      const { logAPICall } = await import("./api-usage");
      await logAPICall("Gemini API", { provider: "gemini", model: "gemini-2.5-flash" });
      return { content: result, provider: "gemini" };
    }
    console.log("Gemini failed but it's the preferred provider, no fallback");
    return null;
  }

  // Auto mode: Try Perplexity first, fallback to Gemini if it fails
  const perplexityResult = await tryPerplexity(messages, model);
  if (perplexityResult) {
    // Log API usage
    const { logAPICall } = await import("./api-usage");
    await logAPICall("Perplexity API", { provider: "perplexity", model });
    return { content: perplexityResult, provider: "perplexity" };
  }

  // Fallback to Gemini
  console.log("Perplexity failed, falling back to Gemini...");
  const geminiResult = await tryGemini(messages);
  if (geminiResult) {
    // Log API usage
    const { logAPICall } = await import("./api-usage");
    await logAPICall("Gemini API", { provider: "gemini", model: "gemini-2.5-flash" });
    return { content: geminiResult, provider: "gemini" };
  }

  return null;
}

/**
 * Try calling Perplexity API
 */
async function tryPerplexity(
  messages: AIChatMessage[],
  model: string = "sonar-pro"
): Promise<string | null> {
  try {
    const apiKeySetting = await storage.getSetting("perplexity_api_key");
    
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
 * Try calling Gemini API
 */
async function tryGemini(messages: AIChatMessage[]): Promise<string | null> {
  try {
    const apiKeySetting = await storage.getSetting("gemini_api_key");
    
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

