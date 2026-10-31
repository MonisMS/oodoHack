import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://brightloop:brightloop@localhost:5432/brightloop?schema=public', max: 10 });
export const db = new PrismaClient({ adapter });
