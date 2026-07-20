import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../database/prisma.ts';
import { TokenService } from '../../auth/TokenService.ts';

export class AuthController {
  static async login(req: Request, res: Response) {
    try {
      const { username, password } = req.body;

      const user = await prisma.user.findUnique({
        where: { username },
      });

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (user.status !== 'APPROVED') {
        return res.status(403).json({ error: `Account status: ${user.status}` });
      }

      const token = TokenService.generate({
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      });

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async register(req: Request, res: Response) {
    try {
      const { username, password, name, role } = req.body;

      const existingUser = await prisma.user.findUnique({
        where: { username },
      });

      if (existingUser) {
        return res.status(400).json({ error: 'Username already taken' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          username,
          password: hashedPassword,
          name,
          role: role || 'ELECTRICIAN',
          status: 'PENDING',
        },
      });

      res.status(201).json({
        message: 'Registration requested. Wait for admin approval.',
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
