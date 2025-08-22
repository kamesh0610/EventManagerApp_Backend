const express = require('express');
const { body, validationResult } = require('express-validator');
const Availability = require('../models/Availability');
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/availability
// @desc    Get availability for authenticated user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { month, year } = req.query;
    
    let query = { managerId: req.user._id };
    
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      
      query.date = {
        $gte: startDate,
        $lte: endDate
      };
    }

    const availability = await Availability.find(query)
      .populate('timeSlots.bookingId', 'customerName eventType')
      .sort({ date: 1 });

    res.json({
      success: true,
      availability
    });

  } catch (error) {
    console.error('Get availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/availability/:date
// @desc    Get availability for specific date
// @access  Private
router.get('/:date', auth, async (req, res) => {
  try {
    const date = new Date(req.params.date);
    
    const availability = await Availability.findOne({
      managerId: req.user._id,
      date: {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lt: new Date(date.setHours(23, 59, 59, 999))
      }
    }).populate('timeSlots.bookingId', 'customerName eventType');

    res.json({
      success: true,
      availability
    });

  } catch (error) {
    console.error('Get date availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/availability
// @desc    Set availability for a date
// @access  Private
router.post('/', auth, [
  body('date').isISO8601().withMessage('Please enter a valid date'),
  body('isFullDay').isBoolean().withMessage('isFullDay must be a boolean'),
  body('status').isIn(['available', 'unavailable']).withMessage('Invalid status'),
  body('timeSlots').optional().isArray().withMessage('Time slots must be an array')
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

    const { date, isFullDay, status, timeSlots = [] } = req.body;
    const availabilityDate = new Date(date);

    // Check if availability already exists for this date
    let availability = await Availability.findOne({
      managerId: req.user._id,
      date: {
        $gte: new Date(availabilityDate.setHours(0, 0, 0, 0)),
        $lt: new Date(availabilityDate.setHours(23, 59, 59, 999))
      }
    });

    if (availability) {
      // Update existing availability
      availability.isFullDay = isFullDay;
      availability.status = status;
      availability.timeSlots = timeSlots;
    } else {
      // Create new availability
      availability = new Availability({
        managerId: req.user._id,
        date: new Date(date),
        isFullDay,
        status,
        timeSlots
      });
    }

    await availability.save();

    res.json({
      success: true,
      message: 'Availability updated successfully',
      availability
    });

  } catch (error) {
    console.error('Set availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during availability update'
    });
  }
});

// @route   PUT /api/availability/:id
// @desc    Update availability
// @access  Private
router.put('/:id', auth, [
  body('isFullDay').optional().isBoolean().withMessage('isFullDay must be a boolean'),
  body('status').optional().isIn(['available', 'unavailable', 'booked']).withMessage('Invalid status'),
  body('timeSlots').optional().isArray().withMessage('Time slots must be an array')
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

    const availability = await Availability.findOne({
      _id: req.params.id,
      managerId: req.user._id
    });

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'Availability not found'
      });
    }

    const { isFullDay, status, timeSlots } = req.body;

    if (isFullDay !== undefined) availability.isFullDay = isFullDay;
    if (status !== undefined) availability.status = status;
    if (timeSlots !== undefined) availability.timeSlots = timeSlots;

    await availability.save();

    res.json({
      success: true,
      message: 'Availability updated successfully',
      availability
    });

  } catch (error) {
    console.error('Update availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during availability update'
    });
  }
});

// @route   DELETE /api/availability/:id
// @desc    Delete availability
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const availability = await Availability.findOne({
      _id: req.params.id,
      managerId: req.user._id
    });

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'Availability not found'
      });
    }

    // Check if there are any bookings for this date
    const bookingsExist = await Booking.findOne({
      managerId: req.user._id,
      date: {
        $gte: new Date(availability.date.setHours(0, 0, 0, 0)),
        $lt: new Date(availability.date.setHours(23, 59, 59, 999))
      },
      status: { $in: ['Confirmed', 'Pending'] }
    });

    if (bookingsExist) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete availability with existing bookings'
      });
    }

    await Availability.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Availability deleted successfully'
    });

  } catch (error) {
    console.error('Delete availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during availability deletion'
    });
  }
});

// @route   GET /api/availability/calendar/:month/:year
// @desc    Get calendar data for specific month
// @access  Private
router.get('/calendar/:month/:year', auth, async (req, res) => {
  try {
    const { month, year } = req.params;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    // Get availability data
    const availability = await Availability.find({
      managerId: req.user._id,
      date: {
        $gte: startDate,
        $lte: endDate
      }
    });

    // Get bookings for the month
    const bookings = await Booking.find({
      managerId: req.user._id,
      date: {
        $gte: startDate,
        $lte: endDate
      },
      status: { $in: ['Confirmed', 'Pending'] }
    }).populate('serviceIds', 'title');

    // Create calendar events
    const calendarEvents = bookings.map(booking => ({
      id: booking._id,
      title: `${booking.eventType} - ${booking.customerName}`,
      date: booking.date,
      time: booking.time,
      type: 'booking',
      bookingId: booking._id,
      customerName: booking.customerName,
      location: booking.location,
      status: booking.status
    }));

    res.json({
      success: true,
      availability,
      events: calendarEvents
    });

  } catch (error) {
    console.error('Get calendar data error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/availability/check
// @desc    Check availability for specific date and time
// @access  Public
router.post('/check', [
  body('managerId').isMongoId().withMessage('Invalid manager ID'),
  body('date').isISO8601().withMessage('Please enter a valid date'),
  body('time').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?(AM|PM)?$/i).withMessage('Please enter a valid time')
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

    const { managerId, date, time } = req.body;
    const checkDate = new Date(date);

    // Get availability for the date
    const availability = await Availability.findOne({
      managerId,
      date: {
        $gte: new Date(checkDate.setHours(0, 0, 0, 0)),
        $lt: new Date(checkDate.setHours(23, 59, 59, 999))
      }
    });

    if (!availability || availability.status !== 'available') {
      return res.json({
        success: true,
        available: false,
        message: 'Manager is not available on this date'
      });
    }

    // Check for existing bookings
    const existingBooking = await Booking.findOne({
      managerId,
      date: {
        $gte: new Date(checkDate.setHours(0, 0, 0, 0)),
        $lt: new Date(checkDate.setHours(23, 59, 59, 999))
      },
      status: { $in: ['Confirmed', 'Pending'] }
    });

    if (existingBooking) {
      return res.json({
        success: true,
        available: false,
        message: 'Manager already has a booking on this date'
      });
    }

    res.json({
      success: true,
      available: true,
      message: 'Manager is available',
      availability
    });

  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;