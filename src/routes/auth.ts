import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db/connection';
import { generateToken } from '../middleware/auth';
import { UserRole } from '../types';

const router = express.Router();

/**
 * POST /auth/register
 * Création d'un compte (simplifié pour hackathon)
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, xrpl_address } = req.body;

    if (!name || !role || !['worker', 'employer', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Name and valid role are required' });
    }

    let password_hash: string | null = null;
    if (password) {
      password_hash = await bcrypt.hash(password, 10);
    }

    const result = await pool.query(
      `INSERT INTO users (name, email, role, password_hash, xrpl_address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, xrpl_address, created_at`,
      [name, email || null, role, password_hash, xrpl_address || null]
    );

    const user = result.rows[0];
    const token = generateToken(user.id, user.role);

    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        xrpl_address: user.xrpl_address,
      },
      token,
    });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /auth/login
 * Connexion (email/password ou simple avec name pour démo)
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, name, password } = req.body;

    let query = 'SELECT * FROM users WHERE ';
    const params: any[] = [];

    if (email) {
      query += 'email = $1';
      params.push(email);
    } else if (name) {
      query += 'name = $1';
      params.push(name);
    } else {
      return res.status(400).json({ error: 'Email or name required' });
    }

    const result = await pool.query(query, params);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Vérifier le mot de passe si fourni
    if (password && user.password_hash) {
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    }

    const token = generateToken(user.id, user.role);

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        xrpl_address: user.xrpl_address,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;

