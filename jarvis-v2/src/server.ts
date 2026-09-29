import { createApp } from './app.js';
import { env } from './env.js';

const app = createApp();
app.listen(env.PORT, () => {
  console.log(`Friday JARVIS v2 microservice listening on port ${env.PORT}`);
});
