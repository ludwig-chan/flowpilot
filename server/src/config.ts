export interface ServerConfig {
  host: string
  port: number
  environment: string
  serviceName: string
  version: string
  startedAt: string
}

const DEFAULT_PORT = 8787

function parsePort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_PORT
  }

  const port = Number.parseInt(value, 10)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return DEFAULT_PORT
  }

  return port
}

export function loadConfig(): ServerConfig {
  return {
    host: process.env.HOST ?? '127.0.0.1',
    port: parsePort(process.env.PORT),
    environment: process.env.NODE_ENV ?? 'development',
    serviceName: 'flowpilot-server',
    version: process.env.npm_package_version ?? '0.1.0',
    startedAt: new Date().toISOString()
  }
}
