import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { getConfig } from '../config.js';
import {
  RepoOverviewInputSchema,
  ExtractKeyFilesInputSchema,
  ReleaseNotesInputSchema,
  ActivitySnapshotInputSchema,
} from '../types.js';
import { repoOverview, extractKeyFiles, releaseNotes, activitySnapshot } from '../tools/index.js';

/**
 * JSON-RPC request interface
 */
interface JsonRpcRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC response interface
 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Tool definitions for MCP tools/list
 */
const toolDefinitions = [
  {
    name: 'repo_overview',
    description:
      'Get a comprehensive overview of a public GitHub repository including name, description, stars, forks, language, topics, license, and timestamps.',
    inputSchema: {
      type: 'object',
      properties: {
        repo_url: {
          type: 'string',
          description:
            'The GitHub repository URL (e.g., https://github.com/owner/repo)',
        },
      },
      required: ['repo_url'],
    },
  },
  {
    name: 'extract_key_files',
    description:
      'Fetch the contents of key files from a GitHub repository such as README.md, LICENSE, package.json, and pyproject.toml.',
    inputSchema: {
      type: 'object',
      properties: {
        repo_url: {
          type: 'string',
          description:
            'The GitHub repository URL (e.g., https://github.com/owner/repo)',
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional array of file paths to fetch. Defaults to: README.md, LICENSE, package.json, pyproject.toml',
        },
      },
      required: ['repo_url'],
    },
  },
  {
    name: 'release_notes',
    description:
      'Get recent release notes from a GitHub repository including tag names, release names, body content, and publication dates.',
    inputSchema: {
      type: 'object',
      properties: {
        repo_url: {
          type: 'string',
          description:
            'The GitHub repository URL (e.g., https://github.com/owner/repo)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of releases to fetch (1-100, default: 5)',
        },
      },
      required: ['repo_url'],
    },
  },
  {
    name: 'activity_snapshot',
    description:
      'Get a snapshot of recent activity for a GitHub repository including last commit date, open issues count, open PRs count, and contributors count.',
    inputSchema: {
      type: 'object',
      properties: {
        repo_url: {
          type: 'string',
          description:
            'The GitHub repository URL (e.g., https://github.com/owner/repo)',
        },
      },
      required: ['repo_url'],
    },
  },
];

/**
 * Handle a single JSON-RPC request
 */
async function handleJsonRpcRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'git-repo-brief',
              version: '1.0.0',
            },
          },
        };
      }

      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: toolDefinitions,
          },
        };
      }

      case 'tools/call': {
        const toolName = params?.name as string;
        const args = params?.arguments as Record<string, unknown>;

        let result: unknown;

        switch (toolName) {
          case 'repo_overview': {
            const parsed = RepoOverviewInputSchema.safeParse(args);
            if (!parsed.success) {
              result = {
                ok: false,
                error: {
                  code: 'INVALID_INPUT',
                  message: 'Invalid input parameters',
                  details: { errors: parsed.error.errors },
                },
                meta: { retrieved_at: new Date().toISOString() },
              };
            } else {
              result = await repoOverview(parsed.data.repo_url);
            }
            break;
          }

          case 'extract_key_files': {
            const parsed = ExtractKeyFilesInputSchema.safeParse(args);
            if (!parsed.success) {
              result = {
                ok: false,
                error: {
                  code: 'INVALID_INPUT',
                  message: 'Invalid input parameters',
                  details: { errors: parsed.error.errors },
                },
                meta: { retrieved_at: new Date().toISOString() },
              };
            } else {
              result = await extractKeyFiles(parsed.data.repo_url, parsed.data.paths);
            }
            break;
          }

          case 'release_notes': {
            const parsed = ReleaseNotesInputSchema.safeParse(args);
            if (!parsed.success) {
              result = {
                ok: false,
                error: {
                  code: 'INVALID_INPUT',
                  message: 'Invalid input parameters',
                  details: { errors: parsed.error.errors },
                },
                meta: { retrieved_at: new Date().toISOString() },
              };
            } else {
              result = await releaseNotes(parsed.data.repo_url, parsed.data.limit);
            }
            break;
          }

          case 'activity_snapshot': {
            const parsed = ActivitySnapshotInputSchema.safeParse(args);
            if (!parsed.success) {
              result = {
                ok: false,
                error: {
                  code: 'INVALID_INPUT',
                  message: 'Invalid input parameters',
                  details: { errors: parsed.error.errors },
                },
                meta: { retrieved_at: new Date().toISOString() },
              };
            } else {
              result = await activitySnapshot(parsed.data.repo_url);
            }
            break;
          }

          default:
            return {
              jsonrpc: '2.0',
              id,
              error: {
                code: -32601,
                message: `Unknown tool: ${toolName}`,
              },
            };
        }

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: `Internal error: ${message}`,
      },
    };
  }
}

/**
 * Read the request body as a string
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/**
 * Send a JSON response
 */
function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Handle health check endpoint
 */
function handleHealthCheck(res: ServerResponse): void {
  sendJson(res, 200, { status: 'ok', service: 'git-repo-brief' });
}

/**
 * Handle not found
 */
function handleNotFound(res: ServerResponse): void {
  sendJson(res, 404, { error: 'Not found' });
}

/**
 * Handle method not allowed
 */
function handleMethodNotAllowed(res: ServerResponse): void {
  sendJson(res, 405, { error: 'Method not allowed' });
}

/**
 * Handle MCP JSON-RPC endpoint
 */
async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readBody(req);
    const request: JsonRpcRequest = JSON.parse(body);

    if (!request.jsonrpc || request.jsonrpc !== '2.0') {
      sendJson(res, 400, {
        jsonrpc: '2.0',
        id: request.id || 0,
        error: {
          code: -32600,
          message: 'Invalid Request: missing or invalid jsonrpc version',
        },
      });
      return;
    }

    const response = await handleJsonRpcRequest(request);
    sendJson(res, 200, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, {
      ok: false,
      error: message,
    });
  }
}

/**
 * Create and configure the HTTP server
 */
export function createHttpServer(): Server {
  const httpServer = createServer();

  httpServer.on('request', async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, `http://${req.headers.host || 'localhost'}`);
    const method = req.method?.toUpperCase();

    try {
      switch (url.pathname) {
        case '/mcp':
          if (method === 'POST') {
            await handleMcpRequest(req, res);
          } else {
            handleMethodNotAllowed(res);
          }
          break;

        case '/health':
          if (method === 'GET') {
            handleHealthCheck(res);
          } else {
            handleMethodNotAllowed(res);
          }
          break;

        default:
          handleNotFound(res);
      }
    } catch (error) {
      console.error('Server error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      sendJson(res, 500, { ok: false, error: message });
    }
  });

  return httpServer;
}

/**
 * Start the HTTP transport
 */
export async function runHttpTransport(): Promise<void> {
  const config = getConfig();
  const port = config.httpPort;

  const httpServer = createHttpServer();

  httpServer.listen(port, () => {
    console.log(`git-repo-brief HTTP server listening on port ${port}`);
    console.log(`MCP endpoint: http://localhost:${port}/mcp`);
    console.log(`Health check: http://localhost:${port}/health`);
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    httpServer.close(() => {
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    httpServer.close(() => {
      process.exit(0);
    });
  });
}
