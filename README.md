# git-repo-brief

An MCP (Model Context Protocol) server that generates structured briefs for public GitHub repositories. Get comprehensive repository information including overview, key files, release notes, and activity snapshots.

## Features

- **repo_overview**: Get repository metadata (name, description, stars, forks, language, topics, license, timestamps)
- **extract_key_files**: Fetch contents of key files (README.md, LICENSE, package.json, pyproject.toml)
- **release_notes**: Get recent release notes with tag names, descriptions, and dates
- **activity_snapshot**: Get activity metrics (last commit, open issues/PRs, contributors count)

## Installation

```bash
npm install
npm run build
```

## Usage

### As MCP Server (stdio mode)

```bash
# Run directly
npm start

# Or after building
node dist/cli.js
```

### As HTTP Server

```bash
npm start -- --http
# or
HTTP_PORT=3001 node dist/cli.js --http
```

### MCP Client Configuration

Add to your MCP client configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "git-repo-brief": {
      "command": "node",
      "args": ["/path/to/git-repo-brief/dist/cli.js"]
    }
  }
}
```

## Tools

### repo_overview

Get a comprehensive overview of a GitHub repository.

**Input:**
```json
{
  "repo_url": "https://github.com/owner/repo"
}
```

**Output:**
```json
{
  "ok": true,
  "data": {
    "name": "repo",
    "full_name": "owner/repo",
    "description": "Repository description",
    "stars": 1234,
    "forks": 567,
    "language": "TypeScript",
    "topics": ["mcp", "github"],
    "license": "MIT",
    "created_at": "2023-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z",
    "default_branch": "main",
    "homepage": "https://example.com",
    "owner": {
      "login": "owner",
      "avatar_url": "https://github.com/owner.png",
      "type": "User"
    }
  },
  "meta": {
    "source": "https://api.github.com/repos/owner/repo",
    "retrieved_at": "2024-01-15T10:00:00Z",
    "pagination": { "next_cursor": null },
    "warnings": []
  }
}
```

### extract_key_files

Fetch contents of key files from a repository.

**Input:**
```json
{
  "repo_url": "https://github.com/owner/repo",
  "paths": ["README.md", "package.json"]
}
```

**Output:**
```json
{
  "ok": true,
  "data": {
    "files": [
      {
        "path": "README.md",
        "content": "# Project\n\nDescription...",
        "size": 1234,
        "encoding": "utf-8"
      },
      {
        "path": "package.json",
        "content": "{\"name\": \"project\"}",
        "size": 456,
        "encoding": "utf-8"
      }
    ],
    "default_branch": "main"
  },
  "meta": {
    "retrieved_at": "2024-01-15T10:00:00Z",
    "warnings": []
  }
}
```

### release_notes

Get recent release notes from a repository.

**Input:**
```json
{
  "repo_url": "https://github.com/owner/repo",
  "limit": 5
}
```

**Output:**
```json
{
  "ok": true,
  "data": {
    "releases": [
      {
        "tag_name": "v1.0.0",
        "name": "Version 1.0.0",
        "body": "## Changes\n- Feature A\n- Bug fix B",
        "published_at": "2024-01-01T00:00:00Z",
        "prerelease": false,
        "draft": false,
        "html_url": "https://github.com/owner/repo/releases/tag/v1.0.0"
      }
    ],
    "total_count": 1
  },
  "meta": {
    "retrieved_at": "2024-01-15T10:00:00Z",
    "pagination": { "next_cursor": null },
    "warnings": []
  }
}
```

### activity_snapshot

Get a snapshot of recent repository activity.

**Input:**
```json
{
  "repo_url": "https://github.com/owner/repo"
}
```

**Output:**
```json
{
  "ok": true,
  "data": {
    "last_commit_date": "2024-01-14T15:30:00Z",
    "last_commit_message": "fix: resolve parsing issue",
    "open_issues_count": 25,
    "open_prs_count": 8,
    "contributors_count": 42,
    "watchers_count": 100,
    "has_wiki": true,
    "has_discussions": true
  },
  "meta": {
    "retrieved_at": "2024-01-15T10:00:00Z",
    "warnings": []
  }
}
```

## HTTP API Endpoints

When running in HTTP mode:

- `GET /health` - Health check
- `GET /tools` - List available tools
- `POST /tools/repo_overview` - Get repository overview
- `POST /tools/extract_key_files` - Extract key files
- `POST /tools/release_notes` - Get release notes
- `POST /tools/activity_snapshot` - Get activity snapshot

### Example HTTP Request

```bash
curl -X POST http://localhost:3000/tools/repo_overview \
  -H "Content-Type: application/json" \
  -d '{"repo_url": "https://github.com/microsoft/vscode"}'
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_TOKEN` | - | GitHub personal access token (optional, increases rate limit from 60 to 5000 req/hour) |
| `REQUEST_DELAY_MS` | 100 | Delay between requests for rate limiting |
| `REQUEST_TIMEOUT_MS` | 30000 | Request timeout in milliseconds |
| `TRANSPORT_MODE` | stdio | Transport mode: `stdio` or `http` |
| `HTTP_PORT` | 3000 | HTTP server port (when using HTTP transport) |

### Rate Limiting

The server implements polite rate limiting:
- Default delay of 100ms between requests
- Handles GitHub API rate limit responses gracefully
- Optional GitHub token support for higher rate limits

## Response Format

All responses follow the standard envelope format:

### Success Response
```json
{
  "ok": true,
  "data": { ... },
  "meta": {
    "source": "optional API URL",
    "retrieved_at": "ISO-8601 timestamp",
    "pagination": { "next_cursor": null },
    "warnings": []
  }
}
```

### Error Response
```json
{
  "ok": false,
  "error": {
    "code": "INVALID_INPUT | UPSTREAM_ERROR | RATE_LIMITED | TIMEOUT | PARSE_ERROR | INTERNAL_ERROR",
    "message": "Human readable message",
    "details": { ... }
  },
  "meta": {
    "retrieved_at": "ISO-8601 timestamp"
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type check
npm run typecheck

# Build
npm run build
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

## License

MIT
