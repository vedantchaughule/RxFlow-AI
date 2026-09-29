import { createApp } from './app.js';
import { env } from './env.js';
createApp().listen(env.PORT, () => console.log(`Jarvis agent listening on ${env.PORT}`));
