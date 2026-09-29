import { createApp } from './app.js';
import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { processDueCommunicationJobs } from './modules/communications/communication.service.js';

await connectDatabase();
const communicationTimer = setInterval(() => { void processDueCommunicationJobs().catch(() => undefined); }, 30_000);
communicationTimer.unref();
void processDueCommunicationJobs().catch(() => undefined);
createApp().listen(env.PORT, () => {
  const url = `http://localhost:${env.PORT}/health`;
  console.log(`RxFlow backend listening on port ${env.PORT}`);
  console.log(`  → ${url}`);
});
