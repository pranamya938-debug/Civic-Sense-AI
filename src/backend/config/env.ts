import fs from 'fs';
import path from 'path';

let firebaseWebApiKey = '';
try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    firebaseWebApiKey = raw.apiKey || '';
  }
} catch {
  firebaseWebApiKey = '';
}

export const ENV = {
  PORT: Number(process.env.PORT || 3000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  ML_SERVICE_URL: (process.env.ML_SERVICE_URL || '').replace(/\/$/, ''),
  FIREBASE_WEB_API_KEY: firebaseWebApiKey,
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMS_WEBHOOK_URL: process.env.SMS_WEBHOOK_URL || '',
};
