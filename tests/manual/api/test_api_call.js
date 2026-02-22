const http = require('http');

function checkPort(port) {
  console.log(`Checking port ${port}...`);
  const req = http.get(`http://localhost:${port}/api/stocks`, (res) => {
    console.log(`Port ${port} Response Status: ${res.statusCode}`);
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log(`Port ${port} Body:`, data.substring(0, 200)); // Print first 200 chars
    });
  });

  req.on('error', (e) => {
    console.log(`Port ${port} Error: ${e.message}`);
  });
}

checkPort(3000);
checkPort(3100);
