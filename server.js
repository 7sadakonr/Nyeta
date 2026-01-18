const { createServer: createHttpsServer } = require('https');
const { createServer: createHttpServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require("socket.io");
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = process.env.PORT || 3000;

if (dev) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Load SSL Certs (Only in Dev)
let httpsOptions = {};
if (dev) {
  try {
    httpsOptions = {
      key: fs.readFileSync(path.join(__dirname, 'key.pem')),
      cert: fs.readFileSync(path.join(__dirname, 'cert.pem')),
    };
  } catch (e) {
    console.error("Could not load SSL certificates. Make sure run 'node generate-cert.js' first.");
    process.exit(1);
  }
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const requestHandler = async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  };

  let httpServer;
  if (dev) {
    httpServer = createHttpsServer(httpsOptions, requestHandler);
  } else {
    httpServer = createHttpServer(requestHandler);
  }

  const io = new Server(httpServer);

  // Volunteer Queue
  // Using a Set for unique volunteers
  let volunteers = new Set();
  // Track previous matches to avoid repeating the same volunteer immediately
  // blindPeerId -> lastVolunteerSocketId
  let previousMatches = new Map();

  io.on('connection', (socket) => {
    // console.log('Client connected:', socket.id);

    // Volunteer joins
    socket.on('join-volunteer', () => {
      volunteers.add(socket.id);
      console.log(`Volunteer joined: ${socket.id}. Total: ${volunteers.size}`);
      socket.emit('volunteer-status', 'active');
    });

    // Volunteer leaves manually
    socket.on('leave-volunteer', () => {
      volunteers.delete(socket.id);
      console.log(`Volunteer left: ${socket.id}. Total: ${volunteers.size}`);
      socket.emit('volunteer-status', 'inactive');
    });

    // Blind user requests help with their PeerJS ID
    socket.on('request-help', (blindPeerId) => {
      console.log(`Help request from Blind PeerID: ${blindPeerId}`);

      if (volunteers.size === 0) {
        socket.emit('no-volunteers');
        return;
      }

      const volunteersArray = Array.from(volunteers);

      // Filter out the volunteer making the request (if applicable)
      // Note: In this app, blind user calls request-help, they are not in 'volunteers' set usually, 
      // but if they were, we exclude them.
      let candidates = volunteersArray.filter(id => id !== socket.id);

      if (candidates.length === 0) {
        console.log(`No candidates available for ${blindPeerId}`);
        socket.emit('no-volunteers');
        return;
      }

      // Filter out previous volunteer if possible
      const lastVolunteer = previousMatches.get(blindPeerId);
      let filteredCandidates = candidates;
      if (lastVolunteer && candidates.length > 1) {
        filteredCandidates = candidates.filter(id => id !== lastVolunteer);
      }

      const randomVol = filteredCandidates[Math.floor(Math.random() * filteredCandidates.length)];
      console.log(`Matching blind ${socket.id} with Volunteer ${randomVol} (previous: ${lastVolunteer || 'none'})`);

      // Update previous match
      previousMatches.set(blindPeerId, randomVol);

      // Store mapping for later
      socket.blindPeerId = blindPeerId;
      socket.matchedVolunteer = randomVol;

      // Notify Volunteer about incoming request
      io.to(randomVol).emit('incoming-request', { blindPeerId });
    });

    // Volunteer is ready with their peer ID - tell blind user to call them
    socket.on('volunteer-ready', ({ volunteerId, blindPeerId }) => {
      console.log(`Volunteer ready: ${volunteerId}, telling blind user to call`);

      // Find blind user's socket and tell them to call volunteer
      for (const [id, s] of io.sockets.sockets) {
        if (s.blindPeerId === blindPeerId) {
          s.emit('volunteer-ready', { volunteerId });
          console.log(`Told blind user ${id} to call volunteer ${volunteerId}`);

          // Remove volunteer from queue during call
          volunteers.delete(socket.id);
          break;
        }
      }
    });

    // Cancel request
    socket.on('cancel-request', () => {
      console.log(`Blind user ${socket.id} cancelled request`);
    });

    socket.on('disconnect', () => {
      if (volunteers.has(socket.id)) {
        volunteers.delete(socket.id);
        console.log(`Volunteer disconnected: ${socket.id}`);
      }
    });
  });

  httpServer.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on ${dev ? 'https' : 'http'}://${hostname}:${port}`);
    if (dev) {
      console.log(`> Local Network Access: https://${require('ip').address()}:${port}`);
      console.log(`> Note: Accept the self-signed certificate warning in your browser.`);
    }
  });
});
