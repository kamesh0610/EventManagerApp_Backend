const express = require('express');
const { body, validationResult } = require('express-validator');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Availability = require('../models/Availability');
const auth = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/bookings
// @desc    Get all bookings for authenticated user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    const query = { managerId: req.user._id };
    if (status) query.status = status;

    const bookings = await Booking.find(query)
      .populate('serviceIds', 'title category price')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Booking.countDocuments(query);

    res.json({
      success: true,
      bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/bookings/:id
// @desc    Get single booking
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      managerId: req.user._id
    }).populate('serviceIds', 'title category price image');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    res.json({
      success: true,
      booking
    });

  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/bookings
// @desc    Create new booking
// @access  Private
router.post('/', auth, [
  body('customerName').trim().isLength({ min: 2, max: 100 }).withMessage('Customer name must be between 2-100 characters'),
  body('customerPhone').matches(/^\+?[1-9]\d{1,14}$/).withMessage('Please enter a valid phone number'),
  body('customerEmail').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('eventType').trim().isLength({ min: 2, max: 100 }).withMessage('Event type must be between 2-100 characters'),
  body('date').isISO8601().withMessage('Please enter a valid date'),
  body('time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?(AM|PM)?$/i).withMessage('Please enter a valid time'),
  body('location').trim().isLength({ min: 5, max: 500 }).withMessage('Location must be between 5-500 characters'),
  body('serviceIds').isArray({ min: 1 }).withMessage('At least one service must be selected'),
  body('totalAmount').isNumeric().isFloat({ min: 0 }).withMessage('Total amount must be a positive number')
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
      date,
      time,
      location,
      serviceIds,
      totalAmount,
      notes
    } = req.body;

    // Verify services belong to the manager
    const services = await Service.find({
      _id: { $in: serviceIds },
      managerId: req.user._id,
      isActive: true
    });

    if (services.length !== serviceIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more services not found or not available'
      });
    }

    // Check availability
    const bookingDate = new Date(date);
    const availability = await Availability.findOne({
      managerId: req.user._id,
      date: {
        $gte: new Date(bookingDate.setHours(0, 0, 0, 0)),
        $lt: new Date(bookingDate.setHours(23, 59, 59, 999))
      }
    });

    if (!availability || availability.status !== 'available') {
      return res.status(400).json({
        success: false,
        message: 'Manager is not available on the selected date'
      });
    }

    // Create booking
    const booking = new Booking({
      customerName,
      customerPhone,
      customerEmail,
      eventType,
      date: new Date(date),
      time,
      location,
      managerId: req.user._id,
      serviceIds,
      totalAmount: parseFloat(totalAmount),
      notes
    });

    await booking.save();

    // Populate services for response
    await booking.populate('serviceIds', 'title category price');

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      booking
    });

  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during booking creation'
    });
  }
});

// @route   PUT /api/bookings/:id/status
// @desc    Update booking status
// @access  Private
router.put('/:id/status', auth, [
  body('status').isIn(['Pending', 'Confirmed', 'Cancelled', 'Completed']).withMessage('Invalid status')
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

    const { status } = req.body;

    const booking = await Booking.findOne({
      _id: req.params.id,
      managerId: req.user._id
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const oldStatus = booking.status;
    booking.status = status;
    await booking.save();

    // Update availability when booking is confirmed or cancelled
    if (status === 'Confirmed' && oldStatus !== 'Confirmed') {
      await updateAvailabilityForBooking(booking, 'booked');
    } else if (status === 'Cancelled' && oldStatus === 'Confirmed') {
      await updateAvailabilityForBooking(booking, 'available');
    }

    res.json({
      success: true,
      message: 'Booking status updated successfully',
      booking
    });

  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during status update'
    });
  }
});

// Helper function to update availability
async function updateAvailabilityForBooking(booking, status) {
  try {
    const bookingDate = new Date(booking.date);
    const availability = await Availability.findOne({
      managerId: booking.managerId,
      date: {
        $gte: new Date(bookingDate.setHours(0, 0, 0, 0)),
        $lt: new Date(bookingDate.setHours(23, 59, 59, 999))
      }
    });

    if (availability) {
      if (status === 'booked') {
        availability.status = 'booked';
        // Mark specific time slots as booked if not full day
        if (!availability.isFullDay) {
          availability.timeSlots.forEach(slot => {
            slot.status = 'booked';
            slot.bookingId = booking._id;
          });
        }
      } else if (status === 'available') {
        availability.status = 'available';
        // Mark time slots as available
        if (!availability.isFullDay) {
          availability.timeSlots.forEach(slot => {
            if (slot.bookingId && slot.bookingId.toString() === booking._id.toString()) {
              slot.status = 'available';
              slot.bookingId = null;
            }
          });
        }
      }
      
      await availability.save();
    }
  } catch (error) {
    console.error('Update availability error:', error);
  }
}

