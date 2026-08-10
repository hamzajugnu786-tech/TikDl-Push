import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL
  const isProd = process.env.NODE_ENV === 'production'
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'

  // Production safety net — never silently fall back to a local SQLite file
  // at runtime. Vercel serverless has an ephemeral filesystem; a local
  // SQLite fallback would silently lose all AdPlacement rows on every cold
  // start, which is exactly the "ads disappear after deployment" symptom
  // we are fixing.
  //
  // We DO skip this during `next build` (NEXT_PHASE=phase-production-build)
  // because Next.js imports API route modules during static page data
  // collection, and we don't want to crash the build when no DB URL is set
  // in the sandbox. The check fires for real at runtime on Vercel.
  if (isProd && !isBuildPhase && (!url || !url.startsWith('libsql://'))) {
    throw new Error(
      '[db] FATAL: production DATABASE_URL must be a libsql:// (Turso) URL. ' +
      'Falling back to local SQLite on Vercel would lose all AdPlacement data. ' +
      'Set DATABASE_URL in your Vercel environment variables.'
    )
  }

  // Turso/libSQL remote connection (production + dev with Turso)
  if (url && url.startsWith('libsql://')) {
    const adapter = new PrismaLibSQL({
      url,
      authToken: process.env.DATABASE_AUTH_TOKEN,
    })
    return new PrismaClient({ adapter })
  }

  // Local SQLite (development fallback only — never reached in production runtime)
  return new PrismaClient({
    log: ['warn', 'error'],
  })
}

export const db =
  globalForPrisma.prisma ??
  createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
