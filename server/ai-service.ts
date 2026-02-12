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
 * Validate AI response content to detect faulty responses
 * Returns null if the response appears to be an error or invalid
 */
function validateAIResponse(content: string | null | undefined, provider: string): string | null {
  if (!content) {
    console.error(`${provider} API returned empty content`);
    return null;
  }

  // Validate AI response - check for common error patterns
  const trimmedContent = content.trim();
  
  // Check if response is too short (likely an error or incomplete)
  if (trimmedContent.length < 10) {
    console.error(`${provider} API returned suspiciously short response (${trimmedContent.length} chars): "${trimmedContent}"`);
    return null;
  }
  
  // Check for error messages in the response content itself
  const errorPatterns = [
    /error/i,
    /failed/i,
    /invalid/i,
    /unauthorized/i,
    /rate limit/i,
    /quota exceeded/i,
    /service unavailable/i,
    /503/i,
    /429/i,
    /401/i,
    /cannot/i,
    /unable to/i,
  ];
  
  // If the response is very short and contains error keywords, it's likely an error message
  if (trimmedContent.length < 200) {
    const hasErrorPattern = errorPatterns.some(pattern => pattern.test(trimmedContent));
    if (hasErrorPattern && (
      trimmedContent.toLowerCase().includes("api") ||
      trimmedContent.toLowerCase().includes("request") ||
      trimmedContent.toLowerCase().includes("service")
    )) {
      console.error(`${provider} API response appears to be an error message: "${trimmedContent}"`);
      return null;
    }
  }
  
  // Check for malformed JSON if we expect JSON (for structured responses)
  // This is a basic check - more sophisticated validation can be added per use case
  if (trimmedContent.startsWith("{") || trimmedContent.startsWith("[")) {
    try {
      JSON.parse(trimmedContent);
    } catch (jsonError) {
      // If it starts with { or [ but isn't valid JSON, it might be malformed
      // However, we'll still return it as some AI responses might have partial JSON
      // This is just a warning, not a rejection
      console.warn(`${provider} API response appears to have malformed JSON structure`);
    }
  }

  return content;
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
        const errorMessage = error?.message || String(error);
        const errorStatus = error?.status || error?.response?.status;
        
        // Determine error type
        const isUnauthorized = errorMessage.includes("unauthorized") || 
                              errorMessage.includes("invalid") || 
                              errorMessage.includes("401") || 
                              errorStatus === 401;
        const isServiceUnavailable = errorMessage.includes("503") || 
                                     errorMessage.includes("overloaded") || 
                                     errorMessage.includes("Service Unavailable") ||
                                     errorStatus === 503;
        const isRateLimit = errorMessage.includes("rate limit") || 
                           errorMessage.includes("quota") || 
                           errorMessage.includes("429") ||
                           errorStatus === 429;
        
        // Log all errors to activity log
        try {
          const { activityLogger } = await import("./logger");
          const nextProvider = i < providers.length - 1 ? providers[i + 1] : null;
          
          let errorType = "api_error";
          let logMessage = "Perplexity API error";
          
          if (isUnauthorized) {
            errorType = "401_unauthorized";
            logMessage = "Perplexity API key is invalid or unauthorized";
          } else if (isServiceUnavailable) {
            errorType = "503_service_unavailable";
            logMessage = "Perplexity API is overloaded or unavailable";
          } else if (isRateLimit) {
            errorType = "429_rate_limit";
            logMessage = "Perplexity API rate limit exceeded";
          }
          
          if (nextProvider) {
            logMessage += `. Switching to ${nextProvider}...`;
          }
          
          await activityLogger.error(
            logMessage,
            { 
              provider: "perplexity", 
              error: errorType, 
              errorMessage: errorMessage,
              nextProvider: nextProvider || null
            },
            userId
          );
        } catch (logError) {
          console.error("Failed to log Perplexity error:", logError);
        }
        
        // If this is the last provider, return null (don't re-throw, let fallback continue)
        if (i === providers.length - 1) {
          console.log("Perplexity failed and it's the last provider in chain");
          return null;
        }
        console.log("Perplexity failed, trying next provider in chain...");
      }
    } else if (provider === "gemini") {
      try {
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
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        const errorStatus = error?.status || error?.response?.status;
        
        // Determine error type
        const isUnauthorized = errorMessage.includes("unauthorized") || 
                              errorMessage.includes("invalid") || 
                              errorMessage.includes("401") || 
                              errorStatus === 401;
        const isServiceUnavailable = errorMessage.includes("503") || 
                                     errorMessage.includes("overloaded") || 
                                     errorMessage.includes("Service Unavailable") ||
                                     errorStatus === 503;
        const isRateLimit = errorMessage.includes("rate limit") || 
                           errorMessage.includes("quota") || 
                           errorMessage.includes("429") ||
                           errorStatus === 429;
        
        // Log all errors to activity log
        try {
          const { activityLogger } = await import("./logger");
          const nextProvider = i < providers.length - 1 ? providers[i + 1] : null;
          
          let errorType = "api_error";
          let logMessage = "Gemini API error";
          
          if (isUnauthorized) {
            errorType = "401_unauthorized";
            logMessage = "Gemini API key is invalid or unauthorized";
          } else if (isServiceUnavailable) {
            errorType = "503_service_unavailable";
            logMessage = "Gemini API is overloaded or unavailable";
          } else if (isRateLimit) {
            errorType = "429_rate_limit";
            logMessage = "Gemini API rate limit exceeded";
          }
          
          if (nextProvider) {
            logMessage += `. Switching to ${nextProvider}...`;
          }
          
          await activityLogger.error(
            logMessage,
            { 
              provider: "gemini", 
              error: errorType, 
              errorMessage: errorMessage,
              nextProvider: nextProvider || null
            },
            userId
          );
        } catch (logError) {
          console.error("Failed to log Gemini error:", logError);
        }
        
        // If this is the last provider, return null (don't re-throw, let fallback continue)
        if (i === providers.length - 1) {
          console.log("Gemini failed and it's the last provider in chain");
          return null;
        }
        console.log("Gemini failed, trying next provider in chain...");
      }
    } else if (provider === "openrouter") {
      try {
        const modelSetting = await storage.getSetting("openrouter_model", userId);
        const selectedModel = modelSetting?.value || "mistralai/mistral-small-3.1-24b-instruct:free";
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
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        const errorStatus = error?.status || error?.response?.status;
        
        // Determine error type
        const isUnauthorized = errorMessage.includes("unauthorized") || 
                              errorMessage.includes("invalid") || 
                              errorMessage.includes("401") || 
                              errorStatus === 401;
        const isServiceUnavailable = errorMessage.includes("503") || 
                                     errorMessage.includes("overloaded") || 
                                     errorMessage.includes("Service Unavailable") ||
                                     errorStatus === 503;
        const isRateLimit = errorMessage.includes("rate limit") || 
                           errorMessage.includes("quota") || 
                           errorMessage.includes("429") ||
                           errorStatus === 429;
        
        // Log all errors to activity log
        try {
          const { activityLogger } = await import("./logger");
          const nextProvider = i < providers.length - 1 ? providers[i + 1] : null;
          
          let errorType = "api_error";
          let logMessage = "OpenRouter API error";
          
          if (isUnauthorized) {
            errorType = "401_unauthorized";
            logMessage = "OpenRouter API key is invalid or unauthorized";
          } else if (isServiceUnavailable) {
            errorType = "503_service_unavailable";
            logMessage = "OpenRouter API is overloaded or unavailable";
          } else if (isRateLimit) {
            errorType = "429_rate_limit";
            logMessage = "OpenRouter API rate limit exceeded";
          }
          
          if (nextProvider) {
            logMessage += `. Switching to ${nextProvider}...`;
          }
          
          await activityLogger.error(
            logMessage,
            { 
              provider: "openrouter", 
              error: errorType, 
              errorMessage: errorMessage,
              nextProvider: nextProvider || null
            },
            userId
          );
        } catch (logError) {
          console.error("Failed to log OpenRouter error:", logError);
        }
        
        // If this is the last provider, return null
        if (i === providers.length - 1) {
          console.log("OpenRouter failed and it's the last provider in chain");
          return null;
        }
        console.log("OpenRouter failed, trying next provider in chain...");
      }
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

    // Validate AI response
    const validatedContent = validateAIResponse(content, "Perplexity");
    if (!validatedContent) {
      return null;
    }

    return validatedContent;
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
      // Log to activity log
      try {
        const { activityLogger } = await import("./logger");
        await activityLogger.error(
          "Perplexity API key is invalid or unauthorized",
          { provider: "perplexity", error: "401_unauthorized", userId },
          userId
        );
      } catch (logError) {
        console.error("Failed to log Perplexity authorization error:", logError);
      }
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
 * List of verified working OpenRouter free models (tested Feb 2026)
 * Order: fastest/reliable first for fallback chain
 */
const AVAILABLE_OPENROUTER_MODELS = [
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "arcee-ai/trinity-large-preview:free", // NEW: 400B MoE, 128K context, creative/agentic
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-4b-it:free",
  "google/gemma-3n-e2b-it:free",
];

/**
 * Known broken/unavailable models (404, rate-limited, or invalid)
 */
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

/**
 * Try calling OpenRouter API with automatic model fallback
 * If the selected model fails, tries all other available models before giving up
 */
async function tryOpenRouter(
  messages: AIChatMessage[],
  model: string = "mistralai/mistral-small-3.1-24b-instruct:free", // Default to verified working model
  userId: string
): Promise<string | null> {
  // Get user's preferred OpenRouter model or use default (declare outside try for error handling)
  const modelSetting = await storage.getSetting("openrouter_model", userId);
  let selectedModel = modelSetting?.value || "mistralai/mistral-small-3.1-24b-instruct:free"; // Default to verified working model
  
  // Filter out broken models and get list of models to try
  const availableModels = AVAILABLE_OPENROUTER_MODELS.filter(m => !BROKEN_MODELS.includes(m));
  
  // If selected model is broken, switch to first available
  if (BROKEN_MODELS.includes(selectedModel) || !availableModels.includes(selectedModel)) {
    console.warn(`⚠️ Selected model ${selectedModel} is broken or unavailable. Auto-switching to ${availableModels[0]}`);
    selectedModel = availableModels[0];
    // Update user's setting to the working model
    try {
      await storage.setSetting("openrouter_model", selectedModel, userId);
      console.log(`✅ Auto-updated user's OpenRouter model setting to ${selectedModel}`);
    } catch (updateError) {
      console.error("Failed to auto-update user's model setting:", updateError);
    }
  }
  
  // Create list of models to try: start with selected, then try all others
  const modelsToTry = [
    selectedModel,
    ...availableModels.filter(m => m !== selectedModel)
  ];
  
  // Get API key outside try block so it's accessible in catch block for fallback
  const apiKeySetting = await storage.getSetting("openrouter_api_key", userId);
  const apiKey = apiKeySetting?.value || null;
  
  if (!apiKey) {
    console.log("OpenRouter API key not configured");
    return null;
  }
  
  // Check usage BEFORE making any API calls
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

  const openrouter = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: apiKey,
    defaultHeaders: {
      "HTTP-Referer": "https://neskiapply.com",
      "X-Title": "NeskiApply",
    },
  });

  // Try each model in sequence
  const errors: Array<{ model: string; error: string }> = [];
  
  for (let i = 0; i < modelsToTry.length; i++) {
    const modelToTry = modelsToTry[i];
    const isFirstAttempt = i === 0;
    const isLastAttempt = i === modelsToTry.length - 1;
    
    try {
      if (!isFirstAttempt) {
        console.log(`🔄 OpenRouter: Switching to model ${i + 1}/${modelsToTry.length}: ${modelToTry}`);
        // Log model switch to activity log
        try {
          const { activityLogger } = await import("./logger");
          await activityLogger.info(
            `OpenRouter: Trying alternative model ${modelToTry} (attempt ${i + 1}/${modelsToTry.length})`,
            { provider: "openrouter", model: modelToTry, attempt: i + 1, totalModels: modelsToTry.length, previousModel: modelsToTry[i - 1], userId },
            userId
          );
        } catch (logError) {
          console.error("Failed to log model switch:", logError);
        }
      } else {
        console.log(`📡 Attempting OpenRouter API call with model: ${modelToTry}`);
      }
      
      const completion = await openrouter.chat.completions.create({
        model: modelToTry,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
      });

      const content = completion.choices?.[0]?.message?.content;

      // Validate AI response
      const validatedContent = validateAIResponse(content, `OpenRouter (${modelToTry})`);
      if (!validatedContent) {
        // Invalid response - try next model
        errors.push({ model: modelToTry, error: "Invalid or empty response" });
        if (!isLastAttempt) {
          console.warn(`⚠️ Model ${modelToTry} returned invalid response. Trying next model...`);
          continue;
        }
      } else {
        // Success!
        if (!isFirstAttempt) {
          console.log(`✅ Model ${modelToTry} succeeded! Updating user setting...`);
          // Update user's setting to the working model
          try {
            await storage.setSetting("openrouter_model", modelToTry, userId);
            console.log(`✅ Auto-updated user's OpenRouter model setting to ${modelToTry}`);
          } catch (updateError) {
            console.error("Failed to update user's model setting:", updateError);
          }
        }
        return validatedContent;
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const errorStatus = error?.status || error?.response?.status;
      
      // Check error types
      const isUnauthorized = errorMessage.includes("unauthorized") || 
                            errorMessage.includes("not authorized") ||
                            errorMessage.includes("401") ||
                            errorStatus === 401;
      
      const isNotFound = errorMessage.includes("404") || 
                        errorMessage.includes("No endpoints found") ||
                        errorMessage.includes("not found") ||
                        errorStatus === 404;
      
      const isRateLimit = errorMessage.includes("rate limit") || 
                         errorMessage.includes("quota") || 
                         errorMessage.includes("credit") ||
                         errorMessage.includes("429") ||
                         errorStatus === 429;
      
      // Authorization errors should stop immediately (API key issue)
      if (isUnauthorized) {
        console.error("OpenRouter API authorization error (401): Invalid or expired API key");
        try {
          const { activityLogger } = await import("./logger");
          await activityLogger.error(
            "OpenRouter API key is invalid or unauthorized",
            { provider: "openrouter", error: "401_unauthorized", userId },
            userId
          );
        } catch (logError) {
          console.error("Failed to log OpenRouter authorization error:", logError);
        }
        throw new Error("OpenRouter API key is invalid or unauthorized. Please check your API key in Settings.");
      }
      
      // For other errors, try next model
      errors.push({ model: modelToTry, error: errorMessage });
      
      if (isLastAttempt) {
        // All models failed - log comprehensive error
        console.error(`❌ OpenRouter: All ${modelsToTry.length} models failed. OpenRouter API appears to have issues.`);
        try {
          const { activityLogger } = await import("./logger");
          await activityLogger.error(
            `OpenRouter: All ${modelsToTry.length} models failed. API may be experiencing issues.`,
            { 
              provider: "openrouter", 
              error: "all_models_failed", 
              modelsAttempted: modelsToTry,
              errors: errors,
              userId 
            },
            userId
          );
        } catch (logError) {
          console.error("Failed to log OpenRouter failure:", logError);
        }
        // Return null to allow provider chain to continue
        return null;
      } else {
        // Log the failure and continue to next model
        const errorType = isNotFound ? "404_not_found" : isRateLimit ? "429_rate_limit" : "api_error";
        console.warn(`⚠️ Model ${modelToTry} failed (${errorType}). Trying next model...`);
      }
    }
  }
  
  // Should never reach here, but just in case
  return null;
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

    // Validate AI response
    const validatedContent = validateAIResponse(content, "Gemini");
    if (!validatedContent) {
      return null;
    }

    return validatedContent;
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const errorStatus = error?.status || error?.response?.status;
    
    // Check if it's an authorization error (401)
    const isUnauthorized = errorMessage.includes("unauthorized") || 
                          errorMessage.includes("not authorized") ||
                          errorMessage.includes("API_KEY_INVALID") ||
                          errorMessage.includes("401") ||
                          errorStatus === 401;
    
    if (isUnauthorized) {
      console.error("Gemini API authorization error (401): Invalid or expired API key");
      // Log to activity log
      try {
        const { activityLogger } = await import("./logger");
        await activityLogger.error(
          "Gemini API key is invalid or unauthorized",
          { provider: "gemini", error: "401_unauthorized", userId },
          userId
        );
      } catch (logError) {
        console.error("Failed to log Gemini authorization error:", logError);
      }
      // Throw a specific error so it can be caught and handled appropriately
      throw new Error("Gemini API key is invalid or unauthorized. Please check your API key in Settings.");
    }
    
    // Log all other errors (503, rate limits, etc.) to activity log
    const isServiceUnavailable = errorMessage.includes("503") || 
                                 errorMessage.includes("overloaded") || 
                                 errorMessage.includes("Service Unavailable") ||
                                 errorStatus === 503;
    const isRateLimit = errorMessage.includes("rate limit") || 
                       errorMessage.includes("quota") || 
                       errorMessage.includes("429") ||
                       errorStatus === 429;
    
    if (isServiceUnavailable || isRateLimit) {
      try {
        const { activityLogger } = await import("./logger");
        const errorType = isServiceUnavailable ? "503_service_unavailable" : "429_rate_limit";
        const logMessage = isServiceUnavailable 
          ? "Gemini API is overloaded or unavailable"
          : "Gemini API rate limit exceeded";
        
        await activityLogger.error(
          logMessage,
          { 
            provider: "gemini", 
            error: errorType, 
            errorMessage: errorMessage
          },
          userId
        );
      } catch (logError) {
        console.error("Failed to log Gemini error:", logError);
      }
    }
    
    console.error("Gemini API error:", errorMessage);
    return null;
  }
}

