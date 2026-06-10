import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { loadConfig, type ServerConfig } from './config.js'
import { registerHealthRoutes } from './routes/health.js'

export function buildApp(config: ServerConfig = loadConfig()): FastifyInstance {
  const app = Fastify({
    logger: true
  })

  app.decorate('config', config)
  registerHealthRoutes(app, config)

  return app
}
