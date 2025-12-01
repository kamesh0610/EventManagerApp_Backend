const multer = require('multer');
const path = require('path');
const fs = require('fs');

const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;

let storage;

if (isProduction) {
  // Use memory storage for Vercel (temporary - files stored in memory)
  // NOTE: For production, you should migrate to cloud storage (Cloudinary, AWS S3, etc.)
  storage = multer.memoryStorage();
  console.warn('⚠️ Using memory storage. Files will not persist. Please configure cloud storage for production.');
} else {
  // Use disk storage for local development
  const uploadDir = path.join(__dirname, '../uploads');
  
  // Ensure upload directory exists (local only)
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  storage = multer.diskStorage({
    destination: function (req, file, cb) {
      let uploadPath = uploadDir;
      
      // Create subdirectories based on file type
      if (file.fieldname.includes('aadhar')) {
        uploadPath = path.join(uploadDir, 'kyc');
      } else if (file.fieldname === 'photo') {
        uploadPath = path.join(uploadDir, 'profiles');
      } else if (file.fieldname === 'image') {
        uploadPath = path.join(uploadDir, 'services');
      }
      
      // Ensure subdirectory exists
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      
      cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
      // Generate unique filename
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const extension = path.extname(file.originalname);
      cb(null, file.fieldname + '-' + uniqueSuffix + extension);
    }
  });
}

// File filter
const fileFilter = (req, file, cb) => {
  // Check file type
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB default
  },
  fileFilter: fileFilter
});

// Error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }
    
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files uploaded.'
      });
    }
    
    return res.status(400).json({
      success: false,
      message: 'File upload error: ' + error.message
    });
  }
  
  if (error.message === 'Only image files are allowed!') {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  next(error);
};

module.exports = {
  upload,
  handleMulterError
};