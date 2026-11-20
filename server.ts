import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { ENV } from './src/backend/config/env.ts';
import { errorHandler } from './src/backend/middleware/errorMiddleware.ts';
import { authRoutes } from './src/backend/routes/authRoutes.ts';
import { complaintRoutes } from './src/backend/routes/complaintRoutes.ts';
import { aiRoutes } from './src/backend/routes/aiRoutes.ts';
import { gisRoutes } from './src/backend/routes/gisRoutes.ts';
import { analyticsRoutes } from './src/backend/routes/analyticsRoutes.ts';
import { notificationRoutes } from './src/backend/routes/notificationRoutes.ts';
import { adminRoutes } from './src/backend/routes/adminRoutes.ts';
import { exportRoutes } from './src/backend/routes/exportRoutes.ts';
import { uploadRoutes } from './src/backend/routes/uploadRoutes.ts';
import { developerRoutes } from './src/backend/routes/developerRoutes.ts';
import { authorityApplicationRoutes } from './src/backend/routes/authorityApplicationRoutes.ts';

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true, limit: '4mb' }));

  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));
  app.use('/uploads', (_req, res) => {
    res.status(404).json({ error: 'Uploaded file not found.' });
  });
  app.use('/private_uploads', (_req, res) => {
    res.status(403).json({ error: 'Private storage is not publicly accessible.' });
  });

  // Health Check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'CivicSense AI Backend',
      database: 'Cloud Firestore',
      auth: 'Firebase Authentication',
      mlServiceConfigured: Boolean(ENV.ML_SERVICE_URL),
      timestamp: new Date().toISOString(),
    });
  });

  // REST API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/uploads', uploadRoutes);
  app.use('/api/complaints', complaintRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/gis', gisRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/authority-applications', authorityApplicationRoutes);
  app.use('/api/developer', developerRoutes);
  app.use('/api/export', exportRoutes);

  // Ensure unmatched /api/* routes return JSON 404 rather than HTML fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Centralized error handler for /api/*
  app.use('/api', errorHandler);

  const distDir = path.resolve(process.cwd(), 'dist');
  const isProd = ENV.NODE_ENV === 'production' && fs.existsSync(distDir);

  if (isProd) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(ENV.PORT, '0.0.0.0', () => {
    console.log(`CivicSense AI server running on http://0.0.0.0:${ENV.PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CivicSense AI server:', err);
  process.exit(1);
});
