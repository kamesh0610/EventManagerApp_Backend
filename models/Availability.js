const mongoose = require('mongoose');

const timeSlotSchema = new mongoose.Schema({
  startTime: {
    type: String,
    required: [true, 'Start time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please enter a valid time format (HH:MM)']
  },
  endTime: {
    type: String,
    required: [true, 'End time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please enter a valid time format (HH:MM)']
  },
  status: {
    type: String,
    enum: ['available', 'unavailable', 'booked'],
    default: 'available'
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  }
}, { _id: true });

const availabilitySchema = new mongoose.Schema({
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EventManager',
    required: [true, 'Manager ID is required']
  },
  date: {
    type: Date,
    required: [true, 'Date is required']
  },
  timeSlots: [timeSlotSchema],
  isFullDay: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['available', 'unavailable', 'booked'],
    default: 'available'
  }
}, {
  timestamps: true
});

// Compound index to ensure one availability record per manager per date
availabilitySchema.index({ managerId: 1, date: 1 }, { unique: true });

// Validate time slots
availabilitySchema.pre('save', function(next) {
  if (!this.isFullDay && this.timeSlots.length === 0) {
    return next(new Error('Time slots are required when not full day'));
  }
  
  // Validate time slot order
  for (let slot of this.timeSlots) {
    const start = new Date(`2000-01-01T${slot.startTime}:00`);
    const end = new Date(`2000-01-01T${slot.endTime}:00`);
    
    if (start >= end) {
      return next(new Error('End time must be after start time'));
    }
  }
  
  next();
});

module.exports = mongoose.model('Availability', availabilitySchema);