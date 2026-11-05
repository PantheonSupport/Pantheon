'use strict';

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

const {actions,step,normalize}=require('../Lib/ui/framework-editor.js');

const definition=JSON.parse(fs.readFileSync(path.join(__dirname,'data/flow-fixture.json'),'utf8'));

test('editor offers only typed input and control-flow actions',()=>{

  assert.deepEqual(actions,['match-result','ocr-input','click-point','click','click-setting','move','walk','scroll','wait','delay','press','key','call','repeat','for-setting','if','retry','until','stop','camera','placements','outcome','click-wait','scroll-option','dismiss','setting-call']);

  for(const action of actions){const s=step(action,definition,'new-step');assert.equal(s.action,action);assert.equal(s.id,'new-step');assert.equal(s.path,undefined);}

  assert.throws(()=>step('run',definition,'bad'));

});
