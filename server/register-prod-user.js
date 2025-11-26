import fetch from 'node-fetch';

const API_URL = 'https://api.waltersystem.cz';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node register-prod-user.js <username> <password> [role]');
  process.exit(1);
}

const [username, password, role = 'admin'] = args;

async function registerUser() {
  try {
    console.log(`Registering user '${username}' at ${API_URL}...`);
    
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✓ User created successfully!');
      console.log('ID:', data.userId || data.id);
    } else {
      const text = await response.text();
      console.error('✗ Registration failed:', response.status, text);
      try {
          const json = JSON.parse(text);
          if (json.details) {
              console.error('Error Details:', json.details);
          }
      } catch (e) {}
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

registerUser();
