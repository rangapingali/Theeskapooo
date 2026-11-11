const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../print-core.js');
const plan=require('../paper-preview.js');
const {sidePlan,selected}=require('../server/shop-print-pdf.cjs');
test('paper preview matches prepared PDF sheet ordering, padding and image packing',()=>{
  for(const image of [true,false]) for(const copies of [1,2,3]) for(const layout of [1,2,4]) for(const sides of ['single','double']) for(const collate of ['on','off']) {
    const s={...core.defaults,pages:image?1:7,copies,layout,sides,collate,range:image?'':'7,1-3,2'};
    const source=image?Array(copies).fill(1):selected(s.range,s.pages).map(n=>n+1);
    const expected=sidePlan(Math.ceil(source.length/layout),image?1:copies,sides==='double',collate==='on');
    const stride=sides==='double'?2:1;
    assert.equal(plan(s,image).total,Math.ceil(expected.length/stride));
    for(let sheet=0;sheet<plan(s,image).total;sheet++) {
      const p=plan(s,image,sheet);
      const cells=i=>expected[i]==null?[]:source.slice(expected[i]*layout,(expected[i]+1)*layout);
      assert.deepEqual(p.front,cells(sheet*stride));
      assert.deepEqual(p.back,stride===2?cells(sheet*stride+1):[]);
    }
  }
});
test('preview rejects invalid settings and clamps navigation',()=>{
  assert.throws(()=>plan({...core.defaults,range:'2'},false));
  assert.equal(plan(core.defaults,false,999).sheet,0);
  assert.equal(plan(core.defaults,false,-1).sheet,0);
});
