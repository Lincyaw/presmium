import { serve } from '@hono/node-server'
import { systemLocale } from '@lincyaw/kernel/node'
import { createCloudApp } from './app.ts'
import { readCloudConfig } from './config.ts'
import { Database } from './database.ts'
import { CloudError } from '../domain/errors.ts'
import { ObjectStorage } from './storage.ts'

const text = {
  'zh-CN': { help: '用法：presmium-cloud [serve|migrate|storage-init]\n通过 CLOUD_* 环境变量配置云服务。', started: '云服务已启动', failed: '云服务启动失败', missing: '请设置环境变量' },
  en: { help: 'Usage: presmium-cloud [serve|migrate|storage-init]\nConfigure the service using CLOUD_* environment variables.', started: 'Cloud service started', failed: 'Cloud service failed to start', missing: 'Missing environment variable' },
}

export async function main(args: string[]): Promise<number> {
  const t = text[systemLocale()]
  if (args.includes('--help') || args.includes('-h')) { process.stdout.write(`${t.help}\n`); return 0 }
  const [command = 'serve', ...rest] = args
  if (rest.length || !['serve', 'migrate', 'storage-init'].includes(command)) { process.stderr.write(`${t.help}\n`); return 2 }
  let db: Database | undefined
  try {
    if (command === 'migrate') {
      if (!process.env.CLOUD_DATABASE_URL) throw new CloudError(500, 'configuration-missing', { key: 'CLOUD_DATABASE_URL' })
      db = new Database(process.env.CLOUD_DATABASE_URL); await db.migrate(); await db.close(); return 0
    }
    const config = await readCloudConfig()
    if (command === 'storage-init') {
      const storage = new ObjectStorage(config.storage)
      await storage.initialize(); storage.close(); return 0
    }
    db = new Database(config.databaseUrl); await db.migrate()
    const cloud = await createCloudApp(config, db)
    const server = serve({ fetch: cloud.app.fetch, hostname: config.host, port: config.port }, () => process.stdout.write(`${t.started}: ${config.publicUrl}\n`))
    await new Promise<void>(done => {
      const stop = () => { process.off('SIGTERM', stop); process.off('SIGINT', stop); server.close(() => done()) }
      process.once('SIGTERM', stop); process.once('SIGINT', stop)
    })
    await cloud.close(); await db.close()
    return 0
  } catch (error) {
    await db?.close().catch(() => {})
    const detail = error instanceof CloudError ? error.code === 'configuration-missing' ? `${t.missing} ${error.details?.key}` : error.code : error instanceof Error ? error.message : String(error)
    process.stderr.write(`${t.failed}: ${detail}\n`)
    return 1
  }
}
