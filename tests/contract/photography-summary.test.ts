import {expect,it} from 'vitest';
import {defaultPhotography,type Photography} from '../../packages/contracts/src/imageGeneration';
import {photographySummary} from '../../apps/desktop/src/renderer/generation/photographySummary';
it('counts every active photography field and ignores an inactive custom-camera description',()=>{
 expect(photographySummary(defaultPhotography())).toBe('自动');
 const values:Partial<Photography>={camera:'fullframe',lens:'macro',focalLength:100,aperture:'f8',angle:'45',framing:'detail',lighting:'window',direction:'left45',softness:'soft',temperature:'warm',shadow:'light'};
 for(const [key,value] of Object.entries(values))expect(photographySummary({...defaultPhotography(),[key]:value})).toBe('1 项已配置');
 expect(photographySummary({...defaultPhotography(),lens:'macro',focalLength:100})).toBe('2 项已配置');
 expect(photographySummary({...defaultPhotography(),customCamera:'旧描述'})).toBe('自动');
 expect(photographySummary({...defaultPhotography(),camera:'custom',customCamera:'商业摄影'})).toBe('2 项已配置');
});
