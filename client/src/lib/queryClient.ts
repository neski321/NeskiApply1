import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    
    // Check for rate limit (429 status code)
    if (res.status === 429) {
      let errorMessage = "You've made too many requests. Please wait a few minutes before trying again.";
      let retryAfter: number | undefined;
      let limit: number | undefined;
      let window: string | undefined;
      
      // Try to parse JSON error response for better error messages
      try {
        const errorData = JSON.parse(text);
        if (errorData.error === "rate_limit_exceeded") {
          errorMessage = errorData.message || errorMessage;
          retryAfter = errorData.retryAfter;
          limit = errorData.limit;
          window = errorData.window;
        }
      } catch (parseError) {
        // If parsing fails, use default message
      }
      
      const error = new Error(errorMessage);
      (error as any).isRateLimit = true;
      (error as any).retryAfter = retryAfter;
      (error as any).limit = limit;
      (error as any).window = window;
      (error as any).status = res.status;
      (error as any).statusText = res.statusText;
      throw error;
    }
    
    // Try to parse JSON error response for other errors
    let errorMessage = text;
    try {
      const errorData = JSON.parse(text);
      if (errorData.error || errorData.message) {
        errorMessage = errorData.error || errorData.message || text;
      }
    } catch (parseError) {
      // If parsing fails, use the original text
    }
    
    // Create error with status code
    const error = new Error(errorMessage);
    (error as any).status = res.status;
    (error as any).statusText = res.statusText;
    throw error;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
