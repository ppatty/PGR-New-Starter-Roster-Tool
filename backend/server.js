'use strict';

const express = require('express');
const cors = require('cors');
const { buildRoster, DEFAULT_MIN_SHIFTS, DEFAULT_BLOCKS, sanitizeBlocks, sanitizeStarters } = require('./rosterEngine');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/roster', (req, res) => {
  try {
    const { starters, blocks, welcomeDay, onboardDay, shuffle, minShifts } = req.body || {};
    const sanitizedStarters = sanitizeStarters(starters);
    const sanitizedBlocks = sanitizeBlocks(blocks);

    const roster = buildRoster({
      starters: sanitizedStarters,
      blocks: sanitizedBlocks,
      welcomeDay: typeof welcomeDay === 'number' ? welcomeDay : undefined,
      onboardDay: typeof onboardDay === 'number' ? onboardDay : undefined,
      shuffle: Boolean(shuffle),
      minShifts: typeof minShifts === 'number' && minShifts > 0 ? Math.floor(minShifts) : undefined
    });

    res.json({
      data: roster,
      meta: {
        defaults: {
          minShifts: DEFAULT_MIN_SHIFTS,
          blocks: DEFAULT_BLOCKS
        }
      }
    });
  } catch (error) {
    res.status(400).json({
      error: error.message
    });
  }
});

const PORT = Number(process.env.PORT) || 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Roster backend listening on port ${PORT}`);
  });
}

module.exports = app;
