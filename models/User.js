const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  email: { type: String, required: true },
  frontFileId: { type: String, required: true },
  backFileId: { type: String, required: true },
  status: { type: String, enum: ['waiting', 'approved', 'rejected'], default: 'waiting' },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
