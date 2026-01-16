#!/usr/bin/env node

import { getConfig } from './config.js';
import { startHttpTransport } from './transport/index.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      console.log(`
git-repo-brief - MCP server for GitHub repository briefs

Usage:
  git-repo-brief [options]

Options:
  --help, -h  Show this help message

Environment Variables:
  GITHUB_TOKEN       GitHub personal access token (optional, increases rate limit)
  REQUEST_DELAY_MS   Delay between requests in ms (default: 100)
  REQUEST_TIMEOUT_MS Request timeout in ms (default: 30000)
  HTTP_PORT          HTTP server port (default: 8080)

Examples:
  # Run as HTTP server
  git-repo-brief

  # With environment variable
  GITHUB_TOKEN=ghp_xxx git-repo-brief

  # On a different port
  HTTP_PORT=3000 git-repo-brief
`);
      process.exit(0);
    }
  }

  try {
    const config = getConfig();
    const httpServer = startHttpTransport({ port: config.httpPort });

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
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
