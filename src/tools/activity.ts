import { getConfig } from '../config.js';
import {
  type ApiResponse,
  type ActivitySnapshotData,
  type GitHubRepoResponse,
  type GitHubCommitResponse,
  type GitHubPullResponse,
  type GitHubContributorResponse,
  createSuccessResponse,
  createErrorResponse,
} from '../types.js';
import { parseRepoUrl, rateLimitedFetch } from './overview.js';

async function fetchRepoInfo(owner: string, repo: string): Promise<GitHubRepoResponse | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  try {
    const response = await rateLimitedFetch(url);
    if (!response.ok) return null;
    return (await response.json()) as GitHubRepoResponse;
  } catch {
    return null;
  }
}

async function fetchLatestCommit(
  owner: string,
  repo: string
): Promise<GitHubCommitResponse | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`;
  try {
    const response = await rateLimitedFetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as GitHubCommitResponse[];
    return data.length > 0 ? data[0] : null;
  } catch {
    return null;
  }
}

async function fetchOpenPRsCount(owner: string, repo: string): Promise<number | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=1`;
  try {
    const response = await rateLimitedFetch(url);
    if (!response.ok) return null;

    // GitHub returns total count in Link header or we can check array length
    // For accurate count, we need to look at the Link header
    const linkHeader = response.headers.get('link');
    if (linkHeader) {
      // Extract last page number from link header
      const lastMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
      if (lastMatch) {
        return parseInt(lastMatch[1], 10);
      }
    }

    // If no pagination, count from response
    const data = (await response.json()) as GitHubPullResponse[];
    return data.length;
  } catch {
    return null;
  }
}

async function fetchContributorsCount(owner: string, repo: string): Promise<number | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=1&anon=true`;
  try {
    const response = await rateLimitedFetch(url);
    if (!response.ok) return null;

    // GitHub returns total count info in Link header
    const linkHeader = response.headers.get('link');
    if (linkHeader) {
      const lastMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
      if (lastMatch) {
        return parseInt(lastMatch[1], 10);
      }
    }

    // If no pagination, count from response
    const data = (await response.json()) as GitHubContributorResponse[];
    return data.length;
  } catch {
    return null;
  }
}

export async function activitySnapshot(
  repoUrl: string
): Promise<ApiResponse<ActivitySnapshotData>> {
  const repoInfo = parseRepoUrl(repoUrl);

  if (!repoInfo) {
    return createErrorResponse(
      'INVALID_INPUT',
      'Invalid GitHub repository URL. Expected format: https://github.com/owner/repo',
      { provided_url: repoUrl }
    );
  }

  try {
    // Fetch all data in parallel for efficiency
    const [repoData, latestCommit, openPRsCount, contributorsCount] = await Promise.all([
      fetchRepoInfo(repoInfo.owner, repoInfo.repo),
      fetchLatestCommit(repoInfo.owner, repoInfo.repo),
      fetchOpenPRsCount(repoInfo.owner, repoInfo.repo),
      fetchContributorsCount(repoInfo.owner, repoInfo.repo),
    ]);

    if (!repoData) {
      return createErrorResponse(
        'UPSTREAM_ERROR',
        `Could not fetch repository data for ${repoInfo.owner}/${repoInfo.repo}. Repository may not exist or be private.`,
        { owner: repoInfo.owner, repo: repoInfo.repo }
      );
    }

    const warnings: string[] = [];

    if (openPRsCount === null) {
      warnings.push('Could not fetch open PRs count');
    }

    if (contributorsCount === null) {
      warnings.push('Could not fetch contributors count');
    }

    if (!latestCommit) {
      warnings.push('Could not fetch latest commit information');
    }

    const activityData: ActivitySnapshotData = {
      last_commit_date: latestCommit?.commit.author.date ?? null,
      last_commit_message: latestCommit?.commit.message ?? null,
      open_issues_count: repoData.open_issues_count,
      open_prs_count: openPRsCount ?? 0,
      contributors_count: contributorsCount ?? 0,
      watchers_count: repoData.watchers_count,
      has_wiki: repoData.has_wiki,
      has_discussions: repoData.has_discussions,
    };

    return createSuccessResponse(activityData, {
      source: `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`,
      warnings,
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
