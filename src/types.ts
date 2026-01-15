import { z } from 'zod';

// =============================================================================
// Standard Response Envelope
// =============================================================================

export interface SuccessResponse<T> {
  ok: true;
  data: T;
  meta: {
    source?: string;
    retrieved_at: string;
    pagination?: {
      next_cursor: string | null;
    };
    warnings: string[];
  };
}

export interface ErrorResponse {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details: Record<string, unknown>;
  };
  meta: {
    retrieved_at: string;
  };
}

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'UPSTREAM_ERROR'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'PARSE_ERROR'
  | 'INTERNAL_ERROR';

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

// =============================================================================
// Helper Functions for Response Creation
// =============================================================================

export function createSuccessResponse<T>(
  data: T,
  options: {
    source?: string;
    warnings?: string[];
    next_cursor?: string | null;
  } = {}
): SuccessResponse<T> {
  return {
    ok: true,
    data,
    meta: {
      source: options.source,
      retrieved_at: new Date().toISOString(),
      pagination: {
        next_cursor: options.next_cursor ?? null,
      },
      warnings: options.warnings ?? [],
    },
  };
}

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {}
): ErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      retrieved_at: new Date().toISOString(),
    },
  };
}

// =============================================================================
// Input Schemas (Zod)
// =============================================================================

export const RepoUrlSchema = z.string().url().refine(
  (url) => {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'github.com' || parsed.hostname === 'www.github.com';
    } catch {
      return false;
    }
  },
  { message: 'URL must be a valid GitHub repository URL' }
);

export const RepoOverviewInputSchema = z.object({
  repo_url: RepoUrlSchema,
});

export const ExtractKeyFilesInputSchema = z.object({
  repo_url: RepoUrlSchema,
  paths: z.array(z.string()).optional(),
});

export const ReleaseNotesInputSchema = z.object({
  repo_url: RepoUrlSchema,
  limit: z.number().int().positive().max(100).optional().default(5),
});

export const ActivitySnapshotInputSchema = z.object({
  repo_url: RepoUrlSchema,
});

// =============================================================================
// Output Types
// =============================================================================

export interface RepoOverviewData {
  name: string;
  full_name: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  license: string | null;
  created_at: string;
  updated_at: string;
  default_branch: string;
  homepage: string | null;
  owner: {
    login: string;
    avatar_url: string;
    type: string;
  };
}

export interface FileContent {
  path: string;
  content: string | null;
  size: number | null;
  encoding: string;
  error?: string;
}

export interface ExtractKeyFilesData {
  files: FileContent[];
  default_branch: string;
}

export interface ReleaseData {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string | null;
  prerelease: boolean;
  draft: boolean;
  html_url: string;
}

export interface ReleaseNotesData {
  releases: ReleaseData[];
  total_count: number;
}

export interface ActivitySnapshotData {
  last_commit_date: string | null;
  last_commit_message: string | null;
  open_issues_count: number;
  open_prs_count: number;
  contributors_count: number;
  watchers_count: number;
  has_wiki: boolean;
  has_discussions: boolean;
}

// =============================================================================
// GitHub API Response Types
// =============================================================================

export interface GitHubRepoResponse {
  name: string;
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics: string[];
  license: { spdx_id: string; name: string } | null;
  created_at: string;
  updated_at: string;
  default_branch: string;
  homepage: string | null;
  open_issues_count: number;
  watchers_count: number;
  has_wiki: boolean;
  has_discussions: boolean;
  owner: {
    login: string;
    avatar_url: string;
    type: string;
  };
}

export interface GitHubReleaseResponse {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string | null;
  prerelease: boolean;
  draft: boolean;
  html_url: string;
}

export interface GitHubCommitResponse {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
}

export interface GitHubPullResponse {
  number: number;
  state: string;
}

export interface GitHubContributorResponse {
  login: string;
  contributions: number;
}

// =============================================================================
// Parsed Repo Info
// =============================================================================

export interface ParsedRepoInfo {
  owner: string;
  repo: string;
}
