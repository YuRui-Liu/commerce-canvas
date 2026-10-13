import {expect,it} from 'vitest';
import {cpus,platform,arch} from 'node:os';
import type {CanvasDocument} from '../../contracts/src/canvas';
import {layout,canConnect} from './graph';
it('measures layout and connection checks for 200 nodes / 300 DAG edges',()=>{
  const doc:CanvasDocument={id:'benchmark-only',projectId:null,revision:1,viewport:{x:0,y:0,zoom:1},nodes:Array.from({length:200},(_,i)=>({id:`n${i}`,kind:i%2?'agent':'asset',position:{x:0,y:0}})),edges:[]};
  for(let i=0;i<199;i++)doc.edges.push({id:`p${i}`,source:`n${i}`,target:`n${i+1}`,role:'product'});
  for(let i=0;i<101;i++)doc.edges.push({id:`s${i}`,source:`n${i}`,target:`n${i+2}`,role:'style'});
  const start=performance.now();const arranged=layout(doc);const layoutMs=performance.now()-start;
  const checks=performance.now();for(let i=0;i<100;i++)expect(canConnect(doc,'n199','n0','scene')).toBe(false);
  console.log(JSON.stringify({machine:cpus()[0]?.model,platform:platform(),arch:arch(),nodes:200,edges:300,kinds:'100 asset references / 100 unconfigured agents',layoutMs,cycleChecks100Ms:performance.now()-checks}));
  expect(arranged.nodes[199].position.x).toBeGreaterThan(arranged.nodes[0].position.x);
});
