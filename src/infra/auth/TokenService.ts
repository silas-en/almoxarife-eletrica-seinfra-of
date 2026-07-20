import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export class TokenService {
  static generate(payload: any): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  }

  static verify(token: string): any {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  }
}
