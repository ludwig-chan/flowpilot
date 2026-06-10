import type { FastifyInstance } from 'fastify'
import type { ServerConfig } from '../config.js'

export function registerHealthRoutes(app: FastifyInstance, config: ServerConfig): void {
  app.get('/health', async () => {
    return {
      ok: true,
      service: config.serviceName,
      timestamp: new Date().toISOString()
    }
  })

  app.get('/api/status', async () => {
    const uptimeMs = Date.now() - new Date(config.startedAt).getTime()

    return {
      name: config.serviceName,
      version: config.version,
      environment: config.environment,
      uptimeSeconds: Math.max(0, Math.floor(uptimeMs / 1000)),
      startedAt: config.startedAt
    }
  })
}
