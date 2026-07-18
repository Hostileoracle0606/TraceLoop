import http from 'node:http';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './router';
import { createContext } from './context';
import { getPort, getNodeEnv } from '../config';
import { inngestHandler } from '../inngest/serve';
import { healthCheck, queueHealth, metrics } from '../health';

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

// CORS headers for health endpoints (allow monitoring tools)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Helper to send JSON responses
function sendJson(res: http.ServerResponse, statusCode: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    ...corsHeaders,
  });
  res.end(body);
}

// Wrap in a combined server that routes /api/inngest to Inngest
const server = http.createServer((req, res) => {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  // Handle CORS preflight for health endpoints
  if (method === 'OPTIONS' && (url.startsWith('/api/health') || url.startsWith('/api/queue') || url.startsWith('/api/metrics'))) {
    res.writeHead(204, corsHeaders);
    return res.end();
  }

  // Health check endpoints
  if (method === 'GET' && url === '/api/health') {
    return healthCheck()
      .then((data) => sendJson(res, data.status === 'ok' ? 200 : 503, data))
      .catch(() => sendJson(res, 500, { error: 'Health check failed' }));
  }

  if (method === 'GET' && url === '/api/queue') {
    return queueHealth()
      .then((data) => sendJson(res, 200, data))
      .catch(() => sendJson(res, 500, { error: 'Queue health check failed' }));
  }

  if (method === 'GET' && url === '/api/metrics') {
    return metrics()
      .then((data) => sendJson(res, 200, data))
      .catch(() => sendJson(res, 500, { error: 'Metrics collection failed' }));
  }

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
console.log(`   Health endpoint: http://localhost:${port}/api/health`);
console.log(`   Queue endpoint: http://localhost:${port}/api/queue`);
console.log(`   Metrics endpoint: http://localhost:${port}/api/metrics`);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
