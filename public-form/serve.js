import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3005;

// Serve static files
app.use(express.static(__dirname));

// Serve the form at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'public-form' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Public form server running on port ${PORT}`);
});
