require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const loginRouter = require('./login');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());  // To parse JSON body
app.use('/api', loginRouter);

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Your bot code here (basic example)
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, `Hello ${msg.from.first_name || 'User'}! Welcome to the bot.`);
});

bot.on('message', (msg) => {
  // Handle other messages
  if (msg.text && !msg.text.startsWith('/start')) {
    bot.sendMessage(msg.chat.id, `You said: ${msg.text}`);
  }
});

// Keep Express server running
app.get('/', (req, res) => {
  res.send('Telegram bot server is running.');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
