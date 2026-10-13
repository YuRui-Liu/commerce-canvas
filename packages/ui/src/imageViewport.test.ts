import {expect,test} from 'vitest';
import {fitScale} from './imageViewport';
test('compare uses one pixel scale for differently shaped originals',()=>{expect(fitScale([{width:1200,height:600},{width:600,height:1200}],{width:600,height:600},true)).toBe(.25);expect(fitScale([{width:1200,height:600},{width:600,height:1200}],{width:600,height:600},false)).toBe(.5);});
