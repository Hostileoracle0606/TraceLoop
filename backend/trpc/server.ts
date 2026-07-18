import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './router';
import { createContext } from './context';
import { getPort, getNodeEnv } from '../config';

// Create the HTTP server
const server = createHTTPServer({
  router: appRouter,
  createContext: async ({ req }) => {
    return createContext({
      req: {
        headers: req.headers as Record<string, string | string[] | undefined>,
      },
    });
  },
});

const port = getPort();
const env = getNodeEnv();

server.listen(port);

console.log(`✅ TraceLoop API server running on http://localhost:${port}`);
console.log(`   Environment: ${env}`);
console.log(`   tRPC endpoint: http://localhost:${port}/trpc`);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
