import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

export const ACCESS_TOKEN_TTL = '15m'
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export function signAccessToken(user: { id: string; role: string }): string {
  return jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET!, {
    expiresIn: ACCESS_TOKEN_TTL,
  })
}

/** Opaque random refresh token (returned to the client). */
export function generateRefreshTokenValue(): string {
  return crypto.randomBytes(40).toString('hex')
}

/** Only the hash of a refresh token is ever stored in the DB. */
export function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

/**
 * Issues an access token plus a fresh refresh token, persisting the refresh
 * token's hash. Returns the raw refresh token for the client.
 */
export async function issueTokens(prisma: PrismaClient, user: { id: string; role: string }) {
  const accessToken = signAccessToken(user)
  const refreshToken = generateRefreshTokenValue()

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  })

  return { accessToken, refreshToken }
}
