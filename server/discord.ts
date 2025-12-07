import { storage } from "./storage";

export interface DiscordWebhookPayload {
  content?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{
      name: string;
      value: string;
      inline?: boolean;
    }>;
    timestamp?: string;
    url?: string;
  }>;
}

/**
 * Send a Discord webhook notification
 */
export async function sendDiscordNotification(payload: DiscordWebhookPayload): Promise<boolean> {
  try {
    // Check if Discord notifications are enabled
    const notificationsEnabled = await storage.getSetting("discord_notifications");
    if (!notificationsEnabled || notificationsEnabled.value !== "true") {
      console.log("Discord notifications are disabled");
      return false;
    }

    // Get webhook URL
    const webhookSetting = await storage.getSetting("discord_webhook");
    if (!webhookSetting || !webhookSetting.value) {
      console.log("Discord webhook URL not configured");
      return false;
    }

    const webhookUrl = webhookSetting.value;

    // Validate webhook URL format
    if (!webhookUrl.startsWith("https://discord.com/api/webhooks/") && 
        !webhookUrl.startsWith("https://discordapp.com/api/webhooks/")) {
      console.error("Invalid Discord webhook URL format. Must start with https://discord.com/api/webhooks/");
      throw new Error("Invalid Discord webhook URL format. Please check your webhook URL.");
    }

    console.log(`[Discord] Sending webhook to: ${webhookUrl.substring(0, 50)}...`);
    console.log(`[Discord] Payload:`, JSON.stringify(payload, null, 2));

    // Send the webhook
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log(`[Discord] Response status: ${response.status} ${response.statusText}`);
    
    // Read response body for debugging
    let responseBody = "";
    try {
      responseBody = await response.text();
      if (responseBody) {
        console.log(`[Discord] Response body: ${responseBody.substring(0, 200)}`);
      }
    } catch (e) {
      console.log(`[Discord] Could not read response body`);
    }

    if (!response.ok) {
      // If response is HTML (error page), provide a better error message
      if (responseBody.trim().startsWith("<!DOCTYPE") || responseBody.trim().startsWith("<html")) {
        if (response.status === 404) {
          throw new Error("Discord webhook URL not found (404). Please verify your webhook URL is correct.");
        } else if (response.status === 401) {
          throw new Error("Discord webhook unauthorized (401). Your webhook URL may be invalid or expired.");
        } else {
          throw new Error(`Discord webhook returned an error page (${response.status}). Please check your webhook URL.`);
        }
      }
      
      console.error(`[Discord] Webhook failed: ${response.status} ${response.statusText}`, responseBody.substring(0, 200));
      throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}. ${responseBody.substring(0, 100)}`);
    }

    // Discord webhooks return 204 No Content on success, or sometimes 200 OK
    if (response.status === 204 || response.status === 200) {
      console.log("[Discord] ✅ Notification sent successfully to Discord! Check your Discord channel.");
      return true;
    } else {
      console.error(`[Discord] ⚠️ Unexpected status code: ${response.status}`);
      console.error(`[Discord] Response body: ${responseBody}`);
      return false;
    }
  } catch (error) {
    console.error("Error sending Discord notification:", error);
    return false;
  }
}

/**
 * Send a notification for a high-match job
 * Notifies when match score is >= notification threshold (default: 70%)
 */
export async function notifyHighMatchJob(
  jobTitle: string,
  company: string,
  location: string,
  matchScore: number,
  jobUrl?: string,
  resumeName?: string
): Promise<boolean> {
  // Get notification threshold from settings (default: 70%)
  const thresholdSetting = await storage.getSetting("discord_notification_threshold");
  const notificationThreshold = thresholdSetting ? parseInt(thresholdSetting.value, 10) : 70;

  // Only notify if match score is above threshold
  if (matchScore < notificationThreshold) {
    return false;
  }

  // Determine color based on match score
  let color = 0xffd700; // Gold for 70-79
  if (matchScore >= 95) {
    color = 0x00ff00; // Bright green for 95+
  } else if (matchScore >= 90) {
    color = 0x90ee90; // Light green for 90-94
  } else if (matchScore >= 85) {
    color = 0x9aff9a; // Medium green for 85-89
  } else if (matchScore >= 80) {
    color = 0xffff00; // Yellow for 80-84
  } else if (matchScore >= 70) {
    color = 0xffd700; // Gold for 70-79
  }

  const payload: DiscordWebhookPayload = {
    content: `🎯 New job match (${matchScore}%) - Click to apply!`,
    embeds: [
      {
        title: "🎯 High Match Job Found!",
        description: `**${jobTitle}** at **${company}**\n\nClick the link below to apply manually.`,
        color: color,
        fields: [
          {
            name: "Match Score",
            value: `${matchScore}%`,
            inline: true,
          },
          {
            name: "Location",
            value: location || "Not specified",
            inline: true,
          },
          ...(resumeName
            ? [
                {
                  name: "Matched Resume",
                  value: resumeName,
                  inline: true,
                },
              ]
            : []),
        ],
        timestamp: new Date().toISOString(),
        ...(jobUrl ? { url: jobUrl } : {}),
      },
    ],
  };

  return await sendDiscordNotification(payload);
}

/**
 * Send a test notification
 */
export async function sendTestNotification(): Promise<boolean> {
  const payload: DiscordWebhookPayload = {
    content: "🧪 Test notification from NeskiApply", // Discord may require content field
    embeds: [
      {
        title: "✅ Discord Webhook Test",
        description: "Your Discord webhook is working correctly!",
        color: 0x00ff00,
        fields: [
          {
            name: "Status",
            value: "Connected",
            inline: true,
          },
          {
            name: "Time",
            value: new Date().toLocaleString(),
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  return await sendDiscordNotification(payload);
}

