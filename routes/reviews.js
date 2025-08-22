const express = require('express');
const { body, validationResult } = require('express-validator');
const Review = require('../models/Review');
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/reviews
// @desc    Get all reviews for authenticated manager
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, rating } = req.query;
    
    const query = { managerId: req.user._id, isPublic: true };
    if (rating) query.rating = parseInt(rating);

    const reviews = await Review.find(query)
      .populate('bookingId', 'eventType date')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Review.countDocuments(query);

    // Calculate average rating
    const avgRating = await Review.aggregate([
      { $match: { managerId: req.user._id, isPublic: true } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      stats: {
        averageRating: avgRating[0]?.avgRating || 0,
        totalReviews: avgRating[0]?.totalReviews || 0
      }
    });

  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/reviews
// @desc    Create new review (for customers)
// @access  Public
router.post('/', [
  body('bookingId').isMongoId().withMessage('Invalid booking ID'),
  body('customerName').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2-100 characters'),
  body('customerEmail').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1-5'),
  body('comment').trim().isLength({ min: 10, max: 1000 }).withMessage('Comment must be between 10-1000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { bookingId, customerName, customerEmail, rating, comment } = req.body;

    // Check if booking exists and is completed
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.status !== 'Completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only review completed bookings'
      });
    }

    // Check if review already exists
    const existingReview = await Review.findOne({ bookingId });
    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'Review already exists for this booking'
      });
    }

    // Create review
    const review = new Review({
      bookingId,
      managerId: booking.managerId,
      customerName,
      customerEmail,
      rating: parseInt(rating),
      comment,
      eventType: booking.eventType
    });

    await review.save();

    res.status(201).json({
      success: true,
      message: 'Review created successfully',
      review
    });

  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during review creation'
    });
  }
});

// @route   GET /api/reviews/stats/dashboard
// @desc    Get review statistics for dashboard
// @access  Private
router.get('/stats/dashboard', auth, async (req, res) => {
  try {
    const stats = await Review.aggregate([
      { $match: { managerId: req.user._id, isPublic: true } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
          fiveStars: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
          fourStars: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          threeStars: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          twoStars: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          oneStar: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } }
        }
      }
    ]);

    const result = stats[0] || {
      averageRating: 0,
      totalReviews: 0,
      fiveStars: 0,
      fourStars: 0,
      threeStars: 0,
      twoStars: 0,
      oneStar: 0
    };

    // Calculate customer satisfaction percentage (4+ stars)
    const satisfiedCustomers = result.fiveStars + result.fourStars;
    const customerSatisfaction = result.totalReviews > 0 
      ? ((satisfiedCustomers / result.totalReviews) * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      stats: {
        ...result,
        customerSatisfaction: parseFloat(customerSatisfaction)
      }
    });

  } catch (error) {
    console.error('Get review stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;