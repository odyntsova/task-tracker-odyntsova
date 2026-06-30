import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10)

  const qa = await prisma.user.upsert({
    where: { email: 'qa@example.com' },
    update: {},
    create: {
      name: 'Kateryna (QA)',
      email: 'qa@example.com',
      passwordHash,
      role: 'QA',
    },
  })

  const dev = await prisma.user.upsert({
    where: { email: 'dev@example.com' },
    update: {},
    create: {
      name: 'Dev User',
      email: 'dev@example.com',
      passwordHash,
      role: 'DEVELOPER',
    },
  })

  await prisma.user.upsert({
    where: { email: 'pm@example.com' },
    update: {},
    create: {
      name: 'PM User',
      email: 'pm@example.com',
      passwordHash,
      role: 'PM',
    },
  })

  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@example.com',
      passwordHash,
      role: 'ADMIN',
    },
  })

  const project = await prisma.project.upsert({
    where: { id: 'seed-project-1' },
    update: {},
    create: {
      id: 'seed-project-1',
      name: 'Task Tracker MVP',
      description: 'Demo project seeded for local development',
    },
  })

  await prisma.task.create({
    data: {
      title: 'Implement login page',
      description: 'Build the login form and wire it to the auth API',
      status: 'DONE',
      priority: 'HIGH',
      projectId: project.id,
      creatorId: dev.id,
      assigneeId: dev.id,
    },
  })

  await prisma.task.create({
    data: {
      title: 'Write login test cases',
      description: 'Cover happy path and negative scenarios',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      projectId: project.id,
      creatorId: qa.id,
      assigneeId: qa.id,
    },
  })

  console.log('Seed complete.')
  console.log('Login with: qa@example.com / password123  (role QA)')
  console.log('         or dev@example.com / password123  (role DEVELOPER)')
  console.log('         or pm@example.com  / password123  (role PM)')
  console.log('         or admin@example.com / password123  (role ADMIN)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
