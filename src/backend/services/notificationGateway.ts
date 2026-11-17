import { ENV } from '../config/env.ts';

export const notificationGateway = {
  getExternalGatewayStatus() {
    return {
      emailConfigured: Boolean(ENV.SMTP_HOST),
      smsConfigured: Boolean(ENV.SMS_WEBHOOK_URL),
      note:
        ENV.SMTP_HOST || ENV.SMS_WEBHOOK_URL
          ? 'External notification gateway configured.'
          : 'In-app notifications active in Cloud Firestore. Set SMTP_HOST / SMS_WEBHOOK_URL in .env to enable external Email/SMS delivery.',
    };
  },
};
