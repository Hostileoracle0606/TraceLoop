import http from 'node:http';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './router';
import { createContext } from './context';
import { getPort, getNodeEnv } from '../config';
import { inngestHandler } from '../inngest/serve';

// Create the tRPC HTTP server
const trpcServer = createHTTPServer({
  router: appRouter,
  createContext: async ({ req }) => {
    return createContext({
      req: {
        headers: req.headers as Record<string, string | string[] | undefined>,
      },
    });
  },
});

// Wrap in a combined server that routes /api/inngest to Inngest
const server = http.createServer((req, res) => {
  const url = req.url ?? '/';

  // Route Inngest requests to the Inngest handler
  if (url.startsWith('/api/inngest')) {
    return inngestHandler(req, res);
  }

  // All other requests go to tRPC — delegate to the underlying Node server
  return trpcServer.emit('request', req, res);
});

const port = getPort();
const env = getNodeEnv();

server.listen(port);

console.log(`✅ TraceLoop API server running on http://localhost:${port}`);
console.log(`   Environment: ${env}`);
console.log(`   tRPC endpoint: http://localhost:${port}/trpc`);
console.log(`   Inngest endpoint: http://localhost:${port}/api/inngest`);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
