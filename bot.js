/*****************************************************************
 * ForexFlock Support + KYC Bot
 * Handles:
 *   ✅ Email & ID uploads
 *   ✅ Admin approve/reject
 *   ✅ MongoDB connection and saving KYC data
 *   ✅ Start notification to admin
 *   ✅ Prevent bot replying after KYC approved
 *   ✅ /verify user command added
 *****************************************************************/

require('dotenv').config();  // Must be first!

console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? 'Loaded' : 'Not loaded');
console.log('MONGO_URI:', process.env.MONGO_URI ? 'Loaded' : 'Not loaded');
console.log('ADMIN_ID:', process.env.ADMIN_ID);

const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

/* Your User model must have email, frontFileId, backFileId, userId, status fields */
const User = require('./models/User');

const ADMIN_ID = parseInt(process.env.ADMIN_ID); // Ensure it's a number

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// In-memory KYC state manager
const users = {};       // userId => { chatId, state, email, front, back, status, started }
const emailToUser = {}; // email => userId (prevent duplicate email)

const STATES = {
  ASK_EMAIL: 'ask_email',
  ASK_FRONT: 'ask_front',
  ASK_BACK: 'ask_back',
  WAITING: 'waiting',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const mainMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: 'Contact Support 📞', callback_data: 'contact_support' }],
      [{ text: 'Check KYC Status 📋', callback_data: 'check_status' }],
      [{ text: 'Help ❓', callback_data: 'help' }]
    ]
  }
};

const isAdmin = (id) => id === ADMIN_ID;

bot.onText(/\/start/, async msg => {
  const { id: chatId } = msg.chat;
  const { id: userId, first_name } = msg.from;

  users[userId] = users[userId] || { chatId, state: null, started: false };

  // Fetch user KYC status from DB
  const dbUser = await User.findOne({ userId });

  if (!users[userId].started) {
    users[userId].started = true;

    // Notify admin about new user start
    bot.sendMessage(ADMIN_ID, `👤 User ${userId} (${first_name || 'Unknown'}) started the bot.`);

    if (dbUser && dbUser.status === 'approved') {
      // User is approved, do NOT reply to user
      return;
    }

    // User is not approved, reply with welcome and buttons
    const commandKeyboard = {
      reply_markup: {
        keyboard: [
          [{ text: '/start' }, { text: '/verify user' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    };

    bot.sendMessage(
      chatId,
      `👋 Hello ${first_name || 'Trader'}! Welcome to ForexFlock support service.`,
      commandKeyboard
    );
  }
});

// New handler for /verify user command
bot.onText(/\/verify user/, async msg => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  const dbUser = await User.findOne({ userId });
  const status = dbUser?.status?.toUpperCase() || 'NOT SUBMITTED';

  bot.sendMessage(chatId, `📋 Your current KYC status is: *${status}*`, { parse_mode: 'Markdown' });
});

bot.on('callback_query', async q => {
  const userId = q.from.id;
  const chatId = q.message.chat.id;
  const data = q.data;
  const user = users[userId] || (users[userId] = { chatId });

  switch (true) {
    case data === 'contact_support':
      user.state = STATES.ASK_EMAIL;
      bot.sendMessage(chatId, 'Please send your *email address*.', { parse_mode: 'Markdown' });
      break;

    case data === 'check_status':
      bot.sendMessage(chatId, `Your KYC status is: *${user.status?.toUpperCase() || 'NOT SUBMITTED'}*`, { parse_mode: 'Markdown' });
      break;

    case data === 'help':
      bot.sendMessage(chatId, '▫️ *Contact Support* – start KYC\n▫️ *Check KYC Status* – see current status\n\n_Admin commands_: /supportlist, /msg <userId> <text>', { parse_mode: 'Markdown' });
      break;

    case data.startsWith('admin_') && isAdmin(userId): {
      const [, action, targetIdStr] = data.split('_');
      const targetId = Number(targetIdStr);
      const target = users[targetId];

      if (!target) {
        await bot.answerCallbackQuery(q.id, { text: 'User not found', show_alert: true });
        return;
      }

      if (action === 'approve') {
        target.state = STATES.APPROVED;
        target.status = 'approved';
        bot.sendMessage(target.chatId, '🎉 Your KYC has been *APPROVED*!', { parse_mode: 'Markdown' });

        // Update in MongoDB
        await User.findOneAndUpdate(
          { userId: targetId },
          { status: 'approved' }
        );
      } else if (action === 'reject') {
        target.state = STATES.REJECTED;
        target.status = 'rejected';
        if (target.email) delete emailToUser[target.email.toLowerCase()];
        bot.sendMessage(target.chatId, '❌ Your KYC was *REJECTED*. Please start again with a different email.', { parse_mode: 'Markdown' });

        // Update in MongoDB
        await User.findOneAndUpdate(
          { userId: targetId },
          { status: 'rejected' }
        );
      }

      // Remove inline buttons after action
      bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: q.message.message_id });
      bot.answerCallbackQuery(q.id, { text: action === 'approve' ? 'Approved' : 'Rejected' });
      break;
    }
  }

  bot.answerCallbackQuery(q.id);
});

bot.on('message', async msg => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text = msg.text;

  // Always allow admin commands
  if (isAdmin(userId) && text?.startsWith('/')) {
    return handleAdminCommand(msg);
  }

  // Fetch user from DB for status check
  const dbUser = await User.findOne({ userId });

  // If approved, do NOT auto reply to user messages
  if (dbUser?.status === 'approved') {
    return; // silent
  }

  const user = users[userId];
  if (!user) return;

  switch (user.state) {
    case STATES.ASK_EMAIL:
      if (!text || !text.includes('@')) {
        return bot.sendMessage(chatId, '⚠️ Please send a *valid* email address.', { parse_mode: 'Markdown' });
      }

      const emailLC = text.toLowerCase();
      if (emailToUser[emailLC] && emailToUser[emailLC] !== userId) {
        return bot.sendMessage(chatId, '🚫 Email already used. Use a *different* one.', { parse_mode: 'Markdown' });
      }

      user.email = text;
      user.state = STATES.ASK_FRONT;
      user.status = 'pending';
      emailToUser[emailLC] = userId;
      bot.sendMessage(chatId, '✅ Email saved. Please upload *front side* of your ID.', { parse_mode: 'Markdown' });
      break;

    case STATES.ASK_FRONT:
    case STATES.ASK_BACK:
    case STATES.WAITING:
      bot.sendMessage(chatId, 'Please continue your KYC by uploading the required ID photo.');
      break;

    case STATES.APPROVED:
    case STATES.REJECTED:
      bot.sendMessage(chatId, 'Session complete. Use /start to begin again.');
      break;
  }
});

