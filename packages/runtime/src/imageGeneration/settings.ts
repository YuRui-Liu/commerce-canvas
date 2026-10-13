import { GenerationSettingsSchema, type GenerationSettings, type ResolvedGenerationSettings } from '../../../contracts/src/imageGeneration';
export { defaultGenerationSettings, defaultPhotography, photographyPresets } from '../../../contracts/src/imageGeneration';
const normal:Record<GenerationSettings['ratio'],[number,number]>={'1:1':[1024,1024],'3:4':[1090,1443],'4:3':[1443,1090],'2:3':[1024,1536],'3:2':[1536,1024],'9:16':[941,1672],'16:9':[1672,941]};
const vip:Record<string,[number,number][]>={'1:1':[[1024,1024],[2048,2048],[2880,2880]],'16:9':[[1280,720],[2048,1152],[3840,2160]],'4:3':[[1152,864],[2304,1728],[3264,2448]],'3:2':[[1536,1024],[2048,1360],[3504,2336]]};
export function resolveGenerationSettings(input:GenerationSettings):ResolvedGenerationSettings {
  const s=GenerationSettingsSchema.parse(input); let width:number,height:number;
  if(s.model==='gpt-image-2'){
    if(s.resolution!=='1K'||s.width!==undefined||s.height!==undefined)throw new Error('Ordinary model supports only 1K preset dimensions');
    [width,height]=normal[s.ratio];
  }else{
    if(s.resolution==='custom') {if(!s.width||!s.height)throw new Error('Custom dimensions required');width=s.width;height=s.height;}
    else {if(s.width!==undefined||s.height!==undefined)throw new Error('Dimensions require custom resolution');const reversed=!vip[s.ratio];const key=reversed?s.ratio.split(':').reverse().join(':'):s.ratio;[width,height]=vip[key][['1K','2K','4K'].indexOf(s.resolution)];if(reversed)[width,height]=[height,width];}
    if(width%16||height%16||width>3840||height>3840||Math.max(width/height,height/width)>3||width*height<655360||width*height>8294400)throw new Error('Invalid VIP dimensions');
  }
  return {model:s.model,quality:s.model==='gpt-image-2'?'auto':'medium',width,height,aspectRatio:`${width}x${height}`};
}
