const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('include/web_page.h','utf8');
const source = html.split('<script>')[1].split('</script>')[0];
assert.match(html, /rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/);
assert.match(html, /id="capture"[^>]*href="\/capture"[^>]*download="SpecialCam\.jpg"/);
async function fixture({confirmed=true,shutdownOK=true,offline=false}={}) {
  const elements=Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],{
    textContent:'',disabled:false,hidden:true,dataset:{},setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];}
  }]));
  const calls=[];
  const context=vm.createContext({
    document:{getElementById:id=>elements[id]},
    confirm:()=>confirmed, AbortController,
    setTimeout:()=>1,clearTimeout:()=>{},
    fetch:async(url,options)=>{
      calls.push({url,options});
      if(url==='/status' && offline)throw Error('Offline');
      return {ok:url==='/shutdown'?shutdownOK:true,
        json:async()=>({
          camera_ready:true,streaming:true,frame_age_ms:100,clients:1,
          ip:'192.168.4.1',power_ready:true,usb:true,battery:true,
          charging:true,battery_mv:3980,shutting_down:false
        })};
    }
  });
  vm.runInContext(source,context);
  await new Promise(setImmediate);
  return {elements,calls};
}
(async()=>{
  for(const confirmed of [false,true]){
    const f=await fixture({confirmed});
    assert.match(f.elements.battery.textContent,/3.98 V/);
    await f.elements.shutdown.onclick();
    const calls=f.calls.filter(c=>c.url==='/shutdown');
    assert.equal(calls.length,confirmed?1:0);
    if(confirmed){
      assert.equal(calls[0].options.method,'POST');
      assert.equal(calls[0].options.headers['X-SpecialCam-Confirm'],'yes');
      assert.equal(f.elements.capture['aria-disabled'],'true');
      assert.match(f.elements.status.textContent,/schakelt uit/);
    }
  }
  let f=await fixture({shutdownOK:false});
  await f.elements.shutdown.onclick();
  assert.equal(f.elements.shutdown.disabled,false);
  assert.match(f.elements.status.textContent,/niet bevestigd/);
  f=await fixture();
  f.elements.capture.onclick({currentTarget:f.elements.capture,preventDefault(){throw Error('unexpected preventDefault');}});
  assert.equal(f.calls.filter(c=>c.url==='/capture').length,0);
  assert.match(f.elements['photo-status'].textContent,/downloads/);
  assert.equal(f.elements.capture['aria-disabled'],'false');
  f=await fixture({offline:true});
  let prevented=false;
  f.elements.capture.onclick({currentTarget:f.elements.capture,preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  console.log('PASS: shutdown cancel/confirm/failure; native JPEG download; offline; battery');
})().catch(e=>{console.error(e);process.exitCode=1;});
