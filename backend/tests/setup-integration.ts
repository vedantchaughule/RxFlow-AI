import { inject } from 'vitest';
import { isolatedDatabaseUri } from './support/database.js';

process.env.MONGODB_URI = isolatedDatabaseUri(inject('mongoTestUri'), 'worker');
