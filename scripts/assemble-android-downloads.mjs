import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const hex = /^[0-9a-f]{64}$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const maxPart = 8 * 1024 * 1024;

// Connector requests are bounded. Store the exact signed APK in bounded pieces,
// then verify and assemble it before Next discovers public download metadata.
export function assembleAndroidDownloads(root) {
  const base = path.join(root, 'releases/android/parts');
  if (!fs.existsSync(base)) return [];
  const assembled = [];
  for (const entry of fs.readdirSync(base, {withFileTypes: true})) {
    if (!entry.isDirectory() || !versionPattern.test(entry.name)) throw new Error('Invalid Android parts directory');
    const folder = path.join(base, entry.name);
    const manifestPath = path.join(folder, 'manifest.json');
    if (!fs.lstatSync(manifestPath).isFile()) throw new Error('Invalid Android parts manifest');
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (m.version !== entry.name || m.filename !== `me-plus-${entry.name}.apk` ||
        !Number.isSafeInteger(m.sizeBytes) || m.sizeBytes <= 0 || m.sizeBytes > 100 * 1024 * 1024 ||
        typeof m.sha256 !== 'string' || !hex.test(m.sha256) ||
        !Array.isArray(m.parts) || m.parts.length < 1 || m.parts.length > 128) {
      throw new Error('Invalid Android parts manifest');
    }
    const release = JSON.parse(fs.readFileSync(path.join(root, 'releases/android', `${entry.name}.json`), 'utf8').replace(/^\uFEFF/, ''));
    if (release.filename !== m.filename || release.version !== m.version || release.sizeBytes !== m.sizeBytes || release.sha256 !== m.sha256) {
      throw new Error('Android parts differ from release provenance');
    }
    const outputDir = path.join(root, 'apps/web/public/downloads');
    fs.mkdirSync(outputDir, {recursive: true});
    const output = path.join(outputDir, m.filename);
    const temp = `${output}.assembling-${crypto.randomUUID()}`;
    const hash = crypto.createHash('sha256');
    let size = 0;
    let fd;
    try {
      fd = fs.openSync(temp, 'wx');
      for (const [index, part] of m.parts.entries()) {
        if (part.filename !== `part-${String(index).padStart(3, '0')}.bin` ||
            !Number.isSafeInteger(part.sizeBytes) || part.sizeBytes < 1 || part.sizeBytes > maxPart ||
            typeof part.sha256 !== 'string' || !hex.test(part.sha256)) throw new Error('Invalid Android part');
        const file = path.join(folder, part.filename);
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.size !== part.sizeBytes) throw new Error('Missing or invalid Android part');
        const bytes = fs.readFileSync(file);
        if (digest(bytes) !== part.sha256) throw new Error('Android part checksum mismatch');
        size += bytes.length;
        if (size > m.sizeBytes) throw new Error('Android parts exceed declared size');
        hash.update(bytes);
        fs.writeFileSync(fd, bytes);
      }
      fs.closeSync(fd); fd = undefined;
      if (size !== m.sizeBytes || hash.digest('hex') !== m.sha256) throw new Error('Assembled Android checksum mismatch');
      fs.renameSync(temp, output);
      fs.writeFileSync(`${output}.sha256`, `${m.sha256}  ${m.filename}\n`);
      assembled.push(m.filename);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }
  return assembled;
}
