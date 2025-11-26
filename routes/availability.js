const express = require('express');
const router = express.Router();
const Availability = require('../models/Availability');
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');

// Get all availability for a manager
router.get('/', auth, async (req, res) => {
  try {
    const { month, year } = req.query;
    const managerId = req.user.id;

    let query = { managerId };

    // Filter by month and year if provided
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      query.date = {
        $gte: startDate,
        $lte: endDate
      };
    }

    const availability = await Availability.find(query)
      .populate('timeSlots.bookingId')
      .sort({ date: 1 });

    res.json({
      success: true,
      availability
    });
  } catch (error) {
    console.error('Get availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch availability'
    });
  }
});

// Get availability for specific date
router.get('/:date', auth, async (req, res) => {
  try {
    const { date } = req.params;
    const managerId = req.user.id;

    const availability = await Availability.findOne({
      managerId,
      date: new Date(date)
    }).populate('timeSlots.bookingId');

    res.json({
      success: true,
      availability
    });
  } catch (error) {
    console.error('Get date availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch availability for date'
    });
  }
});

// Set availability
router.post('/', auth, async (req, res) => {
  try {
    const { 
      date, 
      timeSlots = [], 
      isFullDay = false, 
      status = 'available', 
      weekendAvailability = { saturday: true, sunday: true }, 
      notes = '',
      setAllWeekends = false 
    } = req.body;
    const managerId = req.user.id;

    // Check if it's the 1st day of the month
    const targetDate = new Date(date);
    if (targetDate.getDate() === 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot set availability for the 1st day of the month'
      });
    }

    // Handle setting all weekends in a month
    if (setAllWeekends) {
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      const weekendDates = [];
      
      for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month, day);
        const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
        const isFirstDay = currentDate.getDate() === 1;
        
        if (isWeekend && !isFirstDay) {
          weekendDates.push(currentDate);
        }
      }
      
      // Set availability for all weekend dates
      const results = [];
      for (const weekendDate of weekendDates) {
        let availability = await Availability.findOne({
          managerId,
          date: weekendDate
        });

        const weekendAvail = {
          saturday: weekendDate.getDay() === 6,
          sunday: weekendDate.getDay() === 0
        };

        if (availability) {
          availability.timeSlots = timeSlots.length > 0 ? timeSlots : [{
            startTime: '00:00',
            endTime: '23:59',
            status: 'available'
          }];
          availability.isFullDay = isFullDay;
          availability.status = status;
          availability.weekendAvailability = weekendAvail;
          availability.notes = notes;
        } else {
          availability = new Availability({
            managerId,
            date: weekendDate,
            timeSlots: timeSlots.length > 0 ? timeSlots : [{
              startTime: '00:00',
              endTime: '23:59',
              status: 'available'
            }],
            isFullDay: isFullDay,
            status,
            weekendAvailability: weekendAvail,
            notes
          });
        }

        await availability.save();
        results.push(availability);
      }
      
      return res.json({
        success: true,
        availability: results,
        message: `Weekend availability set for ${results.length} dates`
      });
    }

    // Check if availability already exists for this date
    let availability = await Availability.findOne({
      managerId,
      date: targetDate
    });

    if (availability) {
      // Update existing availability
      availability.timeSlots = timeSlots;
      availability.isFullDay = isFullDay;
      availability.status = status;
      availability.weekendAvailability = weekendAvailability;
      availability.notes = notes;
    } else {
      // Create new availability
      availability = new Availability({
        managerId,
        date: targetDate,
        timeSlots,
        isFullDay,
        status,
        weekendAvailability,
        notes
      });
    }

    await availability.save();

    res.json({
      success: true,
      availability,
      message: 'Availability set successfully'
    });
  } catch (error) {
    console.error('Set availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set availability',
      error: error.message
    });
  }
});

// Update availability
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { timeSlots, isFullDay, status, weekendAvailability, notes } = req.body;
    const managerId = req.user.id;

    const availability = await Availability.findOne({
      _id: id,
      managerId
    });

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'Availability not found'
      });
    }

    // Check if it's the 1st day of the month
    if (availability.date.getDate() === 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify availability for the 1st day of the month'
      });
    }

    // Update fields
    if (timeSlots !== undefined) availability.timeSlots = timeSlots;
    if (isFullDay !== undefined) availability.isFullDay = isFullDay;
    if (status !== undefined) availability.status = status;
    if (weekendAvailability !== undefined) availability.weekendAvailability = weekendAvailability;
    if (notes !== undefined) availability.notes = notes;

    await availability.save();

    res.json({
      success: true,
      availability,
      message: 'Availability updated successfully'
    });
  } catch (error) {
    console.error('Update availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update availability'
    });
  }
});

// Delete availability
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const managerId = req.user.id;

    const availability = await Availability.findOne({
      _id: id,
      managerId
    });

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'Availability not found'
      });
    }

    // Check if it's the 1st day of the month
    if (availability.date.getDate() === 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete availability for the 1st day of the month'
      });
    }

    await Availability.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Availability deleted successfully'
    });
  } catch (error) {
    console.error('Delete availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete availability'
    });
  }
});

// Get calendar data for a specific month
router.get('/calendar/:month/:year', auth, async (req, res) => {
  try {
    const { month, year } = req.params;
    const managerId = req.user.id;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    // Get availability data
    const availability = await Availability.find({
      managerId,
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ date: 1 });

    // Get bookings for the month
    const bookings = await Booking.find({
      managerId,
      date: {
        $gte: startDate,
        $lte: endDate
      },
      status: { $in: ['Pending', 'Confirmed'] }
    }).sort({ date: 1 });

    // Convert bookings to events
    const events = bookings.map(booking => ({
      id: booking._id,
      title: `${booking.eventType} - ${booking.customerName}`,
      customerName: booking.customerName,
      date: booking.date,
      time: booking.time,
      status: booking.status,
      totalAmount: booking.totalAmount,
      location: booking.location
    }));

    res.json({
      success: true,
      availability,
      events,
      message: 'Calendar data fetched successfully'
    });
  } catch (error) {
    console.error('Get calendar data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch calendar data'
    });
  }
});

// Check availability for a specific date and time
router.post('/check', auth, async (req, res) => {
  try {
    const { managerId, date, time } = req.body;

    const availability = await Availability.findOne({
      managerId: managerId || req.user.id,
      date: new Date(date)
    });

    if (!availability) {
      return res.json({
        success: true,
        available: false,
        message: 'No availability set for this date'
      });
    }

    if (availability.status === 'unavailable') {
      return res.json({
        success: true,
        available: false,
        message: 'Date is marked as unavailable'
      });
    }

    if (availability.isFullDay) {
      return res.json({
        success: true,
        available: availability.status === 'available',
        message: availability.status === 'available' ? 'Available full day' : 'Not available'
      });
    }

    // Check specific time slots if time is provided
    if (time && availability.timeSlots.length > 0) {
      const timeSlot = availability.timeSlots.find(slot => 
        slot.startTime <= time && slot.endTime >= time && slot.status === 'available'
      );

      return res.json({
        success: true,
        available: !!timeSlot,
        message: timeSlot ? 'Time slot available' : 'Time slot not available'
      });
    }

    res.json({
      success: true,
      available: availability.status === 'available',
      availability
    });
  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check availability'
    });
  }
});

module.exports = router;