// @route   GET /api/bookings/stats/dashboard
// @desc    Get booking statistics for dashboard
// @access  Private
router.get('/stats/dashboard', auth, async (req, res) => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const stats = await Promise.all([
      // Total bookings
      Booking.countDocuments({ managerId: req.user._id }),
      
      // Pending bookings
      Booking.countDocuments({ managerId: req.user._id, status: 'Pending' }),
      
      // Confirmed bookings
      Booking.countDocuments({ managerId: req.user._id, status: 'Confirmed' }),
      
      // Completed bookings
      Booking.countDocuments({ managerId: req.user._id, status: 'Completed' }),
      
      // Today's events
      Booking.countDocuments({
        managerId: req.user._id,
        date: {
          $gte: new Date(today.setHours(0, 0, 0, 0)),
          $lt: new Date(today.setHours(23, 59, 59, 999))
        },
        status: { $in: ['Confirmed', 'Completed'] }
      }),
      
      // Monthly revenue
      Booking.aggregate([
        {
          $match: {
            managerId: req.user._id,
            status: { $in: ['Confirmed', 'Completed'] },
            createdAt: { $gte: startOfMonth }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' }
          }
        }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        totalBookings: stats[0],
        pendingBookings: stats[1],
        confirmedBookings: stats[2],
        completedBookings: stats[3],
        todaysEvents: stats[4],
        monthlyRevenue: stats[5][0]?.totalRevenue || 0
      }
    });

  } catch (error) {
    console.error('Get booking stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/bookings/analytics/dashboard
// @desc    Get comprehensive dashboard analytics
// @access  Private
router.get('/analytics/dashboard', auth, async (req, res) => {
  try {
    const today = new Date();
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    const analytics = await Promise.all([
      // Total revenue
      Booking.aggregate([
        {
          $match: {
            managerId: req.user._id,
            status: { $in: ['Confirmed', 'Completed'] }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            totalBookings: { $sum: 1 }
          }
        }
      ]),
      
      // Weekly analytics
      Booking.aggregate([
        {
          $match: {
            managerId: req.user._id,
            status: { $in: ['Confirmed', 'Completed'] },
            createdAt: { $gte: startOfWeek }
          }
        },
        {
          $group: {
            _id: null,
            weeklyRevenue: { $sum: '$totalAmount' },
            weeklyBookings: { $sum: 1 }
          }
        }
      ]),
      
      // Monthly analytics
      Booking.aggregate([
        {
          $match: {
            managerId: req.user._id,
            status: { $in: ['Confirmed', 'Completed'] },
            createdAt: { $gte: startOfMonth }
          }
        },
        {
          $group: {
            _id: null,
            monthlyRevenue: { $sum: '$totalAmount' },
            monthlyBookings: { $sum: 1 }
          }
        }
      ]),
      
      // Completed orders
      Booking.countDocuments({
        managerId: req.user._id,
        status: 'Completed'
      }),
      
      // Pending orders
      Booking.countDocuments({
        managerId: req.user._id,
        status: 'Pending'
      }),
      
      // Weekly performance data
      Booking.aggregate([
        {
          $match: {
            managerId: req.user._id,
            status: { $in: ['Confirmed', 'Completed'] },
            createdAt: { $gte: startOfWeek }
          }
        },
        {
          $group: {
            _id: { $dayOfWeek: '$createdAt' },
            bookings: { $sum: 1 },
            revenue: { $sum: '$totalAmount' }
          }
        },
        {
          $sort: { '_id': 1 }
        }
      ])
    ]);

    const totalStats = analytics[0][0] || { totalRevenue: 0, totalBookings: 0 };
    const weeklyStats = analytics[1][0] || { weeklyRevenue: 0, weeklyBookings: 0 };
    const monthlyStats = analytics[2][0] || { monthlyRevenue: 0, monthlyBookings: 0 };
    const completedOrders = analytics[3];
    const pendingOrders = analytics[4];
    const weeklyPerformance = analytics[5];

    // Calculate completion rate
    const completionRate = totalStats.totalBookings > 0 
      ? ((completedOrders / totalStats.totalBookings) * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      analytics: {
        totalRevenue: totalStats.totalRevenue,
        weeklyRevenue: weeklyStats.weeklyRevenue,
        monthlyRevenue: monthlyStats.monthlyRevenue,
        totalBookings: totalStats.totalBookings,
        weeklyBookings: weeklyStats.weeklyBookings,
        monthlyBookings: monthlyStats.monthlyBookings,
        completedOrders,
        pendingOrders,
        completionRate: parseFloat(completionRate),
        weeklyPerformance
      }
    });

  } catch (error) {
    console.error('Get dashboard analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/bookings/completed/recent
// @desc    Get recent completed orders
// @access  Private
router.get('/completed/recent', auth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const completedOrders = await Booking.find({
      managerId: req.user._id,
      status: 'Completed'
    })
      .populate('serviceIds', 'title category')
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      completedOrders
    });

  } catch (error) {
    console.error('Get completed orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;