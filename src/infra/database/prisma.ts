import { PrismaClient } from '@prisma/client';

if (process.env.DATABASE_URL) {
  let url = process.env.DATABASE_URL;
  if (!url.includes('pgbouncer=true')) {
    if (url.includes('?')) {
      url += '&pgbouncer=true';
    } else {
      url += '?pgbouncer=true';
    }
    process.env.DATABASE_URL = url;
  }
}

const prisma = new PrismaClient();

export default prisma;
