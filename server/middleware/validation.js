const Joi = require('joi');
const logger = require('../config/logger');

// Validation schemas
const schemas = {
  register: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).lowercase().required().messages({
      'string.alphanum': 'Username can only contain letters and numbers',
      'string.min': 'Username must be at least 3 characters',
      'string.max': 'Username cannot exceed 30 characters',
      'any.required': 'Username is required',
    }),
    password: Joi.string().min(6).max(100).required().messages({
      'string.min': 'Password must be at least 6 characters',
      'string.max': 'Password cannot exceed 100 characters',
      'any.required': 'Password is required',
    }),
  }),

  login: Joi.object({
    username: Joi.string().required().messages({
      'any.required': 'Username is required',
    }),
    password: Joi.string().required().messages({
      'any.required': 'Password is required',
    }),
  }),

  projectKey: Joi.object({
    key: Joi.string().alphanum().min(2).max(50).lowercase().required().messages({
      'string.alphanum': 'Project key can only contain letters and numbers',
      'string.min': 'Project key must be at least 2 characters',
      'string.max': 'Project key cannot exceed 50 characters',
      'any.required': 'Project key is required',
    }),
  }),

  location: Joi.object({
    address: Joi.string().min(3).max(200).required().messages({
      'string.min': 'Address must be at least 3 characters',
      'string.max': 'Address cannot exceed 200 characters',
      'any.required': 'Address is required',
    }),
  }),

  coords: Joi.object({
    latitude: Joi.number().min(-90).max(90).required().messages({
      'number.min': 'Latitude must be between -90 and 90',
      'number.max': 'Latitude must be between -90 and 90',
      'any.required': 'Latitude is required',
    }),
    longitude: Joi.number().min(-180).max(180).required().messages({
      'number.min': 'Longitude must be between -180 and 180',
      'number.max': 'Longitude must be between -180 and 180',
      'any.required': 'Longitude is required',
    }),
  }),

  chatMessage: Joi.object({
    msg: Joi.string().min(1).max(1000).required().messages({
      'string.min': 'Message cannot be empty',
      'string.max': 'Message cannot exceed 1000 characters',
      'any.required': 'Message is required',
    }),
    name: Joi.string().optional(),
  }),
};

// Validation middleware factory
const validate = (schemaName) => {
  return (req, res, next) => {
    const schema = schemas[schemaName];

    if (!schema) {
      logger.error('Validation schema not found', { schemaName });
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }

    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => detail.message);
      logger.warn('Validation failed', { errors, body: req.body });

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors,
      });
    }

    req.validatedData = value;
    next();
  };
};

// Socket data validation
const validateSocketData = (data, schemaName) => {
  const schema = schemas[schemaName];

  if (!schema) {
    return { valid: false, error: 'Invalid schema' };
  }

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errors = error.details.map((detail) => detail.message);
    return { valid: false, errors };
  }

  return { valid: true, value };
};

module.exports = {
  validate,
  validateSocketData,
  schemas,
};
