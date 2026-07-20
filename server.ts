import express from 'express';
import ViteExpress from 'vite-express';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import prisma from './src/infra/database/prisma.ts';
import { authRouter } from './src/infra/http/routes/auth.routes.ts';
import { materialRouter } from './src/infra/http/routes/material.routes.ts';
import { demandRouter } from './src/infra/http/routes/demand.routes.ts';
import { userRouter } from './src/infra/http/routes/user.routes.ts';
import { reportRouter } from './src/infra/http/routes/report.routes.ts';
import { vehicleRouter } from './src/infra/http/routes/vehicle.routes.ts';
import { toolRouter } from './src/infra/http/routes/tool.routes.ts';
import { recoveredRouter } from './src/infra/http/routes/recovered.routes.ts';
import { equipmentRouter } from './src/infra/http/routes/equipment.routes.ts';
import { ciRouter } from './src/infra/http/routes/ci.routes.ts';

dotenv.config();

const app = express();
const port = 3000;

app.use(express.json());
app.use('/uploads', express.static('public/uploads'));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/materials', materialRouter);
app.use('/api/demands', demandRouter);
app.use('/api/reports', reportRouter);
app.use('/api/vehicles', vehicleRouter);
app.use('/api/tools', toolRouter);
app.use('/api/recovered', recoveredRouter);
app.use('/api/equipments', equipmentRouter);
app.use('/api/cis', ciRouter);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Error:', err);
  
  const isDbError = err && (
    err.name === 'PrismaClientInitializationError' ||
    err.name === 'PrismaClientKnownRequestError' ||
    err.name === 'PrismaClientUnknownRequestError' ||
    err.name === 'PrismaClientValidationError' ||
    String(err.message).includes('database') ||
    String(err.message).includes('postgres') ||
    String(err.message).includes('connection')
  );

  if (isDbError) {
    return res.status(500).send({ 
      error: 'Erro de conexão com o banco de dados. Verifique se a variável DATABASE_URL está configurada corretamente nas configurações do projeto.',
      details: err.message
    });
  }

  res.status(500).send({ error: 'Something went wrong!' });
});

async function main() {
  let dbInitialized = false;

  if (!process.env.DATABASE_URL) {
    console.warn('WARNING: DATABASE_URL is not set. Prisma will fail if it tries to connect.');
  } else {
    try {
      // Ensure Silas exists with correct password and status
      const hashedPassword = await bcrypt.hash('87304508', 10);
      await prisma.user.upsert({
        where: { username: 'silas' },
        update: {
          password: hashedPassword,
          status: 'APPROVED',
          role: 'ADMIN',
          name: 'Silas Paixão'
        },
        create: {
          username: 'silas',
          password: hashedPassword,
          name: 'Silas Paixão',
          role: 'ADMIN',
          status: 'APPROVED'
        }
      });

      // Fallback admin
      const adminExists = await prisma.user.findUnique({
        where: { username: 'admin' }
      });

      if (!adminExists) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await prisma.user.create({
          data: {
            username: 'admin',
            password: hashedPassword,
            name: 'Administrador Sistema',
            role: 'ADMIN',
            status: 'APPROVED'
          }
        });
      }

      dbInitialized = true;
      console.log('Database initialized and seeded successfully.');
    } catch (dbErr) {
      console.error('WARNING: Database initialization/seeding failed during startup. The application will run, but database queries will fail until DATABASE_URL is configured correctly:');
      if (dbErr instanceof Error) {
        console.error('Message:', dbErr.message);
        console.error('Stack:', dbErr.stack);
      } else {
        console.error(dbErr);
      }
    }
  }

  try {
    ViteExpress.listen(app, port, () => {
      console.log(`Server is listening on port ${port}...`);
      if (!dbInitialized) {
        console.warn('⚠️ Server started WITHOUT active database connection. Please check your DATABASE_URL environment variable in the Settings menu.');
      }
    });
  } catch (err) {
    console.error('CRITICAL: Server failed to start during initialization:');
    if (err instanceof Error) {
      console.error('Message:', err.message);
      console.error('Stack:', err.stack);
    } else {
      console.error('Unknown error:', err);
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