bot.on('photo', async msg => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const user = users[userId];
  if (!user || !(user.state === STATES.ASK_FRONT || user.state === STATES.ASK_BACK)) return;

  const fileId = msg.photo[msg.photo.length - 1].file_id;

  if (user.state === STATES.ASK_FRONT) {
    user.front = fileId;
    user.state = STATES.ASK_BACK;
    bot.sendMessage(chatId, 'Front side received ✅\nNow upload *back side* of your ID.', { parse_mode: 'Markdown' });
    await bot.sendMessage(ADMIN_ID, `📥 FRONT ID from user ${userId}\nEmail: ${user.email}`);
    await bot.sendPhoto(ADMIN_ID, fileId, { caption: 'Front side of ID' });

    // Save front photo to MongoDB (create or update user record)
    await User.findOneAndUpdate(
      { userId },
      {
        userId,
        email: user.email,
        frontFileId: fileId,
        status: 'pending'
      },
      { upsert: true, new: true }
    );
  } else if (user.state === STATES.ASK_BACK) {
    user.back = fileId;
    user.state = STATES.WAITING;

    bot.sendMessage(chatId, '✅ Your KYC documents have been submitted successfully.\nPlease wait for approval from our support team.', { parse_mode: 'Markdown' });

    await bot.sendMessage(ADMIN_ID, `📥 BACK ID from user ${userId}\nEmail: ${user.email}`);
    await bot.sendPhoto(ADMIN_ID, fileId, {
      caption: 'Back side of ID – Choose action:',
      reply_markup: {
        inline_keyboard: [[
          { text: 'Approve ✅', callback_data: `admin_approve_${userId}` },
          { text: 'Reject ❌', callback_data: `admin_reject_${userId}` }
        ]]
      }
    });

    // Update back photo & status in MongoDB
    await User.findOneAndUpdate(
      { userId },
      {
        backFileId: fileId,
        status: 'waiting'
      },
      { new: true }
    );
  }
});

function handleAdminCommand(msg) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text === '/supportlist') {
    const waiting = Object.entries(users)
      .filter(([_, u]) => u.state === STATES.WAITING)
      .map(([id, u]) => `${id} – ${u.email || 'N/A'}`);
    return bot.sendMessage(chatId, waiting.length
      ? '*Waiting for review:*\n' + waiting.join('\n')
      : 'No users waiting for review.', { parse_mode: 'Markdown' });
  }

  const match = text.match(/^\/msg\s+(\d+)\s+(.+)/);
  if (match) {
    const [_, idStr, message] = match;
    const targetId = parseInt(idStr);
    if (!users[targetId]) return bot.sendMessage(chatId, 'User not found.');
    return bot.sendMessage(targetId, `💬 *Support*: ${message}`, { parse_mode: 'Markdown' })
      .then(() => bot.sendMessage(chatId, 'Message sent.'))
      .catch(err => bot.sendMessage(chatId, `❌ Failed: ${err.message}`));
  }
}

process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err);
});
