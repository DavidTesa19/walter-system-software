import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.join(__dirname, 'index.html');

const app = express();
const PORT = process.env.PORT || 3005;

// Serve the self-contained public form page from this service bundle.
app.get(['/', '/index.html'], (_req, res) => {
  res.sendFile(indexPath);
});

// Serve any local fallback files if needed.
app.use(express.static(__dirname));

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'public-form' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Public form server running on port ${PORT}`);
});
