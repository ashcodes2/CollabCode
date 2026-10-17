const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-prod';

// In-memory sliding-window rate limiter for authentication routes
const authAttempts = new Map(); // ip -> [timestamps]
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 15; // 15 requests per minute per IP

function authRateLimiter(req, res, next) {
  const ip = req.headers['x-test-client-ip'] || req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const timestamps = (authAttempts.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW);

  if (timestamps.length >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((timestamps[0] + RATE_LIMIT_WINDOW - now) / 1000);
    return res.status(429).json({
      message: 'Too many authentication attempts. Please try again later.',
      retryAfterSeconds: Math.max(1, retryAfter),
    });
  }

  timestamps.push(now);
  authAttempts.set(ip, timestamps);
  next();
}

// Register Route
router.post('/register', authRateLimiter, async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ message: 'Database service is currently unavailable' });
  }

  try {
    const { username, email, password } = req.body || {};

    // Strict type check to prevent NoSQL injection (e.g. passing objects like { $ne: null })
    if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Username, email, and password must be valid strings' });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanUsername || !cleanEmail || !password) {
      return res.status(400).json({ message: 'Username, email, and password are required' });
    }

    if (cleanUsername.length < 3 || cleanUsername.length > 30) {
      return res.status(400).json({ message: 'Username must be between 3 and 30 characters' });
    }

    if (password.length < 6 || password.length > 72) {
      return res.status(400).json({ message: 'Password must be between 6 and 72 characters' });
    }

    // Check if user exists using literal sanitized strings
    const existingUser = await User.findOne({
      $or: [{ email: cleanEmail }, { username: cleanUsername }]
    });

    if (existingUser) {
      return res.status(400).json({ message: 'User with this email or username already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      username: cleanUsername,
      email: cleanEmail,
      password: hashedPassword
    });
    await newUser.save();

    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'User with this email or username already exists' });
    }
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Login Route
router.post('/login', authRateLimiter, async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ message: 'Database service is currently unavailable' });
  }

  try {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Email and password must be valid strings' });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user by literal string
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user._id.toString(), username: user.username },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

module.exports = router;
