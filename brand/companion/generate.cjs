// Run from the repository root: node brand/companion/generate.cjs
// Uses the sharp renderer already installed with the Next.js toolchain.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = __dirname;
const colors = { navy:'#121C32', apricot:'#FFC799', ivory:'#FFF9EE' };
const mark = `<path d="M150 253 C122 223 124 186 149 163 C174 138 211 141 235 165 C259 189 261 222 238 252 C257 257 276 267 291 280 C316 347 352 393 397 416 C431 434 452 436 482 436 L505 436 C546 436 554 459 532 482 C518 498 496 507 470 507 L384 507 C316 507 256 449 241 377 C235 348 214 332 190 334 C165 336 151 355 151 379 L151 458 C151 487 134 507 106 507 C79 507 67 486 67 463 L67 371 C67 320 101 273 150 253 Z"/>
<path d="M302 266 C331 220 383 190 435 190 C492 188 540 221 552 266 C572 337 521 389 461 400 C430 406 402 397 406 374 C408 361 421 359 441 351 C468 341 483 326 477 307 C471 286 446 280 424 287 C385 298 369 333 376 373 C340 363 321 328 307 300 C300 286 298 275 302 266 Z"/>
<path d="M569 350 C579 350 585 357 585 367 L585 378 L596 378 C605 378 612 384 612 393 C612 402 605 409 596 409 L585 409 L585 420 C585 429 579 436 569 436 C560 436 554 429 554 420 L554 409 L543 409 C534 409 528 402 528 393 C528 384 534 378 543 378 L554 378 L554 367 C554 357 560 350 569 350 Z"/>`;
// Rounded custom outlined lettering; no font dependency for the primary logo.
const word = `<path d="M10 83 V10 L45 56 L80 10 V83 M163 70 C152 88 119 91 109 66 C95 30 139 10 157 36 C163 43 163 49 163 52 H109 M218 25 V77 M193 51 H244" fill="none" stroke="currentColor" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>`;
const svg=(w,h,body,bg)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><title>Me+ Companion</title>${bg?`<path fill="${bg}" d="M0 0H${w}V${h}H0Z"/>`:''}${body}</svg>\n`;
const tile=(size=1024,rounded=true)=>svg(size,size,`${rounded?`<rect width="${size}" height="${size}" rx="${size*.25}" fill="${colors.navy}"/>`:''}<g fill="${colors.apricot}" transform="scale(${size/660})">${mark}</g>`,rounded?null:colors.navy);
const safe=svg(1024,1024,`<g fill="${colors.apricot}" transform="translate(182 195) scale(1)">${mark}</g>`);
const maskable=svg(1024,1024,`<g fill="${colors.apricot}" transform="translate(182 195)">${mark}</g>`,colors.navy);
const files={};
const write=(file,data)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),data);};
files['masters/icon-rounded.svg']=tile();
files['masters/icon-square.svg']=tile(1024,false);
for(const [name,color] of Object.entries({...colors,black:'#000000',white:'#FFFFFF'})) files[`marks/mark-${name}.svg`]=svg(660,660,`<g fill="${color}">${mark}</g>`);
for(const [name,ink,bg] of [['light',colors.navy,colors.ivory],['dark',colors.apricot,colors.navy],['navy',colors.navy,null],['white','#FFFFFF',null],['black','#000000',null]]) {
 files[`logos/logo-horizontal-${name}.svg`]=svg(960,300,`<g transform="translate(24 24) scale(.382)"><rect width="660" height="660" rx="165" fill="${name==='white'||name==='black'?'none':colors.navy}"/><g fill="${name==='white'?'#FFFFFF':name==='black'?'#000000':colors.apricot}">${mark}</g></g><g color="${ink}" transform="translate(330 62) scale(2)">${word}</g>`,bg);
 files[`logos/logo-stacked-${name}.svg`]=svg(600,700,`<g transform="translate(102 30) scale(.6)"><rect width="660" height="660" rx="165" fill="${name==='white'||name==='black'?'none':colors.navy}"/><g fill="${name==='white'?'#FFFFFF':name==='white'?'#FFFFFF':name==='black'?'#000000':colors.apricot}">${mark}</g></g><g color="${ink}" transform="translate(68 485) scale(2)">${word}</g>`,bg);
}
files['android/adaptive-foreground.svg']=safe;
files['android/adaptive-background.svg']=svg(1024,1024,'',colors.navy);
files['android/adaptive-monochrome.svg']=svg(1024,1024,`<g fill="#FFFFFF" transform="translate(182 195)">${mark}</g>`);
files['web/icon-maskable.svg']=maskable;
for(const [name,label,subtitle] of [['download-android','Download for Android','Me+ Companion'],['open-web-app','Open Me+','Your personal companion'],['development-build','Development build','Me+ • Preview'],['powered-by','Powered by Me+','Companion']]) {
 files[`badges/${name}.svg`]=svg(360,104,`<rect x="1" y="1" width="358" height="102" rx="20" fill="${colors.navy}" stroke="${colors.apricot}" stroke-width="2"/><g fill="${colors.apricot}" transform="translate(8 9) scale(.125)">${mark}</g><g fill="${colors.ivory}" font-family="DejaVu Sans,sans-serif"><text x="103" y="41" font-size="12">${subtitle}</text><text x="103" y="70" font-size="19" font-weight="bold">${label}</text></g>`);
}
files['tokens.json']=JSON.stringify({name:'Me+ Companion',...colors},null,2)+'\n';
(async()=>{
 for(const [file,data] of Object.entries(files)) write(file,data);
 const png=async(source,dest,size)=>{const b=await sharp(Buffer.from(files[source])).resize(size).png().toBuffer();write(dest,b);};
 await png('masters/icon-square.svg','android/launcher-1024.png',1024);
 for(const name of ['foreground','background','monochrome']) await png(`android/adaptive-${name}.svg`,`android/adaptive-${name}.png`,1024);
 for(const size of [16,32,48,192,512]) await png('masters/icon-rounded.svg',`web/icon-${size}.png`,size);
 await png('masters/icon-square.svg','web/apple-touch-icon.png',180);
 await png('web/icon-maskable.svg','web/icon-maskable-512.png',512);
 for(const name of ['navy','apricot','black','white']) await png(`marks/mark-${name}.svg`,`marks/mark-${name}-1024.png`,1024);
 for(const name of ['light','dark','navy','white','black']) await png(`logos/logo-horizontal-${name}.svg`,`logos/logo-horizontal-${name}.png`,960);
 for(const name of ['download-android','open-web-app','development-build','powered-by']) await png(`badges/${name}.svg`,`badges/${name}.png`,720);
 // ICO container uses PNG payloads, preserving antialiasing and transparency.
 const images=[16,32,48].map(n=>fs.readFileSync(path.join(root,`web/icon-${n}.png`)));
 const header=Buffer.alloc(6+images.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);let offset=header.length;
 images.forEach((b,i)=>{const n=[16,32,48][i],p=6+16*i;header[p]=n;header[p+1]=n;header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(b.length,p+8);header.writeUInt32LE(offset,p+12);offset+=b.length;});write('web/favicon.ico',Buffer.concat([header,...images]));
 write('web/manifest.example.json',JSON.stringify({name:'Me+',short_name:'Me+',icons:[{src:'/brand/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/brand/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'/brand/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}],theme_color:colors.navy,background_color:colors.ivory},null,2)+'\n');
 // A contact sheet is also useful directly in the GitHub README.
 const samples=['masters/icon-rounded.svg','logos/logo-horizontal-light.svg','logos/logo-horizontal-dark.svg','logos/logo-stacked-light.svg','marks/mark-navy.svg','badges/download-android.svg','badges/open-web-app.svg','badges/development-build.svg'];
 const composite=[];
 for(let i=0;i<samples.length;i++){const b=await sharp(Buffer.from(files[samples[i]])).resize(480,320,{fit:'contain',background:colors.ivory}).png().toBuffer();composite.push({input:b,left:40+(i%2)*520,top:40+Math.floor(i/2)*360});}
 write('preview.png',await sharp({create:{width:1080,height:1480,channels:4,background:colors.ivory}}).composite(composite).png().toBuffer());
 const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)]);
 const inventory=walk(root).filter(p=>!p.endsWith('SHA256SUMS')).sort().map(p=>`${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}  ${path.relative(root,p)}`).join('\n');write('SHA256SUMS',inventory+'\n');
 console.log(`Generated ${Object.keys(files).length} vector/config masters plus platform exports.`);
})();
