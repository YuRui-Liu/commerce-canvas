import {expect,it} from 'vitest';
import {latestApprovedGeneration,newestGenerations} from '../../apps/desktop/src/renderer/generation/generationSelection';
it('falls back to the newest approved run after preparing and cancelling another plan, independent of repository order',()=>{
 const first={id:'a',nodeId:'node',createdAt:'2026-01-01T00:00:00Z',approvedAt:'yes'};
 const second={...first,id:'b',createdAt:'2026-01-02T00:00:00Z'};
 const cancelled={...second,id:'c',createdAt:'2026-01-03T00:00:00Z',approvedAt:null};
 const runs=[first,second,cancelled];
 expect(latestApprovedGeneration(runs,'node',cancelled.id)).toBe(second);
 expect(latestApprovedGeneration([...runs].reverse(),'node',cancelled.id)).toBe(second);
 expect(latestApprovedGeneration(runs,'node',first.id)).toBe(first);
 expect(latestApprovedGeneration(runs,'other',cancelled.id)).toBeUndefined();
 expect(newestGenerations(runs).map(r=>r.id)).toEqual(['c','b','a']);
 expect(newestGenerations([{...second,id:'d'},second]).map(r=>r.id)).toEqual(['d','b']);
 expect(runs).toEqual([first,second,cancelled]);
});
