import { beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { request } from 'node:https';
import { lookup } from 'node:dns/promises';
import { downloadGenerationImage, isPublicImageAddress } from '../../apps/desktop/src/main/imageGenerationDownload';
vi.mock('node:https',()=>({request:vi.fn()}));
vi.mock('node:dns/promises',()=>({lookup:vi.fn()}));
beforeEach(()=>{vi.resetAllMocks();vi.mocked(lookup).mockResolvedValue([{address:'8.8.8.8',family:4}] as never);});
function responses(...items:{status?:number;headers?:Record<string,string>;bytes?:Buffer}[]){
 for(const item of items)vi.mocked(request).mockImplementationOnce(((url:URL,options:any,callback:any)=>{
   const req=new EventEmitter() as any;req.end=()=>{
    const res=new PassThrough() as any;res.statusCode=item.status??200;res.headers=item.headers??{};
    callback(res);res.end(item.bytes??Buffer.from('image bytes'));
   };return req;
 }) as never);
}
it('pins validated DNS, sends no authorization, and supports Node all-address lookup mode',async()=>{
 responses({});await expect(downloadGenerationImage('https://images.example/test')).resolves.toEqual(Buffer.from('image bytes'));
 const options=vi.mocked(request).mock.calls[0][1] as any;
 expect(options.headers).toEqual({Accept:'image/png,image/jpeg,image/webp'});
 const result=vi.fn();options.lookup('images.example',{all:true},result);
 expect(result).toHaveBeenCalledWith(null,[{address:'8.8.8.8',family:4}]);
});
it.each(['http://images.example/a','https://127.0.0.1/a','https://[::1]/a','https://[::ffff:127.0.0.1]/a','https://user:secret@images.example/a','https://images.example:8443/a'])('rejects unsafe URL %s before request',async url=>{
 await expect(downloadGenerationImage(url)).rejects.toThrow();expect(request).not.toHaveBeenCalled();
});
it('rejects any private DNS answer and private redirect without sending a second request',async()=>{
 vi.mocked(lookup).mockResolvedValueOnce([{address:'8.8.8.8',family:4},{address:'10.1.1.1',family:4}] as never);
 await expect(downloadGenerationImage('https://images.example/a')).rejects.toThrow('UNSAFE_IMAGE_ADDRESS');expect(request).not.toHaveBeenCalled();
 responses({status:302,headers:{location:'https://169.254.169.254/private'}});
 await expect(downloadGenerationImage('https://images.example/a')).rejects.toThrow('UNSAFE_IMAGE_ADDRESS');expect(request).toHaveBeenCalledTimes(1);
});
it('bounds declared download size and redirect loops',async()=>{
 responses({headers:{'content-length':String(51*1024*1024)}});await expect(downloadGenerationImage('https://images.example/a')).rejects.toThrow('IMAGE_TOO_LARGE');
 responses(...Array.from({length:4},()=>({status:302,headers:{location:'/again'}})));
 await expect(downloadGenerationImage('https://images.example/a')).rejects.toThrow('TOO_MANY_IMAGE_REDIRECTS');
});
it('denies special-use addresses rather than merely RFC1918',()=>{
 for(const address of ['0.0.0.0','100.64.1.2','198.18.0.1','192.0.0.1','224.0.0.1','2001:db8::1','2002:7f00:1::','fc00::1','fe80::1'])expect(isPublicImageAddress(address)).toBe(false);
 expect(isPublicImageAddress('8.8.8.8')).toBe(true);expect(isPublicImageAddress('2606:4700:4700::1111')).toBe(true);expect(isPublicImageAddress('2001:4860:4860::8888')).toBe(true);
});
it('bounds DNS lookup time before opening a connection',async()=>{
 vi.useFakeTimers();
 try{
  vi.mocked(lookup).mockImplementation(()=>new Promise(()=>{}));
  const result=expect(downloadGenerationImage('https://images.example/a')).rejects.toThrow('DOWNLOAD_TIMEOUT');
  await vi.advanceTimersByTimeAsync(30_001);await result;expect(request).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
});
