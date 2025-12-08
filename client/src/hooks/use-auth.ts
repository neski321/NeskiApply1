import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthStatus, login, register, logout, type AuthResponse } from "@/lib/api";
import type { User } from "@shared/schema";

export function useAuth() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check auth status
  const { data: authData, refetch: refetchAuth } = useQuery<AuthResponse>({
    queryKey: ["auth"],
    queryFn: async () => {
      console.log("[useAuth] Fetching auth status...");
      const result = await getAuthStatus();
      console.log("[useAuth] Auth status result:", result);
      return result;
    },
    retry: false,
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnMount: true, // Always refetch on mount
  });

  // Update user state when auth data changes
  useEffect(() => {
    if (authData) {
      setUser(authData.user);
      setIsLoading(false);
    }
  }, [authData]);

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      login(username, password),
    onSuccess: (data) => {
      // Update user state immediately
      setUser(data.user);
      // Update query cache immediately
      queryClient.setQueryData(["auth"], { authenticated: true, user: data.user });
      // Refetch auth status to ensure consistency (important for Railway with network latency)
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      // Update loading state immediately
      setIsLoading(false);
    },
  });

  // Register mutation
  const registerMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      register(username, password),
    onSuccess: (data) => {
      setUser(data.user);
      queryClient.setQueryData(["auth"], { authenticated: true, user: data.user });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      // Return redirectToSettings flag for component to handle
      return data;
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      setUser(null);
      queryClient.setQueryData(["auth"], { authenticated: false, user: null });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      queryClient.clear(); // Clear all cached data
    },
  });

  return {
    user,
    isAuthenticated: !!user,
    isLoading: isLoading || !authData,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
    loginError: loginMutation.error,
    registerError: registerMutation.error,
  };
}

