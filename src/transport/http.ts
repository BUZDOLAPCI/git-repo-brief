import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'http';
import { getConfig } from '../config.js';
import { repoOverview, extractKeyFiles, releaseNotes, activitySnapshot } from '../tools/index.js';
import {
  RepoOverviewInputSchema,
  ExtractKeyFilesInputSchema,
  ReleaseNotesInputSchema,
  ActivitySnapshotInputSchema,
  createErrorResponse,
} from '../types.js';

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data, null, 2));
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = url.pathname;

  // Health check
  if (path === '/health' && req.method === 'GET') {
    sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
    return;
  }

  // List tools
  if (path === '/tools' && req.method === 'GET') {
    sendJson(res, 200, {
      tools: [
        { name: 'repo_overview', description: 'Get repository overview' },
        { name: 'extract_key_files', description: 'Fetch key files from repository' },
        { name: 'release_notes', description: 'Get recent release notes' },
        { name: 'activity_snapshot', description: 'Get activity snapshot' },
      ],
    });
    return;
  }

  // Tool endpoints
  if (req.method !== 'POST') {
    sendJson(res, 405, createErrorResponse('INVALID_INPUT', 'Method not allowed'));
    return;
  }

  try {
    const body = await parseBody(req);

    switch (path) {
      case '/tools/repo_overview': {
        const parsed = RepoOverviewInputSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(
            res,
            400,
            createErrorResponse('INVALID_INPUT', 'Invalid input', {
              errors: parsed.error.errors,
            })
          );
          return;
        }
        const result = await repoOverview(parsed.data.repo_url);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      case '/tools/extract_key_files': {
        const parsed = ExtractKeyFilesInputSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(
            res,
            400,
            createErrorResponse('INVALID_INPUT', 'Invalid input', {
              errors: parsed.error.errors,
            })
          );
          return;
        }
        const result = await extractKeyFiles(parsed.data.repo_url, parsed.data.paths);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      case '/tools/release_notes': {
        const parsed = ReleaseNotesInputSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(
            res,
            400,
            createErrorResponse('INVALID_INPUT', 'Invalid input', {
              errors: parsed.error.errors,
            })
          );
          return;
        }
        const result = await releaseNotes(parsed.data.repo_url, parsed.data.limit);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      case '/tools/activity_snapshot': {
        const parsed = ActivitySnapshotInputSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(
            res,
            400,
            createErrorResponse('INVALID_INPUT', 'Invalid input', {
              errors: parsed.error.errors,
            })
          );
          return;
        }
        const result = await activitySnapshot(parsed.data.repo_url);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      default:
        sendJson(res, 404, createErrorResponse('INVALID_INPUT', `Unknown endpoint: ${path}`));
    }
  } catch (error) {
    sendJson(
      res,
      500,
      createErrorResponse(
        'INTERNAL_ERROR',
        error instanceof Error ? error.message : 'Unknown error'
      )
    );
  }
}

export async function runHttpTransport(): Promise<void> {
  const config = getConfig();
  const server = createHttpServer(handleRequest);

  server.listen(config.httpPort, () => {
    console.log(`HTTP server listening on port ${config.httpPort}`);
    console.log(`Health check: http://localhost:${config.httpPort}/health`);
    console.log(`Tools list: http://localhost:${config.httpPort}/tools`);
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.close(() => {
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
