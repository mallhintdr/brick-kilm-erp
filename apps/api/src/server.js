import { connect } from './db.js';
import { createApp } from './app.js';
import { seed } from './seed.js';

// A real secret is mandatory outside dev: refusing to boot beats silently signing
// tokens an attacker could forge from the public fallback string in app.js.
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set when NODE_ENV=production');
}

const db = await connect();
if (!process.env.MONGO_URI) {
  const s = await seed(db);
  console.log('Dev seed created:', s, '(munshi password: owner123)');
}
const port = process.env.PORT || 4000;
createApp(db).listen(port, () => console.log(`API on http://localhost:${port}`));
