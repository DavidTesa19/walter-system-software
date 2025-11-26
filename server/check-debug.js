import fetch from 'node-fetch';

async function checkDebug() {
  try {
    const response = await fetch('https://api.waltersystem.cz/debug-env');
    if (response.ok) {
      const data = await response.json();
      console.log('Debug Info:', data);
    } else {
      console.log('Debug endpoint failed:', response.status);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkDebug();
