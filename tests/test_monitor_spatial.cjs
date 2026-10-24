'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root={};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','html','monitor-spatial.js'),'utf8'),
                  {window:root},{filename:'monitor-spatial.js'});
const {automaticPan,panCoefficients,createSpatialChannel}=root.Ka9qMonitorSpatial;
const approximate=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} not equal to ${b}`);
test('auto positions match ka9q-radio C bit reversal',()=>{
  [0,-25,25,-37.5,12.5,-12.5,37.5,-43.75].forEach((p,i)=>approximate(automaticPan(i)*100,p));
});
test('center pan splits amplitude equally',()=>{
  const p=panCoefficients(0);
  approximate(p.leftGain,.5);approximate(p.rightGain,.5);
  approximate(p.leftDelaySeconds,0);approximate(p.rightDelaySeconds,0);
});
test('negative pan favours left and delays the right channel',()=>{
  const p=panCoefficients(-65,1,48000);
  approximate(p.leftGain,.825);approximate(p.rightGain,.175);
  approximate(p.leftDelaySeconds,0);approximate(p.rightDelaySeconds,.000975);
  assert.equal(p.rightDelaySamples,47);
});
test('positive pan favours right and delays left',()=>{
  const p=panCoefficients(65,1,48000);
  approximate(p.leftGain,.175);approximate(p.rightGain,.825);
  assert.equal(p.leftDelaySamples,47);
});
test('endpoints remain one-sided; global gain multiplies both',()=>{
  const a=panCoefficients(-100,0.4),b=panCoefficients(100,0.4);
  approximate(a.leftGain,0.4);approximate(a.rightGain,0);
  approximate(b.leftGain,0);approximate(b.rightGain,0.4);
});
test('spatial graph uses two ear paths into stereo merger',()=>{
  const nodes=[],links=[];
  function make(type) {
    const n={type,connect(dest,from,to){links.push([type,dest.type,from,to])},
      disconnect(){n.disconnected=true}};
    if(type==='gain')n.gain={value:0,setTargetAtTime(v){this.value=v}};
    if(type==='delay')n.delayTime={value:0,setTargetAtTime(v){this.value=v}};
    nodes.push(n);return n;
  }
  const context={sampleRate:48000,currentTime:1,createGain:()=>make('gain'),
    createDelay:()=>make('delay'),createChannelMerger:()=>make('merger')};
  const source=make('source'),bus=make('bus');
  const graph=createSpatialChannel(context,source,bus,-50);
  assert.equal(links.length,7);
  assert.ok(links.some(link=>link[1]==='merger'&&link[3]===1));
  const after=graph.set(25,0.5);
  approximate(after.leftGain,.1875);approximate(after.rightGain,.3125);
  graph.disconnect();
  assert.equal(nodes.filter(n=>n.disconnected).length,5);
});
