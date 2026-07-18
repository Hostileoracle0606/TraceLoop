/// <reference types="vite/client" />
import { createTRPCReact, httpBatchLink } from '@trpc/react-query';
import type { AppRouter } from '@backend/trpc/router';
import { supabase } from './supabase';

// Typed tRPC React Query hooks
export const trpc = createTRPCReact<AppRouter>();

// Create tRPC client instance (used by the provider)
export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: import.meta.env.VITE_TRPC_URL || '/trpc',
        async headers() {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
