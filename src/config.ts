export interface Config {
  githubToken?: string;
  requestDelayMs: number;
  requestTimeoutMs: number;
  httpPort: number;
  userAgent: string;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function loadConfig(): Config {
  return {
    githubToken: process.env.GITHUB_TOKEN,
    requestDelayMs: getEnvNumber('REQUEST_DELAY_MS', 100),
    requestTimeoutMs: getEnvNumber('REQUEST_TIMEOUT_MS', 30000),
    httpPort: getEnvNumber('HTTP_PORT', 8080),
    userAgent: 'git-repo-brief/1.0.0',
  };
}

let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

export function setConfig(config: Partial<Config>): void {
  configInstance = { ...getConfig(), ...config };
}

export function resetConfig(): void {
  configInstance = null;
}
