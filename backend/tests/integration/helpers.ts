import request from 'supertest'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { app } from '../../src/app'

export const prisma = new PrismaClient()
export { app, request }

export async function cleanDb() {
  // FK-safe order
  await prisma.comment.deleteMany()
  await prisma.ticket.deleteMany()
  await prisma.epic.deleteMany()
  await prisma.team.deleteMany()
  await prisma.refreshToken.deleteMany()
  await prisma.passwordResetToken.deleteMany()
  await prisma.emailVerificationToken.deleteMany()
  await prisma.user.deleteMany()
}

export async function createVerifiedUser(email = 'user@example.com') {
  return prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash('password123', 10),
      emailVerifiedAt: new Date(),
    },
  })
}

export function bearer(userId: string) {
  return `Bearer ${jwt.sign({ userId }, process.env.JWT_SECRET!)}`
}

/** A verified user + auth header, ready to hit business endpoints. */
export async function authedUser(email = 'user@example.com') {
  const user = await createVerifiedUser(email)
  return { user, auth: bearer(user.id) }
}
