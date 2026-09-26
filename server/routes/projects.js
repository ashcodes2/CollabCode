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
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Access denied' });

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(400).json({ message: 'Invalid token' });
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
    const { title, content, language, roomId } = req.body;
    
    let project = await Project.findOne({ roomId });
    if (project) {
      // Ensure owner matches, or allow anyone in room? For now, owner only.
      if (project.owner.toString() !== req.user.id) {
        return res.status(403).json({ message: 'Not authorized to save this project' });
      }
      project.title = title;
      project.content = content;
      project.language = language;
      await project.save();
    } else {
      project = new Project({
        title, content, language, roomId, owner: req.user.id
      });
      await project.save();
    }
    
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
