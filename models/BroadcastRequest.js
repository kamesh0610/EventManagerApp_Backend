const mongoose = require('mongoose');

const broadcastRequestSchema = new mongoose.Schema({
  customerName: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  customerPhone: {
    type: String,
    required: [true, 'Customer phone is required'],
    match: [/^\+?[1-9]\d{1,14}$/, 'Please enter a valid phone number']
  },
  customerEmail: {
    type: String,
    required: [true, 'Customer email is required'],
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  eventType: {
    type: String,
    required: [true, 'Event type is required'],
    maxlength: [100, 'Event type cannot exceed 100 characters']
  },
  guestCount: {
    type: Number,
    required: [true, 'Guest count is required'],
    min: [1, 'Guest count must be at least 1']
  },
  date: {
    type: Date,
    required: [true, 'Event date is required'],
    validate: {
      validator: function(value) {
        return value > new Date();
      },
      message: 'Event date must be in the future'
    }
  },
  time: {
    type: String,
    required: [true, 'Event time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?(AM|PM)?$/i, 'Please enter a valid time']
  },
  location: {
    type: String,
    required: [true, 'Event location is required'],
    maxlength: [500, 'Location cannot exceed 500 characters']
  },
  budget: {
    type: Number,
    required: [true, 'Budget is required'],
    min: [0, 'Budget cannot be negative']
  },
  requirements: {
    type: String,
    required: [true, 'Requirements are required'],
    maxlength: [2000, 'Requirements cannot exceed 2000 characters']
  },
  status: {
    type: String,
    enum: ['Open', 'Accepted', 'Expired', 'Completed'],
    default: 'Open'
  },
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EventManager',
    default: null
  },
  acceptedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
broadcastRequestSchema.index({ status: 1, expiresAt: 1 });
broadcastRequestSchema.index({ acceptedBy: 1 });
broadcastRequestSchema.index({ date: 1 });

// Auto-expire old requests
broadcastRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('BroadcastRequest', broadcastRequestSchema);