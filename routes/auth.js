const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const EventManager = require('../models/EventManager');
const auth = require('../middleware/auth');
const axios = require('axios');

const router = express.Router();

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Password validation middleware
const passwordValidation = [
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
    .withMessage('Password must contain at least one symbol')
];

// @route   POST /api/auth/register
// @desc    Register new event manager
// @access  Public
router.post('/register', [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2-100 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('phone').matches(/^\+?[1-9]\d{1,14}$/).withMessage('Please enter a valid phone number'),
  body('address').trim().isLength({ min: 5, max: 500 }).withMessage('Address must be between 5-500 characters'),
  ...passwordValidation
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

    const { name, email, phone, password, address, lat, lng } = req.body;

    // Check if user already exists
    const existingUser = await EventManager.findOne({
      $or: [{ email }, { phone }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or phone number'
      });
    }

    // Create new user
    const eventManager = new EventManager({
      name,
      email,
      phone,
      password,
      location: {
        lat: lat || 28.6139,
        lng: lng || 77.2090,
        address
      }
    });

    await eventManager.save();

    // Generate token
    const token = generateToken(eventManager._id);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: eventManager
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login event manager
// @access  Public
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
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

    const { email, password } = req.body;

    // Find user and include password
    const eventManager = await EventManager.findOne({ email }).select('+password');

    if (!eventManager) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await eventManager.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    eventManager.lastLogin = new Date();
    await eventManager.save();

    // Generate token
    const token = generateToken(eventManager._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: eventManager
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// @route   POST /api/auth/phone-login
// @desc    Login with phone and OTP
// @access  Public
router.post('/phone-login', [
  body('phone').matches(/^\+?[1-9]\d{1,14}$/).withMessage('Please enter a valid phone number'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
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

    const { phone, otp } = req.body;

    // In production, verify OTP with SMS service
    // For demo, accept 123456 as valid OTP
    if (otp !== '123456') {
      return res.status(401).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // Find user by phone
    const eventManager = await EventManager.findOne({ phone });

    if (!eventManager) {
      return res.status(401).json({
        success: false,
        message: 'No account found with this phone number'
      });
    }

    // Update last login
    eventManager.lastLogin = new Date();
    await eventManager.save();

    // Generate token
    const token = generateToken(eventManager._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: eventManager
    });

  } catch (error) {
    console.error('Phone login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during phone login'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/auth/change-password
// @desc    Change user password
// @access  Private
router.put('/change-password', auth, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  ...passwordValidation
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

    const { currentPassword, password } = req.body;

    // Get user with password
    const user = await EventManager.findById(req.user._id).select('+password');

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);

    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = password;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password change'
    });
  }
});

// @route   POST /api/auth/verify-aadhar
// @desc    Verify Aadhar with UIDAI API
// @access  Private
router.post('/verify-aadhar', auth, [
  body('aadharNumber').isLength({ min: 12, max: 12 }).isNumeric().withMessage('Aadhar number must be exactly 12 digits')
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

    const { aadharNumber } = req.body;
    const user = await EventManager.findById(req.user._id);

    // Check if Aadhar number is already verified by another user
    const existingUser = await EventManager.findOne({
      aadharNumber,
      _id: { $ne: user._id },
      aadharStatus: 'Verified'
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'This Aadhar number is already verified with another account'
      });
    }

    // Simulate UIDAI API verification
    const verificationResult = await verifyWithUidai(aadharNumber);

    if (verificationResult.success) {
      // Update user with verified Aadhar
      user.aadharNumber = aadharNumber;
      user.aadharStatus = 'Verified';
      user.aadharVerifiedAt = new Date();
      
      // Update name if provided by UIDAI (optional)
      if (verificationResult.data && verificationResult.data.name) {
        user.verifiedName = verificationResult.data.name;
      }
    } else {
      user.aadharNumber = aadharNumber;
      user.aadharStatus = 'Rejected';
    }

    await user.save();

    res.json({
      success: true,
      message: verificationResult.success ? 'Aadhar verified successfully' : 'Aadhar verification failed',
      user,
      verificationData: verificationResult.data
    });

  } catch (error) {
    console.error('Aadhar verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during Aadhar verification'
    });
  }
});

// UIDAI API verification function
async function verifyWithUidai(aadharNumber) {
  try {
    // In production, replace with actual UIDAI API endpoint
    // const response = await axios.post('https://uidai-api-endpoint', {
    //   aadharNumber,
    //   apiKey: process.env.UIDAI_API_KEY
    // });

    // Mock verification for demo
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API delay

    // Demo logic - accept any 12-digit number
    if (aadharNumber.length === 12 && /^\d+$/.test(aadharNumber)) {
      return {
        success: true,
        data: {
          name: 'Verified User',
          dob: '1990-01-15',
          gender: 'M',
          address: 'India',
          verificationId: `UIDAI_${Date.now()}`
        }
      };
    } else {
      return {
        success: false,
        error: 'Invalid Aadhar number'
      };
    }
  } catch (error) {
    console.error('UIDAI API error:', error);
    return {
      success: false,
      error: 'Verification service unavailable'
    };
  }
}

module.exports = router;