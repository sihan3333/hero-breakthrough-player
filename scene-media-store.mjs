import {MAX_IMAGE_BYTES} from './scene-review-core.mjs';
const DB='hero-breakthrough:scene-images:v1',STORE='images';
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>req.result.createObjectStore(STORE);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('图片存储被其他页面占用。'));});}
async function transaction(mode,action){const db=await openDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode);let result;const req=action(tx.objectStore(STORE));req.onsuccess=()=>{result=req.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('图片存储未完成。'));});}finally{db.close();}}
export const putImage=(hash,blob)=>transaction('readwrite',store=>store.put(blob,hash));
export const getImage=hash=>transaction('readonly',store=>store.get(hash));
export const clearImages=()=>transaction('readwrite',store=>store.clear());
export async function inspectImage(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>MAX_IMAGE_BYTES)throw new Error('请选择 20 MB 以内的 JPG、PNG 或 WebP 截图。');
  const url=URL.createObjectURL(file);try{await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>img.naturalWidth&&img.naturalHeight?resolve():reject(new Error('图片无法读取。'));img.onerror=()=>reject(new Error('图片无法读取，请重新导出截图。'));img.src=url;});}finally{URL.revokeObjectURL(url);}
  const bytes=await file.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
  return {kind:'local',name:file.name.slice(0,200),mime:file.type,size:file.size,fingerprint:[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')};
}
