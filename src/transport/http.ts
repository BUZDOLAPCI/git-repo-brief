import { createServer, IncomingMessage, ServerResponse } from 'http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import { getConfig } from '../config.js';
import { createServer as createMcpServer } from '../server.js';

// Session management for MCP connections
const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: ReturnType<typeof createMcpServer> }>();

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id',
    });
    res.end();
    return;
  }

  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');

  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (req.method === 'POST') {
    // For POST requests, check if we have an existing session or need to create one
    let session = sessionId ? sessions.get(sessionId) : undefined;

    if (!session) {
      // Create a new session
      const newSessionId = randomUUID();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
      });
      const server = createMcpServer();

      await server.connect(transport);

      session = { transport, server };
      sessions.set(newSessionId, session);

      // Clean up session when transport closes
      transport.onclose = () => {
        sessions.delete(newSessionId);
      };
    }

    // Handle the request with the transport
    await session.transport.handleRequest(req, res);
  } else if (req.method === 'GET') {
    // GET requests are for SSE streams (Server-Sent Events)
    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing Mcp-Session-Id header for GET request' }));
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }

    await session.transport.handleRequest(req, res);
  } else if (req.method === 'DELETE') {
    // DELETE requests close sessions
    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing Mcp-Session-Id header for DELETE request' }));
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }

    await session.transport.handleRequest(req, res);
    sessions.delete(sessionId);
  } else {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
}

function handleHealthCheck(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    sessions: sessions.size,
  }));
}

function handleNotFound(res: ServerResponse): void {
  res.writeHead(404, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify({ error: 'Not found' }));
}

export async function runHttpTransport(): Promise<void> {
  const config = getConfig();
  const port = config.httpPort;

  const httpServer = createServer();

  httpServer.on('request', async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    try {
      switch (url.pathname) {
        case '/mcp':
          await handleMcpRequest(req, res);
          break;
        case '/health':
          handleHealthCheck(res);
          break;
        default:
          handleNotFound(res);
      }
    } catch (error) {
      console.error('Error handling request:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    }
  });

  httpServer.listen(port, () => {
    console.log(`MCP HTTP server listening on port ${port}`);
    console.log(`MCP endpoint: http://localhost:${port}/mcp`);
    console.log(`Health check: http://localhost:${port}/health`);
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    // Close all sessions
    for (const [sessionId, session] of sessions) {
      session.server.close();
      sessions.delete(sessionId);
    }
    httpServer.close(() => {
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    // Close all sessions
    for (const [sessionId, session] of sessions) {
      session.server.close();
      sessions.delete(sessionId);
    }
    httpServer.close(() => {
      process.exit(0);
    });
  });
}
