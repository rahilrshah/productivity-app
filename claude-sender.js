#!/usr/bin/env node

/**
 * Claude Command Sender
 * 
 * This script lets you send commands from Claude's web interface to your local app.
 * 
 * Usage:
 *   node claude-sender.js "Add dentist appointment tomorrow high priority"
 *   node claude-sender.js "Create shopping list tagged as personal"
 *   node claude-sender.js "Schedule team meeting Friday at 2pm"
 */

const https = require('https');
const http = require('http');

// Your configuration
const CONFIG = {
  endpoint: 'http://localhost:3000/api/webhooks/claude',
  authToken: 'claude-webhook-secret-key-2024',
  userId: 'db60cd3f-e1bf-4d98-86cd-df5c1c8a7118'
};

async function sendCommand(text) {
  if (!text) {
    console.error('❌ Please provide a command text');
    console.log('Usage: node claude-sender.js "Your command here"');
    process.exit(1);
  }

  const payload = {
    text: text,
    user_id: CONFIG.userId
  };

  const data = JSON.stringify(payload);
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/webhooks/claude',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.authToken}`,
      'Content-Length': data.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          if (res.statusCode === 201 || res.statusCode === 200) {
            console.log('✅ Success:', result.message);
            console.log('📝 Task created:', result.task);
          } else {
            console.error('❌ Error:', result.error);
          }
          resolve(result);
        } catch (e) {
          console.error('❌ Failed to parse response:', responseData);
          reject(e);
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Request failed:', err.message);
      console.log('💡 Make sure your dev server is running: npm run dev');
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

// Main execution
const command = process.argv.slice(2).join(' ');

console.log('🤖 Sending command to your productivity app...');
console.log('📝 Command:', command);
console.log('---');

sendCommand(command)
  .then(() => {
    console.log('---');
    console.log('🎉 Command sent successfully!');
    console.log('Check your app at http://localhost:3000 to see the new task');
  })
  .catch((err) => {
    console.error('Failed to send command:', err.message);
    process.exit(1);
  });