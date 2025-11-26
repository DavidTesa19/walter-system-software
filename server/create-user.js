import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'data', 'db.json');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node create-user.js <username> <password> [role]');
  process.exit(1);
}

const [username, password, role = 'admin'] = args;

async function createUser() {
  try {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    let db = { users: [] };
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      db = JSON.parse(content);
    }

    if (!db.users) db.users = [];

    const existingUserIndex = db.users.findIndex(u => u.username === username);
    
    if (existingUserIndex >= 0) {
      console.log(`Updating existing user: ${username}`);
      db.users[existingUserIndex] = {
        ...db.users[existingUserIndex],
        password_hash,
        role,
        updated_at: new Date().toISOString()
      };
    } else {
      console.log(`Creating new user: ${username}`);
      const maxId = db.users.reduce((m, u) => Math.max(m, Number(u.id) || 0), 0);
      db.users.push({
        id: maxId + 1,
        username,
        password_hash,
        role,
        created_at: new Date().toISOString()
      });
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    console.log('✓ User saved successfully');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

createUser();
