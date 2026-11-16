import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.ts';

const isReadOnlyEnv = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const dataRoot = isReadOnlyEnv
  ? path.join(os.tmpdir(), 'doolee-data')
  : path.resolve(process.cwd(), 'data');

const { app } = createApp({
  dbPath: path.join(dataRoot, 'doolee.sqlite'),
  templatesDir: path.join(dataRoot, 'templates'),
});

export default app;
