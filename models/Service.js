const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Service title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'Stage Decoration',
      'Balloon Decoration',
      'Floral Arrangement',
      'Makeup Services',
      'Welcome Hosts',
      'Photography & Videography',
      'Live Streaming',
      'DJ Services',
      'Live Music Performers',
      'Traditional Artists',
      'Kids Entertainment',
      'Anchors / Emcees',
      'Mehndi (Henna)',
      'Grooming & Spa',
      'Return Gifts',
      'Invitation & Sign Boards',
      'Food Stalls / Add-ons',
      'Tent & Furniture Rental',
      'Helpers & Crew',
      'Grand Entry Setup'
    ]
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  image: {
    type: String,
    default: null
  },
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EventManager',
    required: [true, 'Manager ID is required']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
serviceSchema.index({ managerId: 1, isActive: 1 });
serviceSchema.index({ category: 1, isActive: 1 });

module.exports = mongoose.model('Service', serviceSchema);