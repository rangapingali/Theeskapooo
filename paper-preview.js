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
  // Render originals without Chrome's embedded PDF plugin or an iframe.
  root.DocumentPreview = (file, container) => {
    let closed=false, loading, doc, pageNumber=1, rendering=false;
    const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Loading document preview...';
    const controls=document.createElement('div');controls.className='paper-controls';
    const previous=document.createElement('button'), next=document.createElement('button');
    for(const button of [previous,next]) {button.type='button';button.className='secondary-action';button.disabled=true;}
    previous.textContent='Previous page';next.textContent='Next page';controls.append(previous,next);
    const canvas=document.createElement('canvas');canvas.style.cssText='display:block;max-width:100%;height:auto;margin:16px auto;background:white';
    const download=document.createElement('a'); const url=URL.createObjectURL(file);
    download.href=url;download.download=file.name;download.textContent='Download original file';download.className='quiet';
    container.append(status,controls,canvas,download);
    async function render() {
      if(closed||rendering||!doc)return;rendering=true;previous.disabled=next.disabled=true;
      try {
        const page=await doc.getPage(pageNumber); if(closed)return;
        const size=page.getViewport({scale:1}); const viewport=page.getViewport({scale:Math.min(1.5,1200/Math.max(size.width,size.height))});
        canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
        if(!closed)status.textContent=`Page ${pageNumber} of ${doc.numPages}`;
      } catch {if(!closed)status.textContent='Preview could not be displayed. Download the original to review it.';}
      finally {rendering=false;if(!closed){previous.disabled=pageNumber===1;next.disabled=pageNumber===doc.numPages;}}
    }
    previous.onclick=()=>{if(!rendering){pageNumber--;render();}};next.onclick=()=>{if(!rendering){pageNumber++;render();}};
    (async()=>{
      try {
        const lib=await import('/vendor/pdfjs/pdf.mjs');if(closed)return;
        lib.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';
        const data=new Uint8Array(await file.arrayBuffer());if(closed)return;
        loading=lib.getDocument({data,isEvalSupported:false,useWasm:false,wasmUrl:'/vendor/pdfjs/wasm/',iccUrl:'/vendor/pdfjs/iccs/',cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/'});
        doc=await loading.promise;await render();
      } catch {if(!closed)status.textContent='Preview unavailable. Download the original to review it. Your print settings are unchanged.';}
    })();
    return ()=>{closed=true;loading?.destroy();URL.revokeObjectURL(url);};
  };
  const host = document.querySelector('#paper-preview');
  if (!host) return;
  const $ = s => host.querySelector(s);
  let item, signature='', timer, revision=0, sheet=0, loadedFile, pdf, bitmap, task, busy=false, pending=false;
  let yaw=0, pitch=0;
  function rotate() { $('.paper-object').style.transform=`rotateX(${pitch}deg) rotateY(${yaw}deg)`; }
  const stage=$('.paper-stage'); let drag=null;
  $('#paper-motion').onclick=()=>{
    const paused=stage.classList.toggle('motion-paused');
    $('#paper-motion').setAttribute('aria-pressed',String(paused));
    $('#paper-motion').textContent=paused?'Resume motion':'Pause motion';
    $('#paper-motion').setAttribute('aria-label',paused?'Resume automatic rotation':'Pause automatic rotation');
  };
  stage.addEventListener('pointerdown',e=>{
    if(e.target.closest('button'))return;
    drag={x:e.clientX,y:e.clientY,yaw,pitch};stage.setPointerCapture(e.pointerId);stage.classList.add('interacting');
  });
  stage.addEventListener('pointermove',e=>{
    if(drag){yaw=drag.yaw+(e.clientX-drag.x)*.8;pitch=Math.max(-180,Math.min(180,drag.pitch-(e.clientY-drag.y)*.5));}
    else if(e.pointerType==='mouse') {const r=stage.getBoundingClientRect();yaw=((e.clientX-r.left)/r.width-.5)*60;pitch=-((e.clientY-r.top)/r.height-.5)*25;}
    rotate();
  });
  const endDrag=()=>{drag=null;stage.classList.remove('interacting');};
  stage.addEventListener('pointerup',endDrag);stage.addEventListener('pointercancel',endDrag);
  stage.addEventListener('keydown',e=>{
    if(e.target!==stage)return;
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;
    e.preventDefault();if(e.key==='Home'){yaw=pitch=0;}else if(e.key==='ArrowLeft')yaw-=15;else if(e.key==='ArrowRight')yaw+=15;else if(e.key==='ArrowUp')pitch-=15;else pitch+=15;rotate();
  });
  if(window.IntersectionObserver) new IntersectionObserver(entries=>stage.classList.toggle('offscreen',!entries[0].isIntersecting)).observe(stage);
  document.addEventListener('visibilitychange',()=>stage.classList.toggle('tab-hidden',document.hidden));
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
    canvas.width=landscape?1000:707;canvas.height=landscape?707:1000;
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
      $('.paper-object').style.width=s.orientation==='landscape'?'86%':'70%';
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
