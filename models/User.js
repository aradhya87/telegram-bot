const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: false
  },
  frontFileId: {
    type: String,
    required: false
  },
  backFileId: {
    type: String,
    required: false
  },
  status: {
    type: String,
    enum: ['pending', 'waiting', 'approved', 'rejected'],
    default: 'pending'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);
