const express = require('express');
const mongoose = require('mongoose');
const Project = require('../models/Project');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-prod';

// Middleware to verify token
const verifyToken = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ message: 'Database service is currently unavailable' });
  }
  const authHeader = req.header('Authorization');
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : authHeader?.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

// Get all projects for logged-in user
router.get('/', verifyToken, async (req, res) => {
  try {
    const projects = await Project.find({ owner: req.user.id }).sort({ updatedAt: -1 });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create or update a project snippet
router.post('/save', verifyToken, async (req, res) => {
  try {
    const { title, content, language, roomId } = req.body || {};

    if (typeof roomId !== 'string' || !roomId.trim()) {
      return res.status(400).json({ message: 'Valid roomId is required' });
    }

    const cleanRoomId = roomId.trim();
    const cleanTitle = typeof title === 'string' && title.trim() ? title.trim().slice(0, 100) : 'Untitled Snippet';
    const cleanContent = typeof content === 'string' ? content.slice(0, 500000) : '';
    const cleanLang = typeof language === 'string' ? language.trim().slice(0, 30) : 'javascript';

    let project = await Project.findOne({ roomId: cleanRoomId });
    if (project) {
      if (project.owner.toString() !== req.user.id) {
        return res.status(403).json({ message: 'Not authorized to save to this project' });
      }
      project.title = cleanTitle;
      project.content = cleanContent;
      project.language = cleanLang;
      await project.save();
    } else {
      project = new Project({
        title: cleanTitle,
        content: cleanContent,
        language: cleanLang,
        roomId: cleanRoomId,
        owner: req.user.id,
      });
      await project.save();
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
