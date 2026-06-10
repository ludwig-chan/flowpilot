import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import type { ServerConfig } from '../src/config.js'

const testConfig: ServerConfig = {
  host: '127.0.0.1',
  port: 8787,
  environment: 'development',
  serviceName: 'flowpilot-server',
  version: '0.1.0',
  startedAt: '2026-06-09T00:00:00.000Z'
}

describe('health routes', () => {
  it('returns health status', async () => {
    const app = buildApp(testConfig)
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      ok: true,
      service: 'flowpilot-server'
    })

    await app.close()
  })

  it('returns API status', async () => {
    const app = buildApp(testConfig)
    const response = await app.inject({
      method: 'GET',
      url: '/api/status'
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      name: 'flowpilot-server',
      version: '0.1.0',
      environment: 'development'
    })

    await app.close()
  })
})
