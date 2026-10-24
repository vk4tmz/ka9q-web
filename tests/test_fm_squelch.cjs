'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','html','fm-squelch.js'),'utf8');
const root={};
vm.runInNewContext(src,{window:root},{filename:'fm-squelch.js'});
const {calculate,valid}=root.Ka9qFmSquelch;
const plain=x=>JSON.parse(JSON.stringify(x));
test('Open/Close and hysteresis are linked',()=>{
  assert.deepEqual(plain(calculate(10,6,4,'close')),{open:10,close:6,hysteresis:4});
  assert.deepEqual(plain(calculate(12,6,4,'open')),{open:12,close:8,hysteresis:4});
  assert.deepEqual(plain(calculate(10,7,4,'close')),{open:10,close:7,hysteresis:3});
  assert.deepEqual(plain(calculate(10,6,6,'hysteresis')),{open:10,close:4,hysteresis:6});
});
test('minimum Open is +0.1 dB, separate from Monitor',()=>{
  assert.equal(valid(plain(calculate(0,-4,4,'close'))),false);
  assert.equal(valid({open:0.05,close:-3.95,hysteresis:4}),false);
  assert.equal(valid(plain(calculate(0.1,-3.9,4,'close'))),true);
  assert.equal(valid({open:0.15,close:-3.85,hysteresis:4}),false);
});
test('invalid combinations rejected',()=>{
  assert.equal(valid(plain(calculate(5,7,4,'close'))),false);
  assert.equal(valid(plain(calculate(41,6,4,'open'))),false);
});
function setup(){
  function node(value=''){
    return {value,checked:false,disabled:false,hidden:false,textContent:'',style:{},handlers:{},
      addEventListener(k,fn){this.handlers[k]=fn},fire(k){this.handlers[k]?.()}};
  }
  const nodes={mode:node('fm'),fmSquelchControls:node(),fmSqOpen:node(),
    fmSqClose:node(),fmSqHysteresis:node(),fmSqApply:node(),
    fmSqMonitor:node(),fmSqStatus:node()};
  const commands=[],timers=[];
  const client={document:{readyState:'complete',getElementById:id=>nodes[id]||null},
    sendControl(...args){commands.push(args)},
    setTimeout(fn,delay){timers.push({fn,delay})}};
  vm.runInNewContext(src,{window:client,Date},{filename:'fm-squelch.js'});
  return {nodes,commands,timers,ui:client.Ka9qFmSquelch};
}
test('0 dB is blocked and 0.1/-3.9 confirms normally',()=>{
  const {nodes,commands,ui}=setup();
  ui.onStatus(1,10,6);
  nodes.fmSqOpen.value='0';
  nodes.fmSqOpen.fire('input');
  assert.equal(nodes.fmSqClose.value,'-4');
  assert.equal(nodes.fmSqApply.disabled,true);
  assert.match(nodes.fmSqStatus.textContent,/at least 0\.1 dB/);
  nodes.fmSqApply.fire('click');
  assert.equal(commands.length,0);
  nodes.fmSqOpen.value='0.1';
  nodes.fmSqOpen.fire('input');
  assert.equal(nodes.fmSqClose.value,'-3.9');
  assert.equal(nodes.fmSqApply.disabled,false);
  nodes.fmSqApply.fire('click');
  assert.match(commands[0][1],/^Q:0\.1:-3\.9:/);
  assert.match(nodes.fmSqStatus.textContent,/awaiting radiod readback/);
  ui.onStatus(1,0.1,-3.9);
  assert.match(nodes.fmSqStatus.textContent,/confirmed by radiod/);
});
test('Monitor command, receiver confirmation and restore of previous thresholds',()=>{
  const {nodes,commands,ui}=setup();
  ui.onStatus(1,10,6);
  nodes.fmSqMonitor.checked=true;
  nodes.fmSqMonitor.fire('change');
  assert.match(commands[0][1],/^Q:MONITOR:/);
  assert.match(nodes.fmSqStatus.textContent,/awaiting radiod readback/);
  ui.onStatus(1,-500,-500);
  assert.equal(nodes.fmSqMonitor.checked,true);
  assert.equal(nodes.fmSqOpen.disabled,true);
  assert.match(nodes.fmSqStatus.textContent,/confirmed by radiod/);
  nodes.fmSqMonitor.checked=false;
  nodes.fmSqMonitor.fire('change');
  assert.match(commands[1][1],/^Q:10\.0:6\.0:/);
  ui.onStatus(1,10,6);
  assert.equal(nodes.fmSqMonitor.checked,false);
  assert.equal(nodes.fmSqOpen.disabled,false);
});
test('No status readback times out and does not claim success',()=>{
  const {nodes,timers,ui}=setup();
  ui.onStatus(1,10,6);
  nodes.fmSqOpen.value='0.5';
  nodes.fmSqOpen.fire('input');
  nodes.fmSqApply.fire('click');
  assert.equal(timers.length,1);
  assert.equal(timers[0].delay,8000);
  timers[0].fn();
  assert.match(nodes.fmSqStatus.textContent,/No matching radiod readback/);
});
test('controls hidden in USB mode and cannot Apply',()=>{
  const {nodes,ui}=setup();
  ui.onStatus(1,10,6);
  nodes.mode.value='usb';
  nodes.mode.fire('change');
  assert.equal(nodes.fmSquelchControls.hidden,true);
  assert.equal(nodes.fmSqApply.disabled,true);
});
