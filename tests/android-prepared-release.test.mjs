import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {prepareAndroidRelease} from '../scripts/prepare-android-release.mjs';

test('publish descriptor contains verified bytes; corrupt installer cannot replace it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meplus-release-'));
  try {
    const releases = path.join(root, 'releases/android');
    const downloads = path.join(root, 'apps/web/public/downloads');
    fs.mkdirSync(releases, {recursive:true}); fs.mkdirSync(downloads, {recursive:true});
    const bytes = Buffer.alloc(10 * 1024 * 1024, 7);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const filename = 'me-plus-0.4.3.apk';
    const metadata = {app:'me-plus',platform:'android',architecture:'arm64-v8a',version:'0.4.3',
      filename,sha256,signerCertificateSha256:'a'.repeat(64),embeddedJavascriptBundle:true,
      upgradeSignerVerified:true,sizeBytes:bytes.length,packageName:'app.meplus.mobile',
      versionCode:9,sourceCommit:'b'.repeat(40),publicDownloadPath:'/downloads/'+filename};
    fs.writeFileSync(path.join(releases,'0.4.3.json'),JSON.stringify(metadata));
    fs.writeFileSync(path.join(downloads,filename),bytes);
    fs.writeFileSync(path.join(downloads,filename+'.sha256'),sha256+'  '+filename+'\n');
    const descriptor=prepareAndroidRelease(root);
    assert.equal(descriptor.version,'0.4.3');assert.equal(descriptor.versionCode,9);
    assert.equal(descriptor.sha256,sha256);assert.equal(descriptor.downloadPath,metadata.publicDownloadPath);
    const generated=path.join(root,'apps/web/lib/android-release.generated.json');
    const before=fs.readFileSync(generated,'utf8');
    assert.deepEqual(JSON.parse(before).artifact,descriptor);
    bytes[0]=8;fs.writeFileSync(path.join(downloads,filename),bytes);
    assert.throws(()=>prepareAndroidRelease(root),/No verified Android installer/);
    assert.equal(fs.readFileSync(generated,'utf8'),before);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
