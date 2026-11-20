import { Router } from 'express';
import type * as ArchiverTypes from 'archiver';
import fs from 'fs';
import path from 'path';
import { requireAuth, requireDeveloperAccess } from '../middleware/authMiddleware.ts';

export const exportRoutes = Router();

type ZipArchiveConstructor = new (options?: {
  zlib?: { level?: number };
}) => ArchiverTypes.Archiver;

export async function buildProjectZipStream(outputStream: NodeJS.WritableStream): Promise<void> {
  const mod = (await import('archiver')) as unknown as { ZipArchive: ZipArchiveConstructor };
  const ZipArchive = mod.ZipArchive;

  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('error', (err: Error) => reject(err));
    outputStream.on('close', () => resolve());
    outputStream.on('finish', () => resolve());
    archive.on('end', () => resolve());

    archive.pipe(outputStream);

    const rootDir = process.cwd();
    const excludeTop = new Set([
      'node_modules',
      'dist',
      '.git',
      'data',
      'uploads',
      'private_uploads',
      '.env',
      '.env.local',
      'CivicSense_AI_Complete_Project.zip',
      'test.zip',
      '.venv',
    ]);

    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (excludeTop.has(entry.name)) continue;
      if (entry.name.startsWith('.env') && entry.name !== '.env.example') continue;

      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        archive.directory(fullPath, `CivicSense_AI/${entry.name}`);
      } else {
        archive.file(fullPath, { name: `CivicSense_AI/${entry.name}` });
      }
    }

    void archive.finalize();
  });
}

exportRoutes.get('/zip', requireAuth, requireDeveloperAccess, async (_req, res) => {
  try {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="CivicSense_AI_Complete_Project.zip"');
    await buildProjectZipStream(res);
  } catch (err) {
    console.error('ZIP export failed:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate project ZIP archive.' });
    }
  }
});
