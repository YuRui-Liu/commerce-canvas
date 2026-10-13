import sharp from 'sharp';
import type {ImageProviderPort,ImageTask} from '../../../../packages/contracts/src/imageProvider';
/** Main-process dependency injection, enabled only for a validated temporary
 * hidden test profile. This never adds a renderer IPC or credential capability. */
export function createImageGenerationFixture(){
 const state={submits:0,gets:0,downloads:0,lists:0,listDelayMs:0,mode:'success' as 'success'|'partial'|'slow',delay:100};
 const provider:ImageProviderPort={
  async submit(){const index=++state.submits;await new Promise(resolve=>setTimeout(resolve,state.delay));if(state.mode==='partial'&&index%3===0)throw Error('fixture ambiguous submission');return {id:`fixture-${index}`,status:'running'};},
  async get(id){state.gets++;await new Promise(resolve=>setTimeout(resolve,state.delay));if(!/^fixture-\d+$/.test(id))throw Error('fixture task missing');if(state.mode==='slow')return {id,status:'running',progress:25};if(state.mode==='partial'&&Number(id.split('-')[1])%3===2)return {id,status:'failed'};return {id,status:'succeeded',results:[{url:`https://fixture.invalid/${id}.png`}]} as ImageTask;},
 };
 return {state,credentials:{resolveGrsai:()=> 'isolated-test-key'},options:{providerFactory:()=>provider,pollDelayMs:50,maxPolls:3,download:async(url:string)=>{if(!url.startsWith('https://fixture.invalid/'))throw Error('FIXTURE_URL_REQUIRED');state.downloads++;return new Uint8Array(await sharp({create:{width:800,height:600,channels:3,background:'#d5c9ba'}}).png().toBuffer());}}};
}
