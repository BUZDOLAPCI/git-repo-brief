#!/usr/bin/env node

import { getConfig } from './config.js';
import { runStdioTransport, runHttpTransport } from './transport/index.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse command line arguments
  let transportMode = getConfig().transportMode;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--stdio') {
      transportMode = 'stdio';
    } else if (arg === '--http') {
      transportMode = 'http';
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
git-repo-brief - MCP server for GitHub repository briefs

Usage:
  git-repo-brief [options]

Options:
  --stdio     Run in stdio mode (default, for MCP clients)
  --http      Run in HTTP mode (for direct API access)
  --help, -h  Show this help message

Environment Variables:
  GITHUB_TOKEN       GitHub personal access token (optional, increases rate limit)
  REQUEST_DELAY_MS   Delay between requests in ms (default: 100)
  REQUEST_TIMEOUT_MS Request timeout in ms (default: 30000)
  TRANSPORT_MODE     Transport mode: stdio | http (default: stdio)
  HTTP_PORT          HTTP server port (default: 3000)

Examples:
  # Run as MCP server (stdio mode)
  git-repo-brief

  # Run as HTTP server
  git-repo-brief --http

  # With environment variable
  GITHUB_TOKEN=ghp_xxx git-repo-brief
`);
      process.exit(0);
    }
  }

  try {
    if (transportMode === 'http') {
      await runHttpTransport();
    } else {
      await runStdioTransport();
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
