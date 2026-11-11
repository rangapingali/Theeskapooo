(function (root) {
  // A bounded plan for one sheet; never allocate one canvas per document page.
  function plan(s, image, sheet = 0) {
    root.PrintCore.estimate(s, { image });
    const pages = new Set();
    for (const part of (s.range.trim() || `1-${s.pages}`).split(',')) {
      const [a,b = a] = part.trim().split('-').map(Number);
      for (let n=a;n<=b;n++) pages.add(n);
    }
    const source = [...pages].sort((a,b)=>a-b);
    if (image) { source.length = 0; for(let n=0;n<s.copies;n++) source.push(1); }
    const sides = Math.ceil(source.length/s.layout), duplex = s.sides === 'double';
    const perCopy = Math.ceil(sides/(duplex?2:1));
    const total = perCopy * (image ? 1 : s.copies);
    sheet = Math.max(0,Math.min(total-1,sheet));
    const local = image ? sheet : s.collate === 'off' ? Math.floor(sheet/s.copies) : sheet%perCopy;
    const front = local*(duplex?2:1);
    const cells = side => side < sides ? source.slice(side*s.layout,(side+1)*s.layout) : [];
    return { total, sheet, front:cells(front), back:duplex?cells(front+1):[] };
  }
  root.PaperPreviewPlan = plan;
  if (typeof module !== 'undefined') { module.exports = plan; return; }
  const host = document.querySelector('#paper-preview');
  if (!host) return;
  const $ = s => host.querySelector(s);
  let item, signature='', timer, revision=0, sheet=0, loadedFile, pdf, bitmap, task, busy=false, pending=false;
  let yaw=0, pitch=0;
  function rotate() { $('.paper-object').style.transform=`rotateX(${pitch}deg) rotateY(${yaw}deg)`; }
  $('#paper-turn').oninput=e=>{yaw=Number(e.target.value);rotate();};
  $('#paper-tilt').oninput=e=>{pitch=Number(e.target.value);rotate();};
  $('#paper-reset').onclick=()=>{yaw=pitch=0;$('#paper-turn').value=$('#paper-tilt').value=0;rotate();};
  $('#paper-flip').onclick=()=>{yaw=yaw===180?0:180;$('#paper-turn').value=yaw;rotate();};
  $('#paper-prev').onclick=()=>{sheet--;schedule();};
  $('#paper-next').onclick=()=>{sheet++;schedule();};
  function schedule() { revision++; clearTimeout(timer); timer=setTimeout(render,180); }
  async function load(file) {
    if (file===loadedFile) return;
    await task?.destroy(); task=null; pdf=null; bitmap?.close(); bitmap=null; loadedFile=null;
    if (/\.png$/i.test(file.name)) bitmap=await createImageBitmap(file);
    else {
      const lib=await import('/vendor/pdfjs/pdf.mjs');
      lib.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';
      task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWasm:false,wasmUrl:'/vendor/pdfjs/wasm/',iccUrl:'/vendor/pdfjs/iccs/', cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/'});
      pdf=await task.promise;
    }
    loadedFile=file;
  }
  async function face(canvas, pages, s) {
    const landscape=s.orientation==='landscape';
    canvas.width=landscape?600:424;canvas.height=landscape?424:600;
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
    const cols=s.layout===4 || s.layout===2&&landscape?2:1, rows=s.layout/cols;
    const cw=canvas.width/cols,ch=canvas.height/rows, margin=18*canvas.width/(landscape?841.89:595.28);
    for(let i=0;i<pages.length;i++) {
      let source=bitmap;
      if(pdf) {
        const p=await pdf.getPage(pages[i]); const base=p.getViewport({scale:1});
        const viewport=p.getViewport({scale:Math.min((cw-2*margin)/base.width,(ch-2*margin)/base.height)});
        source=document.createElement('canvas');source.width=Math.ceil(viewport.width);source.height=Math.ceil(viewport.height);
        await p.render({canvasContext:source.getContext('2d'),viewport}).promise;
      }
      const scale=Math.min((cw-2*margin)/source.width,(ch-2*margin)/source.height);
      ctx.drawImage(source,(i%cols)*cw+(cw-source.width*scale)/2,Math.floor(i/cols)*ch+(ch-source.height*scale)/2,source.width*scale,source.height*scale);
    }
    canvas.style.filter=s.colour==='bw'?'grayscale(1)':'none';
  }
  async function render() {
    if(busy){pending=true;return;} busy=true; const rev=revision;
    $('.paper-object').hidden=true;
    try {
      if(!item || item.counting || item.countError) {
        if (!item) { await task?.destroy(); task=null; pdf=null; loadedFile=null; bitmap?.close(); bitmap=null; $('.paper-object').replaceChildren(); }
        $('#paper-status').textContent=item?.countError || 'Select a counted document to see its paper preview.'; return;
      }
      const current=item, s={...item.settings}; const p=plan(s,item.image,sheet); sheet=p.sheet;
      $('#paper-status').textContent='Preparing preview…';
      await load(current.file);
      const front=document.createElement('canvas'),back=document.createElement('canvas');
      await face(front,p.front,s);await face(back,p.back,s);
      if(rev!==revision)return;
      front.className='paper-face';back.className='paper-face paper-back';
      $('.paper-object').replaceChildren(front,back);
      $('.paper-object').style.aspectRatio=s.orientation==='landscape'?'297 / 210':'210 / 297';
      $('.paper-object').style.width=s.orientation==='landscape'?'90%':'64%';
      // The physical flip axis determines how the reverse appears after turning the sheet.
      back.style.transform=s.duplexEdge==='top-bottom'?'rotateX(180deg)':'rotateY(180deg)';
      $('.paper-object').hidden=false;
      $('#paper-status').textContent=`Sheet ${sheet+1} of ${p.total} · A4 · ${s.sides==='double'?'double-sided':'single-sided'}${!p.back.length?' · blank back':''}`;
      $('#paper-prev').disabled=sheet===0;$('#paper-next').disabled=sheet===p.total-1;
    } catch { $('#paper-status').textContent='Preview unavailable. Check the original using “Preview file”. Your settings are unchanged.'; }
    finally { busy=false;if(pending || rev!==revision){pending=false;render();} }
  }
  root.PaperPreview={update(next){const key=next?next.id+JSON.stringify(next.settings)+next.counting+next.countError:'';if(key===signature)return;signature=key;item=next;sheet=0;schedule();}};
  window.addEventListener('pagehide',()=>{clearTimeout(timer);task?.destroy();bitmap?.close();});
})(typeof window==='undefined'?{PrintCore:require('./print-core.js')}:window);
