const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
console.log('Testing modules from root:', rootDir);

const commandsDir = path.join(rootDir, 'src', 'commands');
function checkDir(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      checkDir(full);
    } else if (item.name.endsWith('.js')) {
      console.log('Checking command:', item.name);
      const mod = require(full);
      if (!mod.name) throw new Error(item.name + ': missing name');
    }
  }
}
checkDir(commandsDir);
console.log('[+] Commands passed!');

console.log('Checking schemas...');
const schemaDir = path.join(rootDir, 'src', 'schema');
for (const file of fs.readdirSync(schemaDir)) {
  if (file.endsWith('.js')) {
    console.log('Checking schema:', file);
    require(path.join(schemaDir, file));
  }
}
console.log('[+] Schemas passed!');

console.log('Checking events...');
const eventsDir = path.join(rootDir, 'src', 'events');
function checkEvents(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      checkEvents(full);
    } else if (item.name.endsWith('.js')) {
      console.log('Checking event:', item.name);
      require(full);
    }
  }
}
checkEvents(eventsDir);
console.log('[+] Events passed!');

console.log('Checking utils...');
const utilsDir = path.join(rootDir, 'src', 'utils');
for (const file of fs.readdirSync(utilsDir)) {
  if (file.endsWith('.js')) {
    console.log('Checking util:', file);
    require(path.join(utilsDir, file));
  }
}
console.log('[+] Utils passed!');

console.log('Checking engine...');
const engineDir = path.join(rootDir, 'src', 'engine');
for (const file of fs.readdirSync(engineDir)) {
  if (file.endsWith('.js')) {
    console.log('Checking engine module:', file);
    require(path.join(engineDir, file));
  }
}
console.log('[+] Engine passed!');

console.log('\n[SUCCESS] ALL CHECKS PASSED PERFECTLY!');
process.exit(0);
