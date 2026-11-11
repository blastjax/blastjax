import { isServer, QueryClient } from "@tanstack/react-query";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000, // fresh enough: every write refetches what it may have changed (api.ts)
        refetchOnWindowFocus: false, // a page someone is editing shouldn't change under them
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

// One client per browser tab. A server render gets a new one each time, so no data is shared between requests.
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  return (browserQueryClient ??= makeQueryClient());
}
