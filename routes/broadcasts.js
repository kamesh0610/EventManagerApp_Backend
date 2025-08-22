const express = require('express');
const { body, validationResult } = require('express-validator');
const BroadcastRequest = require('../models/BroadcastRequest');
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/broadcasts
// @desc    Get broadcast requests for authenticated user (within 10km)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    const query = { status: status || 'Open' };
    
    // In production, implement geospatial queries for 10km radius
    // For now, return all open requests
    const broadcasts = await BroadcastRequest.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await BroadcastRequest.countDocuments(query);

    // Calculate mock distance for demo (in production, use geospatial queries)
    const broadcastsWithDistance = broadcasts.map(broadcast => ({
      ...broadcast.toObject(),
      distance: Math.round(Math.random() * 10 * 100) / 100 // Random distance 0-10km
    }));

    res.json({
      success: true,
      broadcasts: broadcastsWithDistance,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get broadcasts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/broadcasts/:id
// @desc    Get single broadcast request
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const broadcast = await BroadcastRequest.findById(req.params.id);

    if (!broadcast) {
      return res.status(404).json({
        success: false,
        message: 'Broadcast request not found'
      });
    }

    res.json({
      success: true,
      broadcast: {
        ...broadcast.toObject(),
        distance: Math.round(Math.random() * 10 * 100) / 100
      }
    });

  } catch (error) {
    console.error('Get broadcast error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/broadcasts
// @desc    Create new broadcast request (for customers)
// @access  Public
router.post('/', [
  body('customerName').trim().isLength({ min: 2, max: 100 }).withMessage('Customer name must be between 2-100 characters'),
  body('customerPhone').matches(/^\+?[1-9]\d{1,14}$/).withMessage('Please enter a valid phone number'),
  body('customerEmail').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('eventType').trim().isLength({ min: 2, max: 100 }).withMessage('Event type must be between 2-100 characters'),
  body('guestCount').isInt({ min: 1 }).withMessage('Guest count must be at least 1'),
  body('date').isISO8601().withMessage('Please enter a valid date'),
  body('time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?(AM|PM)?$/i).withMessage('Please enter a valid time'),
  body('location').trim().isLength({ min: 5, max: 500 }).withMessage('Location must be between 5-500 characters'),
  body('budget').isNumeric().isFloat({ min: 0 }).withMessage('Budget must be a positive number'),
  body('requirements').trim().isLength({ min: 10, max: 2000 }).withMessage('Requirements must be between 10-2000 characters')
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

    const {
      customerName,
      customerPhone,
      customerEmail,
      eventType,
      guestCount,
      date,
      time,
      location,
      budget,
      requirements
    } = req.body;

    const broadcast = new BroadcastRequest({
      customerName,
      customerPhone,
      customerEmail,
      eventType,
      guestCount: parseInt(guestCount),
      date: new Date(date),
      time,
      location,
      budget: parseFloat(budget),
      requirements
    });

    await broadcast.save();

    res.status(201).json({
      success: true,
      message: 'Broadcast request created successfully',
      broadcast
    });

  } catch (error) {
    console.error('Create broadcast error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during broadcast creation'
    });
  }
});

// @route   PUT /api/broadcasts/:id/accept
// @desc    Accept broadcast request
// @access  Private
router.put('/:id/accept', auth, async (req, res) => {
  try {
    const broadcast = await BroadcastRequest.findById(req.params.id);

    if (!broadcast) {
      return res.status(404).json({
        success: false,
        message: 'Broadcast request not found'
      });
    }

    if (broadcast.status !== 'Open') {
      return res.status(400).json({
        success: false,
        message: 'Broadcast request is no longer available'
      });
    }

    // Update broadcast status
    broadcast.status = 'Accepted';
    broadcast.acceptedBy = req.user._id;
    broadcast.acceptedAt = new Date();
    await broadcast.save();

    // Create a booking from the broadcast request
    const booking = new Booking({
      customerName: broadcast.customerName,
      customerPhone: broadcast.customerPhone,
      customerEmail: broadcast.customerEmail,
      eventType: broadcast.eventType,
      date: broadcast.date,
      time: broadcast.time,
      location: broadcast.location,
      managerId: req.user._id,
      serviceIds: [], // Will be updated when services are selected
      totalAmount: broadcast.budget,
      notes: `From broadcast request: ${broadcast.requirements}`,
      status: 'Pending'
    });

    await booking.save();

    res.json({
      success: true,
      message: 'Broadcast request accepted successfully',
      broadcast,
      booking
    });

  } catch (error) {
    console.error('Accept broadcast error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during broadcast acceptance'
    });
  }
});

// @route   GET /api/broadcasts/my/accepted
// @desc    Get accepted broadcast requests for authenticated user
// @access  Private
router.get('/my/accepted', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const broadcasts = await BroadcastRequest.find({
      acceptedBy: req.user._id
    })
      .sort({ acceptedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await BroadcastRequest.countDocuments({
      acceptedBy: req.user._id
    });

    res.json({
      success: true,
      broadcasts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get accepted broadcasts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/broadcasts/stats/dashboard
// @desc    Get broadcast statistics for dashboard
// @access  Private
router.get('/stats/dashboard', auth, async (req, res) => {
  try {
    const stats = await Promise.all([
      // Total available broadcasts
      BroadcastRequest.countDocuments({ status: 'Open' }),
      
      // Accepted by user
      BroadcastRequest.countDocuments({ acceptedBy: req.user._id }),
      
      // Completed by user
      BroadcastRequest.countDocuments({ 
        acceptedBy: req.user._id, 
        status: 'Completed' 
      })
    ]);

    res.json({
      success: true,
      stats: {
        totalOpen: stats[0],
        accepted: stats[1],
        completed: stats[2]
      }
    });

  } catch (error) {
    console.error('Get broadcast stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;