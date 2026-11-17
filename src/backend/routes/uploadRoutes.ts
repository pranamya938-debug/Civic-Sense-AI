import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AuthenticatedRequest, requireAuth } from '../middleware/authMiddleware.ts';

export const uploadRoutes = Router();

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

uploadRoutes.post('/', requireAuth, (req: AuthenticatedRequest, res) => {
  const { dataUrl } = req.body as { dataUrl?: string };
  if (!dataUrl || typeof dataUrl !== 'string') {
    res.status(400).json({ error: 'Image dataUrl payload is required.' });
    return;
  }

  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    res.status(400).json({ error: 'Only JPEG, PNG, and WEBP image uploads are supported.' });
    return;
  }

  const mime = match[1];
  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, 'base64');

  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
    res.status(400).json({ error: 'Uploaded image must be under 2 MB.' });
    return;
  }

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  const ext = MIME_TO_EXT[mime] || 'jpg';
  const filename = `evidence_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
  const fullPath = path.join(UPLOADS_DIR, filename);

  fs.writeFileSync(fullPath, buffer);
  res.status(201).json({ photoUrl: `/uploads/${filename}`, sizeBytes: buffer.byteLength });
});
