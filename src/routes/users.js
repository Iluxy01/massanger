const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const authMiddleware = require('../middleware/auth');
const bcrypt = require('bcryptjs');

// Поиск пользователей
router.get('/search', authMiddleware, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  try {
    const result = await pool.query(
      `SELECT id, username, display_name, avatar FROM users 
       WHERE (username ILIKE $1 OR display_name ILIKE $1) AND id != $2
       LIMIT 20`,
      [`%${q}%`, req.user.id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить свой профиль
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, display_name, avatar, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить профиль
router.put('/me', authMiddleware, async (req, res) => {
  const { display_name, password } = req.body;

  try {
    if (display_name) {
      await pool.query(
        'UPDATE users SET display_name = $1 WHERE id = $2',
        [display_name, req.user.id]
      );
    }
    if (password && password.length >= 6) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [hash, req.user.id]
      );
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;