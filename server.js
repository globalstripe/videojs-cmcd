/**
 * Simple HTTP server for Video.js CMCD Test Player
 * Serves static files from the current directory
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

// Serve static files from the current directory
app.use(express.static(__dirname));

// Route for root - serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Video.js CMCD Test Player server running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser to view the player`);
});

