const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const authMiddleware = require('../middleware/auth');

// Получить все чаты пользователя
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id, c.name, c.is_group,
        (SELECT text FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
        (SELECT COUNT(*) FROM messages WHERE chat_id = c.id AND is_read = false AND sender_id != $1) as unread_count,
        array_agg(cm.user_id) as member_ids
      FROM chats c
      JOIN chat_members cm ON c.id = cm.chat_id
      WHERE c.id IN (SELECT chat_id FROM chat_members WHERE user_id = $1)
      GROUP BY c.id
      ORDER BY last_message_time DESC NULLS LAST
    `, [req.user.id]);

    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать личный чат
router.post('/direct', authMiddleware, async (req, res) => {
  const { target_user_id } = req.body;
  const myId = req.user.id;

  try {
    // Проверяем существует ли уже чат между этими двумя
    const existing = await pool.query(`
      SELECT c.id FROM chats c
      JOIN chat_members cm1 ON c.id = cm1.chat_id AND cm1.user_id = $1
      JOIN chat_members cm2 ON c.id = cm2.chat_id AND cm2.user_id = $2
      WHERE c.is_group = false
    `, [myId, target_user_id]);

    if (existing.rows.length > 0) {
      return res.json({ id: existing.rows[0].id });
    }

    const targetUser = await pool.query(
      'SELECT display_name FROM users WHERE id = $1', [target_user_id]
    );
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const chat = await pool.query(
      `INSERT INTO chats (name, is_group, created_by) VALUES ($1, false, $2) RETURNING id`,
      [targetUser.rows[0].display_name, myId]
    );

    const chatId = chat.rows[0].id;
    await pool.query(
      'INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2), ($1, $3)',
      [chatId, myId, target_user_id]
    );

    res.json({ id: chatId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать групповой чат
router.post('/group', authMiddleware, async (req, res) => {
  const { name, member_ids } = req.body;
  const myId = req.user.id;

  if (!name || !member_ids || member_ids.length < 2) {
    return res.status(400).json({ error: 'Нужно название и минимум 2 участника' });
  }

  try {
    const chat = await pool.query(
      `INSERT INTO chats (name, is_group, created_by) VALUES ($1, true, $2) RETURNING id`,
      [name, myId]
    );

    const chatId = chat.rows[0].id;
    const allMembers = [...new Set([myId, ...member_ids])];

    for (const userId of allMembers) {
      await pool.query(
        'INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2)',
        [chatId, userId]
      );
    }

    res.json({ id: chatId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить сообщения чата
router.get('/:chatId/messages', authMiddleware, async (req, res) => {
  const { chatId } = req.params;

  try {
    // Проверяем что пользователь — участник чата
    const member = await pool.query(
      'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
      [chatId, req.user.id]
    );
    if (member.rows.length === 0) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const result = await pool.query(
      `SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC`,
      [chatId]
    );

    // Помечаем сообщения как прочитанные
    await pool.query(
      `UPDATE messages SET is_read = true 
       WHERE chat_id = $1 AND sender_id != $2 AND is_read = false`,
      [chatId, req.user.id]
    );

    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;