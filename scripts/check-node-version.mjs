const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
const required = 20;

if (major < required) {
  console.error('');
  console.error(`platform-ui requires Node.js >= ${required}. You are running ${process.version}.`);
  console.error('');
  console.error('Angular 21 dev server uses Vite (ESM-only), which does not work on Node 18.');
  console.error('');
  console.error('Fix:');
  console.error('  nvm install 20');
  console.error('  nvm use 20');
  console.error('  node -v');
  console.error('  npm start');
  console.error('');
  console.error('Use npm start (local CLI), not global "ng serve" on Node 18.');
  console.error('');
  process.exit(1);
}
