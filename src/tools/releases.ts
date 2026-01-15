import { getConfig } from '../config.js';
import {
  type ApiResponse,
  type ReleaseNotesData,
  type ReleaseData,
  type GitHubReleaseResponse,
  createSuccessResponse,
  createErrorResponse,
} from '../types.js';
import { parseRepoUrl, rateLimitedFetch } from './overview.js';

export async function releaseNotes(
  repoUrl: string,
  limit: number = 5
): Promise<ApiResponse<ReleaseNotesData>> {
  const repoInfo = parseRepoUrl(repoUrl);

  if (!repoInfo) {
    return createErrorResponse(
      'INVALID_INPUT',
      'Invalid GitHub repository URL. Expected format: https://github.com/owner/repo',
      { provided_url: repoUrl }
    );
  }

  // Validate limit
  if (limit < 1 || limit > 100) {
    return createErrorResponse(
      'INVALID_INPUT',
      'Limit must be between 1 and 100',
      { provided_limit: limit }
    );
  }

  const apiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/releases?per_page=${limit}`;

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

    const data = (await response.json()) as GitHubReleaseResponse[];

    const releases: ReleaseData[] = data.map((release) => ({
      tag_name: release.tag_name,
      name: release.name,
      body: release.body,
      published_at: release.published_at,
      prerelease: release.prerelease,
      draft: release.draft,
      html_url: release.html_url,
    }));

    // Check for pagination
    const linkHeader = response.headers.get('link');
    let nextCursor: string | null = null;
    if (linkHeader && linkHeader.includes('rel="next"')) {
      // Extract page number from link header for pagination info
      const match = linkHeader.match(/page=(\d+)>; rel="next"/);
      if (match) {
        nextCursor = match[1];
      }
    }

    return createSuccessResponse(
      {
        releases,
        total_count: releases.length,
      },
      {
        source: apiUrl,
        next_cursor: nextCursor,
        warnings: releases.length === 0 ? ['No releases found for this repository'] : [],
      }
    );
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
