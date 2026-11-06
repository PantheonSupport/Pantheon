'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('RunSettings implements Discord Components V2 structure and URL formatting',()=>{
  const ahk=read('Lib/RunSettings.ahk');
  assert.ok(ahk.includes('32768'));
  assert.ok(ahk.includes('with_components=true'));
  assert.ok(ahk.includes('"type", 17'));
  assert.ok(ahk.includes('"type", 10'));
  assert.ok(ahk.includes('"type", 14'));
  assert.ok(ahk.includes('"type", 1'));
  assert.ok(ahk.includes('"type", 2'));
  assert.ok(ahk.includes('"style", 5'));
  assert.ok(ahk.includes('allowed_mentions'));
  assert.ok(ahk.includes('TestWebhook()'));
  assert.ok(ahk.includes('Dispatch('));
  assert.ok(ahk.includes('SendEvent('));
  assert.ok(ahk.includes('DispatchEvent('));
  assert.ok(!ahk.includes(';'));

  const hubAhk=read('Lib/Pantheon.ahk');
  assert.ok(hubAhk.includes('case "dispatchWebhook":'));
  assert.ok(hubAhk.includes('case "testWebhook":'));
  assert.ok(!hubAhk.includes(';'));
});

test('run settings schema defines all supported event webhook and ping toggles',()=>{
  const schema=JSON.parse(read('Lib/ui/run-settings-schema.json'));
  const events=['Completed','Loss','Disconnect','Reconnect','Stopping','Shop'];
  for(const ev of events){
    assert.ok(schema.general.some(f=>f.key==='Webhook'+ev+'E'&&f.type==='toggle'&&f.eventType==='webhook'));
    assert.ok(schema.general.some(f=>f.key==='Ping'+ev+'E'&&f.type==='toggle'&&f.eventType==='ping'));
  }
});
