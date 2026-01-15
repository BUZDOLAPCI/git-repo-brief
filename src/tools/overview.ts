import { getConfig } from '../config.js';
import {
  type ApiResponse,
  type RepoOverviewData,
  type GitHubRepoResponse,
  type ParsedRepoInfo,
  createSuccessResponse,
  createErrorResponse,
} from '../types.js';

// Rate limiting state
let lastRequestTime = 0;

async function rateLimitedFetch(url: string, options?: RequestInit): Promise<Response> {
  const config = getConfig();
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < config.requestDelayMs) {
    await new Promise((resolve) =>
      setTimeout(resolve, config.requestDelayMs - timeSinceLastRequest)
    );
  }

  lastRequestTime = Date.now();

  const headers: Record<string, string> = {
    'User-Agent': config.userAgent,
    Accept: 'application/vnd.github.v3+json',
    ...(options?.headers as Record<string, string>),
  };

  if (config.githubToken) {
    headers['Authorization'] = `Bearer ${config.githubToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function parseRepoUrl(url: string): ParsedRepoInfo | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'github.com' && parsed.hostname !== 'www.github.com') {
      return null;
    }

    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) {
      return null;
    }

    return {
      owner: pathParts[0],
      repo: pathParts[1].replace(/\.git$/, ''),
    };
  } catch {
    return null;
  }
}

export async function repoOverview(repoUrl: string): Promise<ApiResponse<RepoOverviewData>> {
  const repoInfo = parseRepoUrl(repoUrl);

  if (!repoInfo) {
    return createErrorResponse(
      'INVALID_INPUT',
      'Invalid GitHub repository URL. Expected format: https://github.com/owner/repo',
      { provided_url: repoUrl }
    );
  }

  const apiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`;

  try {
    const response = await rateLimitedFetch(apiUrl);

    if (response.status === 404) {
      return createErrorResponse(
        'UPSTREAM_ERROR',
        `Repository not found: ${repoInfo.owner}/${repoInfo.repo}`,
        { status: 404 }
      );
    }

    if (response.status === 403) {
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      if (rateLimitRemaining === '0') {
        const resetTime = response.headers.get('x-ratelimit-reset');
        return createErrorResponse(
          'RATE_LIMITED',
          'GitHub API rate limit exceeded',
          {
            reset_at: resetTime ? new Date(parseInt(resetTime) * 1000).toISOString() : null,
          }
        );
      }
      return createErrorResponse('UPSTREAM_ERROR', 'Access forbidden', { status: 403 });
    }

    if (!response.ok) {
      return createErrorResponse(
        'UPSTREAM_ERROR',
        `GitHub API error: ${response.status} ${response.statusText}`,
        { status: response.status }
      );
    }

    const data = (await response.json()) as GitHubRepoResponse;

    const overviewData: RepoOverviewData = {
      name: data.name,
      full_name: data.full_name,
      description: data.description,
      stars: data.stargazers_count,
      forks: data.forks_count,
      language: data.language,
      topics: data.topics ?? [],
      license: data.license?.spdx_id ?? null,
      created_at: data.created_at,
      updated_at: data.updated_at,
      default_branch: data.default_branch,
      homepage: data.homepage,
      owner: {
        login: data.owner.login,
        avatar_url: data.owner.avatar_url,
        type: data.owner.type,
      },
    };

    return createSuccessResponse(overviewData, {
      source: apiUrl,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return createErrorResponse('TIMEOUT', 'Request timed out', {
          timeout_ms: getConfig().requestTimeoutMs,
        });
      }
      return createErrorResponse('INTERNAL_ERROR', error.message, {
        error_name: error.name,
      });
    }
    return createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

// Export the rate-limited fetch for use by other tools
export { rateLimitedFetch };
