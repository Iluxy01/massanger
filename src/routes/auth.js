const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/index');

// Регистрация
router.post('/register', async (req, res) => {
  const { username, display_name, password } = req.body;

  if (!username || !display_name || !password) {
    return res.status(400).json({ error: 'Заполни все поля' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  }

  try {
    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1', [username]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Такой пользователь уже существует' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, display_name, password_hash) 
       VALUES ($1, $2, $3) RETURNING id, username, display_name, avatar`,
      [username, display_name, passwordHash]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ ...user, token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Вход
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Заполни все поля' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1', [username]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Неверный логин или пароль' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(400).json({ error: 'Неверный логин или пароль' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar: user.avatar,
      token,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;