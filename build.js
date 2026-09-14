const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const frontends = ['admin', 'customer', 'kitchen'];

for (const app of frontends) {
  console.log(`\n=== Building ${app} ===`);
  const appDir = path.join(__dirname, 'frontend', app);

  // Install and build
  execSync('npm install', { cwd: appDir, stdio: 'inherit' });
  execSync('npm run build', { cwd: appDir, stdio: 'inherit' });
  
  console.log(`>>> Built ${app}`);
}

console.log('\nAll frontends built successfully!');
