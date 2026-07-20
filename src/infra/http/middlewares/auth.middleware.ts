import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../../auth/TokenService.ts';
import prisma from '../../database/prisma.ts';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: 'ADMIN' | 'ELECTRICIAN';
    username: string;
    name: string;
  };
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    let token = '';
    const authHeader = req.headers.authorization;
    
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2) {
        token = parts[1];
      }
    } else if (req.query.token) {
      token = req.query.token as string;
    }

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = TokenService.verify(token);

    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Verify user actually exists in the database to prevent stale token operations and audit log DB constraint errors
    const userExists = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true }
    });

    if (!userExists) {
      return res.status(401).json({ error: 'Usuário não encontrado ou inativo. Faça login novamente.' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Erro na autenticação:', error);
    return res.status(500).json({ error: 'Erro de servidor durante autenticação' });
  }
};

export const adminMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

export const roleMiddleware = (roles: ('ADMIN' | 'ELECTRICIAN')[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
};
