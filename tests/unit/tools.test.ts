import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseRepoUrl } from '../../src/tools/overview.js';
import {
  createSuccessResponse,
  createErrorResponse,
  RepoOverviewInputSchema,
  ExtractKeyFilesInputSchema,
  ReleaseNotesInputSchema,
  ActivitySnapshotInputSchema,
} from '../../src/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('parseRepoUrl', () => {
  it('should parse a valid GitHub URL', () => {
    const result = parseRepoUrl('https://github.com/owner/repo');
    expect(result).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('should parse a GitHub URL with www', () => {
    const result = parseRepoUrl('https://www.github.com/owner/repo');
    expect(result).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('should strip .git suffix from repo name', () => {
    const result = parseRepoUrl('https://github.com/owner/repo.git');
    expect(result).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('should handle URLs with additional path segments', () => {
    const result = parseRepoUrl('https://github.com/owner/repo/tree/main');
    expect(result).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('should return null for non-GitHub URLs', () => {
    const result = parseRepoUrl('https://gitlab.com/owner/repo');
    expect(result).toBeNull();
  });

  it('should return null for invalid URLs', () => {
    const result = parseRepoUrl('not-a-url');
    expect(result).toBeNull();
  });

  it('should return null for GitHub URLs without owner/repo', () => {
    const result = parseRepoUrl('https://github.com/owner');
    expect(result).toBeNull();
  });
});

describe('createSuccessResponse', () => {
  it('should create a success response with data', () => {
    const data = { name: 'test-repo', stars: 100 };
    const response = createSuccessResponse(data);

    expect(response.ok).toBe(true);
    expect(response.data).toEqual(data);
    expect(response.meta.retrieved_at).toBeDefined();
    expect(response.meta.warnings).toEqual([]);
    expect(response.meta.pagination?.next_cursor).toBeNull();
  });

  it('should include optional source', () => {
    const data = { name: 'test' };
    const response = createSuccessResponse(data, { source: 'https://api.github.com' });

    expect(response.meta.source).toBe('https://api.github.com');
  });

  it('should include warnings when provided', () => {
    const data = { name: 'test' };
    const response = createSuccessResponse(data, { warnings: ['File not found'] });

    expect(response.meta.warnings).toEqual(['File not found']);
  });

  it('should include pagination cursor when provided', () => {
    const data = { releases: [] };
    const response = createSuccessResponse(data, { next_cursor: '2' });

    expect(response.meta.pagination?.next_cursor).toBe('2');
  });
});

describe('createErrorResponse', () => {
  it('should create an error response', () => {
    const response = createErrorResponse('INVALID_INPUT', 'Bad request');

    expect(response.ok).toBe(false);
    expect(response.error.code).toBe('INVALID_INPUT');
    expect(response.error.message).toBe('Bad request');
    expect(response.error.details).toEqual({});
    expect(response.meta.retrieved_at).toBeDefined();
  });

  it('should include details when provided', () => {
    const response = createErrorResponse('UPSTREAM_ERROR', 'API error', { status: 404 });

    expect(response.error.details).toEqual({ status: 404 });
  });
});

describe('Input Schemas', () => {
  describe('RepoOverviewInputSchema', () => {
    it('should validate a valid GitHub URL', () => {
      const result = RepoOverviewInputSchema.safeParse({
        repo_url: 'https://github.com/owner/repo',
      });
      expect(result.success).toBe(true);
    });

    it('should reject non-GitHub URLs', () => {
      const result = RepoOverviewInputSchema.safeParse({
        repo_url: 'https://gitlab.com/owner/repo',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing repo_url', () => {
      const result = RepoOverviewInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('ExtractKeyFilesInputSchema', () => {
    it('should validate with only repo_url', () => {
      const result = ExtractKeyFilesInputSchema.safeParse({
        repo_url: 'https://github.com/owner/repo',
      });
      expect(result.success).toBe(true);
    });

    it('should validate with custom paths', () => {
      const result = ExtractKeyFilesInputSchema.safeParse({
        repo_url: 'https://github.com/owner/repo',
        paths: ['README.md', 'Cargo.toml'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.paths).toEqual(['README.md', 'Cargo.toml']);
      }
    });
  });

  describe('ReleaseNotesInputSchema', () => {
    it('should validate with default limit', () => {
      const result = ReleaseNotesInputSchema.safeParse({
        repo_url: 'https://github.com/owner/repo',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(5);
      }
    });

    it('should validate with custom limit', () => {
      const result = ReleaseNotesInputSchema.safeParse({
        repo_url: 'https://github.com/owner/repo',
        limit: 10,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
      }
    });

    it('should reject limit over 100', () => {
      const result = ReleaseNotesInputSchema.safeParse({
        repo_url: 'https://github.com/owner/repo',
        limit: 150,
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative limit', () => {
      const result = ReleaseNotesInputSchema.safeParse({
        repo_url: 'https://github.com/owner/repo',
        limit: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ActivitySnapshotInputSchema', () => {
    it('should validate a valid input', () => {
      const result = ActivitySnapshotInputSchema.safeParse({
        repo_url: 'https://github.com/owner/repo',
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('Tool functions with mocked fetch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('repoOverview', () => {
    it('should return repo data on successful response', async () => {
      const mockRepoData = {
        name: 'test-repo',
        full_name: 'owner/test-repo',
        description: 'A test repository',
        stargazers_count: 100,
        forks_count: 50,
        language: 'TypeScript',
        topics: ['testing', 'mcp'],
        license: { spdx_id: 'MIT', name: 'MIT License' },
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        default_branch: 'main',
        homepage: 'https://example.com',
        owner: {
          login: 'owner',
          avatar_url: 'https://github.com/owner.png',
          type: 'User',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockRepoData,
        headers: new Map(),
      });

      const { repoOverview } = await import('../../src/tools/overview.js');
      const result = await repoOverview('https://github.com/owner/test-repo');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('test-repo');
        expect(result.data.stars).toBe(100);
        expect(result.data.forks).toBe(50);
        expect(result.data.language).toBe('TypeScript');
        expect(result.data.license).toBe('MIT');
      }
    });

    it('should return error for invalid URL', async () => {
      const { repoOverview } = await import('../../src/tools/overview.js');
      const result = await repoOverview('https://gitlab.com/owner/repo');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_INPUT');
      }
    });

    it('should handle 404 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Map(),
      });

      const { repoOverview } = await import('../../src/tools/overview.js');
      const result = await repoOverview('https://github.com/owner/nonexistent');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UPSTREAM_ERROR');
        expect(result.error.message).toContain('not found');
      }
    });

    it('should handle rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: new Map([
          ['x-ratelimit-remaining', '0'],
          ['x-ratelimit-reset', String(Math.floor(Date.now() / 1000) + 3600)],
        ]),
      });

      const { repoOverview } = await import('../../src/tools/overview.js');
      const result = await repoOverview('https://github.com/owner/repo');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('RATE_LIMITED');
      }
    });
  });

  describe('releaseNotes', () => {
    it('should return releases on successful response', async () => {
      const mockReleases = [
        {
          tag_name: 'v1.0.0',
          name: 'Version 1.0.0',
          body: 'Initial release',
          published_at: '2024-01-01T00:00:00Z',
          prerelease: false,
          draft: false,
          html_url: 'https://github.com/owner/repo/releases/tag/v1.0.0',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockReleases,
        headers: new Map(),
      });

      const { releaseNotes } = await import('../../src/tools/releases.js');
      const result = await releaseNotes('https://github.com/owner/repo', 5);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.releases).toHaveLength(1);
        expect(result.data.releases[0].tag_name).toBe('v1.0.0');
      }
    });

    it('should handle empty releases', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
        headers: new Map(),
      });

      const { releaseNotes } = await import('../../src/tools/releases.js');
      const result = await releaseNotes('https://github.com/owner/repo');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.releases).toHaveLength(0);
        expect(result.meta.warnings).toContain('No releases found for this repository');
      }
    });
  });

  describe('extractKeyFiles', () => {
    it('should return file contents', async () => {
      // First call for default branch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ default_branch: 'main' }),
        headers: new Map(),
      });

      // File fetches
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '# README\nThis is a test repo',
        headers: new Map(),
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Map(),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{"name": "test-repo"}',
        headers: new Map(),
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Map(),
      });

      const { extractKeyFiles } = await import('../../src/tools/files.js');
      const result = await extractKeyFiles('https://github.com/owner/repo');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.default_branch).toBe('main');
        expect(result.data.files).toHaveLength(4);

        const readme = result.data.files.find((f) => f.path === 'README.md');
        expect(readme?.content).toContain('# README');

        const license = result.data.files.find((f) => f.path === 'LICENSE');
        expect(license?.error).toBe('File not found');
      }
    });
  });

  describe('activitySnapshot', () => {
    it('should return activity data', async () => {
      // Repo info
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          open_issues_count: 10,
          watchers_count: 50,
          has_wiki: true,
          has_discussions: false,
        }),
        headers: new Map(),
      });

      // Latest commit
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            sha: 'abc123',
            commit: {
              message: 'Latest commit',
              author: { name: 'Author', date: '2024-01-15T10:00:00Z' },
            },
          },
        ],
        headers: new Map(),
      });

      // Open PRs
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ number: 1, state: 'open' }, { number: 2, state: 'open' }],
        headers: new Map(),
      });

      // Contributors
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          { login: 'user1', contributions: 100 },
          { login: 'user2', contributions: 50 },
        ],
        headers: new Map(),
      });

      const { activitySnapshot } = await import('../../src/tools/activity.js');
      const result = await activitySnapshot('https://github.com/owner/repo');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.open_issues_count).toBe(10);
        expect(result.data.last_commit_date).toBe('2024-01-15T10:00:00Z');
        expect(result.data.last_commit_message).toBe('Latest commit');
        expect(result.data.has_wiki).toBe(true);
      }
    });
  });
});
