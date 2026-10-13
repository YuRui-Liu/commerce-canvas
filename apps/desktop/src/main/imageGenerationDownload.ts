import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';

/** Fail closed for non-public / special-use addresses, including mapped IPv6. */
export function isPublicImageAddress(address:string):boolean {
  if(isIP(address)===4){
    const [a,b,c]=address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2||b===88&&c===99)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
  }
  if(isIP(address)===6){
    const a=address.toLowerCase();
    const [first,second]=a.split(':').map(part=>parseInt(part||'0',16));
    return /^[23][0-9a-f]{3}:/.test(a)&&!(first===0x2001&&(second<0x200||second===0xdb8))&&first!==0x2002&&first!==0x3fff;
  }
  return false;
}

/** DNS is checked and pinned per hop. No provider credentials or cookies are sent. */
export async function downloadGenerationImage(value:string):Promise<Uint8Array>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30_000);
  const limit=50*1024*1024;
  try {
    let url=new URL(value);
    for(let hop=0;hop<=3;hop++){
      if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw Error('UNSAFE_IMAGE_URL');
      const hostname=url.hostname.replace(/^\[|\]$/g,'');
      const addresses=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await Promise.race([
        lookup(hostname,{all:true,verbatim:true}),
        new Promise<never>((_,reject)=>{if(controller.signal.aborted)reject(Error('DOWNLOAD_TIMEOUT'));else controller.signal.addEventListener('abort',()=>reject(Error('DOWNLOAD_TIMEOUT')),{once:true});}),
      ]);
      if(!addresses.length||addresses.some(a=>!isPublicImageAddress(a.address)))throw Error('UNSAFE_IMAGE_ADDRESS');
      if(controller.signal.aborted)throw Error('DOWNLOAD_TIMEOUT');
      const response=await new Promise<{redirect?:string;bytes?:Buffer}>((resolve,reject)=>{
        const address=addresses[0];
        const req=request(url,{method:'GET',signal:controller.signal,headers:{Accept:'image/png,image/jpeg,image/webp'},lookup:(_host,options,callback)=>options.all?callback(null,[address]):callback(null,address.address,address.family)},res=>{
          const status=res.statusCode??0;
          if([301,302,303,307,308].includes(status)){const location=res.headers.location;res.destroy();if(!location)reject(Error('INVALID_IMAGE_REDIRECT'));else resolve({redirect:location});return;}
          if(status!==200){res.destroy();reject(Error('IMAGE_DOWNLOAD_FAILED'));return;}
          if(Number(res.headers['content-length'])>limit){res.destroy();reject(Error('IMAGE_TOO_LARGE'));return;}
          const chunks:Buffer[]=[];let size=0;
          res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>limit){res.destroy(Error('IMAGE_TOO_LARGE'));return;}chunks.push(chunk);});
          res.on('error',()=>reject(Error('IMAGE_DOWNLOAD_FAILED')));
          res.on('end',()=>size?resolve({bytes:Buffer.concat(chunks)}):reject(Error('EMPTY_IMAGE')));
        });
        req.on('error',()=>reject(Error('IMAGE_DOWNLOAD_FAILED')));req.end();
      });
      if(response.bytes)return response.bytes;
      url=new URL(response.redirect!,url);
    }
    throw Error('TOO_MANY_IMAGE_REDIRECTS');
  }finally{clearTimeout(timer);}
}
