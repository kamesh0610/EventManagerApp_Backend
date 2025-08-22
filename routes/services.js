const express = require('express');
const { body, validationResult } = require('express-validator');
const Service = require('../models/Service');
const auth = require('../middleware/auth');
const { upload, handleMulterError } = require('../middleware/upload');

const router = express.Router();

// @route   GET /api/services
// @desc    Get all services for authenticated user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { category, page = 1, limit = 10 } = req.query;
    
    const query = { managerId: req.user._id, isActive: true };
    if (category) query.category = category;

    const services = await Service.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Service.countDocuments(query);

    res.json({
      success: true,
      services,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/services/:id
// @desc    Get single service
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const service = await Service.findOne({
      _id: req.params.id,
      managerId: req.user._id,
      isActive: true
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.json({
      success: true,
      service
    });

  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/services
// @desc    Create new service
// @access  Private
router.post('/', auth, upload.single('image'), handleMulterError, [
  body('title').trim().isLength({ min: 2, max: 200 }).withMessage('Title must be between 2-200 characters'),
  body('category').isIn([
    'Stage Decoration', 'Balloon Decoration', 'Floral Arrangement', 'Makeup Services',
    'Welcome Hosts', 'Photography & Videography', 'Live Streaming', 'DJ Services',
    'Live Music Performers', 'Traditional Artists', 'Kids Entertainment', 'Anchors / Emcees',
    'Mehndi (Henna)', 'Grooming & Spa', 'Return Gifts', 'Invitation & Sign Boards',
    'Food Stalls / Add-ons', 'Tent & Furniture Rental', 'Helpers & Crew', 'Grand Entry Setup'
  ]).withMessage('Invalid category'),
  body('description').trim().isLength({ min: 10, max: 1000 }).withMessage('Description must be between 10-1000 characters'),
  body('price').isNumeric().isFloat({ min: 0 }).withMessage('Price must be a positive number')
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

    const { title, category, description, price } = req.body;

    const serviceData = {
      title,
      category,
      description,
      price: parseFloat(price),
      managerId: req.user._id
    };

    if (req.file) {
      serviceData.image = `/uploads/services/${req.file.filename}`;
    }

    const service = new Service(serviceData);
    await service.save();

    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      service
    });

  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during service creation'
    });
  }
});

// @route   PUT /api/services/:id
// @desc    Update service
// @access  Private
router.put('/:id', auth, upload.single('image'), handleMulterError, [
  body('title').optional().trim().isLength({ min: 2, max: 200 }).withMessage('Title must be between 2-200 characters'),
  body('category').optional().isIn([
    'Stage Decoration', 'Balloon Decoration', 'Floral Arrangement', 'Makeup Services',
    'Welcome Hosts', 'Photography & Videography', 'Live Streaming', 'DJ Services',
    'Live Music Performers', 'Traditional Artists', 'Kids Entertainment', 'Anchors / Emcees',
    'Mehndi (Henna)', 'Grooming & Spa', 'Return Gifts', 'Invitation & Sign Boards',
    'Food Stalls / Add-ons', 'Tent & Furniture Rental', 'Helpers & Crew', 'Grand Entry Setup'
  ]).withMessage('Invalid category'),
  body('description').optional().trim().isLength({ min: 10, max: 1000 }).withMessage('Description must be between 10-1000 characters'),
  body('price').optional().isNumeric().isFloat({ min: 0 }).withMessage('Price must be a positive number')
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

    const service = await Service.findOne({
      _id: req.params.id,
      managerId: req.user._id,
      isActive: true
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    const { title, category, description, price } = req.body;

    if (title) service.title = title;
    if (category) service.category = category;
    if (description) service.description = description;
    if (price) service.price = parseFloat(price);

    if (req.file) {
      service.image = `/uploads/services/${req.file.filename}`;
    }

    await service.save();

    res.json({
      success: true,
      message: 'Service updated successfully',
      service
    });

  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during service update'
    });
  }
});

// @route   DELETE /api/services/:id
// @desc    Delete service (soft delete)
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const service = await Service.findOne({
      _id: req.params.id,
      managerId: req.user._id,
      isActive: true
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    service.isActive = false;
    await service.save();

    res.json({
      success: true,
      message: 'Service deleted successfully'
    });

  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during service deletion'
    });
  }
});

// @route   GET /api/services/categories/list
// @desc    Get all service categories
// @access  Public
router.get('/categories/list', (req, res) => {
  const categories = [
    'Stage Decoration', 'Balloon Decoration', 'Floral Arrangement', 'Makeup Services',
    'Welcome Hosts', 'Photography & Videography', 'Live Streaming', 'DJ Services',
    'Live Music Performers', 'Traditional Artists', 'Kids Entertainment', 'Anchors / Emcees',
    'Mehndi (Henna)', 'Grooming & Spa', 'Return Gifts', 'Invitation & Sign Boards',
    'Food Stalls / Add-ons', 'Tent & Furniture Rental', 'Helpers & Crew', 'Grand Entry Setup'
  ];

  res.json({
    success: true,
    categories
  });
});

module.exports = router;