import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`[TwilioWhatsAppBot] Listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
});
