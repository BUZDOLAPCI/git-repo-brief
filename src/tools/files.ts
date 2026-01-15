import { getConfig } from '../config.js';
import {
  type ApiResponse,
  type ExtractKeyFilesData,
  type FileContent,
  createSuccessResponse,
  createErrorResponse,
} from '../types.js';
import { parseRepoUrl, rateLimitedFetch } from './overview.js';

const DEFAULT_PATHS = ['README.md', 'LICENSE', 'package.json', 'pyproject.toml'];

async function fetchRawFile(
  owner: string,
  repo: string,
  branch: string,
  path: string
): Promise<FileContent> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;

  try {
    const response = await rateLimitedFetch(url);

    if (response.status === 404) {
      return {
        path,
        content: null,
        size: null,
        encoding: 'utf-8',
        error: 'File not found',
      };
    }

    if (!response.ok) {
      return {
        path,
        content: null,
        size: null,
        encoding: 'utf-8',
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const content = await response.text();
    return {
      path,
      content,
      size: content.length,
      encoding: 'utf-8',
    };
  } catch (error) {
    return {
      path,
      content: null,
      size: null,
      encoding: 'utf-8',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function getDefaultBranch(owner: string, repo: string): Promise<string | null> {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;

  try {
    const response = await rateLimitedFetch(apiUrl);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { default_branch?: string };
    return data.default_branch ?? 'main';
  } catch {
    return null;
  }
}

export async function extractKeyFiles(
  repoUrl: string,
  paths?: string[]
): Promise<ApiResponse<ExtractKeyFilesData>> {
  const repoInfo = parseRepoUrl(repoUrl);

  if (!repoInfo) {
    return createErrorResponse(
      'INVALID_INPUT',
      'Invalid GitHub repository URL. Expected format: https://github.com/owner/repo',
      { provided_url: repoUrl }
    );
  }

  const filePaths = paths && paths.length > 0 ? paths : DEFAULT_PATHS;

  // Get the default branch first
  const defaultBranch = await getDefaultBranch(repoInfo.owner, repoInfo.repo);

  if (!defaultBranch) {
    return createErrorResponse(
      'UPSTREAM_ERROR',
      `Could not determine default branch for ${repoInfo.owner}/${repoInfo.repo}. Repository may not exist or be private.`,
      { owner: repoInfo.owner, repo: repoInfo.repo }
    );
  }

  // Fetch all files in parallel
  const filePromises = filePaths.map((path) =>
    fetchRawFile(repoInfo.owner, repoInfo.repo, defaultBranch, path)
  );

  try {
    const files = await Promise.all(filePromises);

    const warnings: string[] = [];
    const filesNotFound = files.filter((f) => f.error === 'File not found');
    if (filesNotFound.length > 0) {
      warnings.push(
        `Files not found: ${filesNotFound.map((f) => f.path).join(', ')}`
      );
    }

    const filesWithErrors = files.filter((f) => f.error && f.error !== 'File not found');
    if (filesWithErrors.length > 0) {
      warnings.push(
        `Errors fetching files: ${filesWithErrors.map((f) => `${f.path}: ${f.error}`).join('; ')}`
      );
    }

    return createSuccessResponse(
      {
        files,
        default_branch: defaultBranch,
      },
      {
        source: `https://github.com/${repoInfo.owner}/${repoInfo.repo}`,
        warnings,
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
