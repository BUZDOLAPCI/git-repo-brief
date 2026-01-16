import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  RepoOverviewInputSchema,
  ExtractKeyFilesInputSchema,
  ReleaseNotesInputSchema,
  ActivitySnapshotInputSchema,
} from './types.js';
import { repoOverview, extractKeyFiles, releaseNotes, activitySnapshot } from './tools/index.js';

export interface StandaloneServer {
  server: Server;
  transport: StreamableHTTPServerTransport;
}

/**
 * Creates an MCP server instance with all tool handlers configured.
 * Use this for stdio transport or when you need just the server.
 */
export function createServer(): Server {
  const server = new Server(
    {
      name: 'git-repo-brief',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
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
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'repo_overview': {
          const parsed = RepoOverviewInputSchema.safeParse(args);
          if (!parsed.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      ok: false,
                      error: {
                        code: 'INVALID_INPUT',
                        message: 'Invalid input parameters',
                        details: { errors: parsed.error.errors },
                      },
                      meta: { retrieved_at: new Date().toISOString() },
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
          const result = await repoOverview(parsed.data.repo_url);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'extract_key_files': {
          const parsed = ExtractKeyFilesInputSchema.safeParse(args);
          if (!parsed.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      ok: false,
                      error: {
                        code: 'INVALID_INPUT',
                        message: 'Invalid input parameters',
                        details: { errors: parsed.error.errors },
                      },
                      meta: { retrieved_at: new Date().toISOString() },
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
          const result = await extractKeyFiles(parsed.data.repo_url, parsed.data.paths);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'release_notes': {
          const parsed = ReleaseNotesInputSchema.safeParse(args);
          if (!parsed.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      ok: false,
                      error: {
                        code: 'INVALID_INPUT',
                        message: 'Invalid input parameters',
                        details: { errors: parsed.error.errors },
                      },
                      meta: { retrieved_at: new Date().toISOString() },
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
          const result = await releaseNotes(parsed.data.repo_url, parsed.data.limit);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'activity_snapshot': {
          const parsed = ActivitySnapshotInputSchema.safeParse(args);
          if (!parsed.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      ok: false,
                      error: {
                        code: 'INVALID_INPUT',
                        message: 'Invalid input parameters',
                        details: { errors: parsed.error.errors },
                      },
                      meta: { retrieved_at: new Date().toISOString() },
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
          const result = await activitySnapshot(parsed.data.repo_url);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        default:
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    ok: false,
                    error: {
                      code: 'INVALID_INPUT',
                      message: `Unknown tool: ${name}`,
                      details: {},
                    },
                    meta: { retrieved_at: new Date().toISOString() },
                  },
                  null,
                  2
                ),
              },
            ],
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ok: false,
                error: {
                  code: 'INTERNAL_ERROR',
                  message: error instanceof Error ? error.message : 'Unknown error',
                  details: {},
                },
                meta: { retrieved_at: new Date().toISOString() },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  });

  return server;
}

/**
 * Creates a standalone MCP server with its own transport for HTTP use.
 * Returns both the server and transport so they can be managed together.
 *
 * @param sessionId - Optional session ID for the transport
 * @returns StandaloneServer with server and transport instances
 */
export async function createStandaloneServer(sessionId?: string): Promise<StandaloneServer> {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: sessionId ? () => sessionId : undefined,
  });

  await server.connect(transport);

  return { server, transport };
}
