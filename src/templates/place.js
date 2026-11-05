/* ===================== PLACE EXPLORER (ITL1 / ITL2 / TTWA) ===================== */
const PLP = D.place;
const PY = PLP ? PLP.years : [];
const NY = PY.length, LY = NY-1;
const PL_PAL=['#0085ca','#00B388','#e8a600','#7b3fe4','#e8710a','#00a3a1'];
const PL_COL_PLACE=C.pink, PL_COL_UK=C.pd, PL_COL_ENG='#3a6ea5';
const PL_TYPE_COL={'Innovation-intensive city-regions':C.pink,'Major regional cities':C.blue,
  'Mid-sized and market towns':C.green,'Post-industrial towns and cities':C.pd,'Rural and dispersed areas':'#e8a600'};
const PL_NONENG=['Scotland','Wales','Northern Ireland'];
const PS={level:'itl1',place:null,bench:{uk:true,eng:true},extra:[],scale:'per',set:'all'};
const PL_AREAS={}, PL_LOGO='__PL_LOGO__', PL_LOGO_W='__PL_LOGO_W__';

/* ---------- formatting ---------- */
function plFmt(v,f){
  if(v==null||!isFinite(v)) return '–';
  switch(f){
    case 'gbp': return v>=1e6?'£'+(v/1e6).toFixed(2)+'bn':v>=1000?'£'+(v/1000).toFixed(v>=100000?0:1)+'m':'£'+Math.round(v)+'k';
    case 'gbp1': return '£'+v.toFixed(1)+'k';
    case 'gbp0': return '£'+Math.round(v).toLocaleString('en-GB');
    case 'n': return Math.round(v).toLocaleString('en-GB');
    case 'n1': return v.toFixed(1);
    case 'pct': return v.toFixed(1)+'%';
    case 'pcts': return (v>0?'+':'')+v.toFixed(1)+'%';
  }
  return String(v);
}
const plN=b=>b.key==='uk'?'the UK':b.name;
const plShort=s=> s.length>40?s.slice(0,38)+'…':s;

/* ---------- areas and entities ---------- */
const plKey=(lvl,p)=> lvl==='itl1'?p.r : lvl==='itl2'?p.i2 : p.t;
const plName=(lvl,id)=> lvl==='itl1'?id : lvl==='itl2'?(PLP.itl2[id]?PLP.itl2[id].name:id) : (PLP.ttwa[id]?PLP.ttwa[id].name:id);
function plAreas(lvl){
  if(PL_AREAS[lvl]) return PL_AREAS[lvl];
  const m={};
  PLP.provs.forEach(p=>{const id=plKey(lvl,p); if(!id) return;
    const a=m[id]||(m[id]={id,name:plName(lvl,id),provs:[],_r:{}}); a.provs.push(p); if(p.r) a._r[p.r]=(a._r[p.r]||0)+1;});
  Object.values(m).forEach(a=>{
    a.r=lvl==='itl1'?a.id:(lvl==='itl2'&&PLP.itl2[a.id]?PLP.itl2[a.id].r:null);
    if(!a.r){let b=-1;for(const r in a._r) if(a._r[r]>b){b=a._r[r];a.r=r;}}
    let sw=0,sa=0,so=0; a.provs.forEach(p=>{if(p.lat==null) return; const w=Math.max(p.s.bci[LY]||0,1); sw+=w; sa+=w*p.lat; so+=w*p.lon;});
    a.lat=sw?sa/sw:null; a.lon=sw?so/sw:null;
  });
  return PL_AREAS[lvl]=m;
}
function plAggregate(provs){
  const M=Object.keys(PLP.provs[0].s), s={}, n=Array(NY).fill(0);
  M.forEach(k=>s[k]=Array(NY).fill(null));
  provs.forEach(p=>{M.forEach(k=>{const a=p.s[k];for(let y=0;y<NY;y++) if(a[y]!=null) s[k][y]=(s[k][y]||0)+a[y];});
    for(let y=0;y<NY;y++) if(p.s.bci[y]!=null) n[y]++;});
  return {s,n,provs};
}
const plSetF=ps=>PS.set==='core'?ps.filter(p=>p.core):ps;
function plEntities(){
  const A=plAreas(PS.level), out=[], pl=A[PS.place];
  if(pl) out.push(Object.assign({key:'place',name:pl.name,col:PL_COL_PLACE,w:4,dash:'solid',main:true},plAggregate(plSetF(pl.provs))));
  if(PS.bench.uk) out.push(Object.assign({key:'uk',name:'UK',col:PL_COL_UK,w:2.5,dash:'dash'},plAggregate(plSetF(PLP.provs))));
  if(PS.bench.eng) out.push(Object.assign({key:'eng',name:'England',col:PL_COL_ENG,w:2.5,dash:'dash'},plAggregate(plSetF(PLP.provs.filter(p=>!PL_NONENG.includes(p.r))))));
  PS.extra.forEach((id,i)=>{const a=A[id]; if(a) out.push(Object.assign({key:'x'+id,id,name:a.name,col:PL_PAL[i%PL_PAL.length],w:2.5,dash:'solid'},plAggregate(plSetF(a.provs))));});
  return out;
}
/* value helpers: money and counts follow the per-university / total switch; ratios never scale */
function plAmt(e,k,y){const v=e.s[k][y]; if(v==null) return null; if(PS.scale==='per'){return e.n[y]?v/e.n[y]:null;} return v;}
function plRat(e,num,den,mult,y){const a=e.s[num][y],b=e.s[den][y]; return (a==null||!b)?null:a/b*(mult||1);}
function plCagr(arr,y,n){if(y<n) return null; const a=arr[y-n],b=arr[y]; return (a>0&&b>0)?(Math.pow(b/a,1/n)-1)*100:null;}
const plBciSeries=e=>PY.map((_,y)=>plAmt(e,'bci',y));
const plUnit=()=>PS.scale==='per'?'per university':'total';

/* ---------- extra helpers ---------- */
const PL_IND=[
  ['Collaboration activity',[['SME interactions','nsme','n1'],['Large business interactions','nlc','n1']]],
  ['Investment in collaboration',[['Business collaboration income','bci','gbp'],['BCI from SMEs','sme','gbp'],['BCI from large business','lc','gbp'],['UK industry funds in HE R&D','ukind','gbp']]],
  ['Products of collaboration',[['Licences granted','licn','n1'],['Licensing income','lic','gbp'],['Spin-outs surviving 3+ years','spin','n1']]]];
const PL_CMP=['YoY change','vs 5-year average','vs 10-year average','vs 2018/19 (pre-Covid)'];
const PL_CL=['Anchored research-intensive','Contract-research growers','SME & locally embedded growers','Contracting collaborators','Regeneration-exposed, eroding'];
const PL_CL_COL=[C.pd,C.pink,C.blue,C.green,'#e8a600','#aaa5bb'];
const plClOf=p=>{const c=p.cl||''; const i=PL_CL.findIndex(n=>c.startsWith(n)); return i<0?5:i;};
const plClName=i=>i<5?PL_CL[i]:'Other (low-volume or not clustered)';
function plIndStats(e,k){
  const a=PY.map((_,y)=>plAmt(e,k,y)), cur=a[LY];
  const avg=(i0,i1)=>{let s=0,n=0;for(let i=i0;i<=i1;i++) if(a[i]!=null){s+=a[i];n++;} return n?s/n:null;};
  const base=[a[LY-1],avg(LY-5,LY-1),avg(LY-10,LY-1),a[4]];
  return {cur,base,chg:base.map(b=>(cur==null||b==null||!b)?null:(cur/b-1)*100)};
}
const plArrow=p=>p==null?'<span style="color:#aaa">n/a</span>':p>=10?'<span class="arrow a-uu">⏫</span>':p>=1?'<span class="arrow a-u">⌃</span>':p>-1?'<span class="arrow a-f">—</span>':p>-10?'<span class="arrow a-d">⌄</span>':'<span class="arrow a-dd">⏬</span>';
const plBucket=p=>p==null?null:p>=1?'above':p<=-1?'below':'at';
function plAllInd(e){const o=[]; PL_IND.forEach(c=>c[1].forEach(r=>o.push({cat:c[0],name:r[0],k:r[1],f:r[2],st:plIndStats(e,r[1])}))); return o;}
const plPct=(v,d)=>v==null?'–':(v>0?'+':'')+v.toFixed(d==null?0:d)+'%';
const plSign=v=>v>=0?'up':'down';
const plLast=a=>{for(let i=a.length-1;i>=0;i--) if(a[i]!=null) return a[i]; return null;};

/* ---------- controls ---------- */
function plOptionsHtml(lvl,excl,ph){
  const A=Object.values(plAreas(lvl)).filter(a=>!excl||!excl.includes(a.id));
  const byR={}; A.forEach(a=>(byR[a.r||'Other']=byR[a.r||'Other']||[]).push(a));
  let h=ph?`<option value="">${ph}</option>`:'';
  if(lvl==='itl1') return h+A.sort((p,q)=>p.name.localeCompare(q.name)).map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
  Object.keys(byR).sort().forEach(r=>{h+=`<optgroup label="${r}">`+byR[r].sort((p,q)=>p.name.localeCompare(q.name)).map(a=>`<option value="${a.id}">${a.name}</option>`).join('')+'</optgroup>';});
  return h;
}
function plDefaultPlace(lvl){const A=Object.values(plAreas(lvl)); A.sort((p,q)=>q.provs.length-p.provs.length||p.name.localeCompare(q.name)); return A[0].id;}
function plFillSelects(){
  document.getElementById('plPlace').innerHTML=plOptionsHtml(PS.level,null,null);
  document.getElementById('plPlace').value=PS.place;
  document.getElementById('plAdd').innerHTML=plOptionsHtml(PS.level,[PS.place].concat(PS.extra),'Add a place…');
}
const PX={cagrSeg:'bci',berdBase:null};
function renderPlace(){
  if(!PLP||!PLP.provs){document.getElementById('tab-place').insertAdjacentHTML('beforeend','<p>Place data unavailable (input/master_panel.xlsx was not found at build time).</p>');return;}
  PS.place=plDefaultPlace(PS.level); plFillSelects();
  const seg=(id,fn)=>document.getElementById(id).addEventListener('click',e=>{const b=e.target.closest('button'); if(!b) return;
    if(!document.getElementById(id).classList.contains('multi')) document.querySelectorAll('#'+id+' button').forEach(x=>x.classList.toggle('active',x===b));
    fn(b); plRender();});
  seg('plLevel',b=>{PS.level=b.dataset.v;PS.extra=[];PS.place=plDefaultPlace(PS.level);plFillSelects();});
  seg('plScale',b=>{PS.scale=b.dataset.v;});
  seg('plSet',b=>{PS.set=b.dataset.v;});
  seg('plBench',b=>{b.classList.toggle('active'); PS.bench[b.dataset.v]=b.classList.contains('active');});
  seg('plCagrSeg',b=>{PX.cagrSeg=b.dataset.v;});
  document.getElementById('plPlace').addEventListener('change',e=>{PS.place=e.target.value;PS.extra=PS.extra.filter(x=>x!==PS.place);plFillSelects();plRender();});
  document.getElementById('plAdd').addEventListener('change',e=>{const v=e.target.value; if(v&&!PS.extra.includes(v)&&PS.extra.length<4) PS.extra.push(v); plFillSelects(); plRender();});
  document.getElementById('plChips').addEventListener('click',e=>{const b=e.target.closest('button[data-id]'); if(!b) return; PS.extra=PS.extra.filter(x=>x!==b.dataset.id); plFillSelects(); plRender();});
  document.getElementById('plBerdBase').addEventListener('change',e=>{PX.berdBase=+e.target.value; plBerd(plEntities());});
  document.getElementById('plPptArea').addEventListener('click',plPptx);
  plRender();
}
function plRender(){
  const E=plEntities(); if(!E.length) return;
  plChips(E); plKpis(E); plMap(E); plProfile(E);
  plHeads(E); plBerd(E); plCpm(E); plBci(E); plTypes(E); plCagrChart(E); plClusters(E); plProducts(E); plEco(E);
  plStories(E);
}
function plChips(E){
  document.getElementById('plChips').innerHTML=E.map(e=>`<span class="pl-chip" style="background:${e.col}">${e.key==='place'?'📍 ':''}${e.name}${e.key[0]==='x'?`<button data-id="${e.id}" aria-label="Remove ${e.name}">✕</button>`:''}</span>`).join('');
}
function plKpis(E){
  const P=E[0], B=E.slice(1), y=LY, u=plUnit();
  const def=[
    {l:'universities reporting, '+PY[y],v:e=>e.n[y],f:'n',cls:''},
    {l:'BCI '+u+', '+PY[y],v:e=>plAmt(e,'bci',y),f:'gbp',cls:'g'},
    {l:'BCI per academic (£000)',v:e=>plRat(e,'bci','acad',1,y),f:'gbp1',cls:'b'},
    {l:'SME share of BCI',v:e=>plRat(e,'sme','bci',100,y),f:'pct',cls:'y'}];
  document.getElementById('plKpis').innerHTML=def.map(d=>{
    const cmp=B.map(b=>`<span style="color:${b.col};font-weight:700">${b.key==='uk'?'UK':plShort(b.name)}</span> ${plFmt(d.v(b),d.f)}`).join(' · ');
    return `<div class="kpi ${d.cls}" style="padding:10px 12px"><div class="v" style="font-size:22px">${plFmt(d.v(P),d.f)}</div><div class="l">${d.l}</div><div style="font-size:11px;margin-top:4px;line-height:1.4">${cmp}</div></div>`;}).join('');
}

/* ---------- trend helpers ---------- */
function plTrace(e,y,name,extra){
  return Object.assign({x:PY,y:y,name:name||e.name,legendgroup:e.key,mode:'lines+markers',connectgaps:false,
    line:{color:e.col,width:e.w,dash:e.dash},marker:{size:e.key==='place'?7:5,color:e.col}},extra||{});
}
function plSub(id,panels,cols,height,ents){
  const E=ents||plEntities(), rows=Math.ceil(panels.length/cols), tr=[], lay={height:height||(rows*300+80),margin:{l:60,r:20,t:56,b:60},legend:{orientation:'h',y:-0.08},annotations:[]};
  const gx=0.07, gy=0.2;
  panels.forEach((p,i)=>{
    const c=i%cols, r=Math.floor(i/cols), sfx=i?String(i+1):'';
    const w=(1-gx*(cols-1))/cols, h=(1-gy*(rows-1))/rows, x0=c*(w+gx), y1=1-r*(h+gy), y0=y1-h;
    lay['xaxis'+sfx]={domain:[x0,x0+w],anchor:'y'+sfx,gridcolor:'#eeebf1',tickangle:-45,tickfont:{size:10}};
    lay['yaxis'+sfx]={domain:[y0,y1],anchor:'x'+sfx,gridcolor:'#eeebf1',tickformat:p.tf||',',rangemode:'tozero'};
    lay.annotations.push({xref:'paper',yref:'paper',x:x0,y:y1+0.03,text:'<b>'+p.t+'</b>',showarrow:false,xanchor:'left',yanchor:'bottom',font:{size:12.5,color:C.pd}});
    E.forEach(e=>{const ys=PY.map((_,y)=>{const v=p.get(e,y); return v==null?null:v;});
      tr.push(plTrace(e,ys,null,{xaxis:'x'+sfx,yaxis:'y'+sfx,showlegend:i===0,hovertemplate:'%{x}: <b>%{y:'+(p.hf||',.1f')+'}</b>'+(p.suffix||'')+'<extra>'+e.name+'</extra>'}));});
  });
  Plotly.newPlot(id,tr,L(lay),CFG);
}
const plM=k=>(e,y)=>{const v=plAmt(e,k,y); return v==null?null:v/1000;};

/* ---------- 1. business R&D backdrop ---------- */
const PL_YR=y=>y; // calendar-year helper
function plBerdSeries(E){
  const B=PLP.berd||{}, R=B.region; if(!R||!R.length) return null;
  const cpi=PLP.cpi, toReal=r=>{ if(r.p!=='nominal') return r.v; const ay=r.y+'/'+String((r.y+1)%100).padStart(2,'0'); const c=cpi[ay]; return c?r.v/c*100:r.v; };
  const norm=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
  const A=plAreas(PS.level), out=[];
  E.forEach(e=>{
    let want=e.key==='uk'?['unitedkingdom','uk']:e.key==='eng'?['england']:[norm(e.name)];
    let note='';
    let rows=R.filter(r=>want.includes(norm(r.a)));
    if(!rows.length&&(e.key==='place'||e.key[0]==='x')){const a=e.key==='place'?A[PS.place]:A[e.id]; if(a&&a.r){rows=R.filter(r=>norm(r.a)===norm(a.r)); note=' (region: '+a.r+')';}}
    if(rows.length){const m={}; rows.forEach(r=>m[r.y]=toReal(r)); out.push({e,name:e.name+note,m});}
  });
  return out.length?out:null;
}
function plBerd(E){
  const B=PLP.berd||{}, A=plAreas(PS.level)[PS.place], ser=plBerdSeries(E);
  const noteEl=document.getElementById('plBerdTrendNote');
  // (a) trend
  const tsrc=document.getElementById('plBerdTrendSrc');
  if(ser){
    const yrs=[...new Set(ser.flatMap(s=>Object.keys(s.m).map(Number)))].sort();
    noteEl.textContent='£m, real terms';
    Plotly.newPlot('chBerdTrend',ser.map(s=>plTrace(s.e,yrs.map(y=>s.m[y]==null?null:s.m[y]),s.name,{x:yrs,hovertemplate:'%{x}: <b>£%{y:,.0f}m</b><extra>'+s.name+'</extra>'})),L({height:420,margin:{l:70,r:20,t:10,b:90},legend:{orientation:'h',y:-0.2},xaxis:{dtick:1,tickformat:'d'},yaxis:{title:{text:'£m, real 2024/25 prices',font:{size:12}},gridcolor:'#eeebf1',rangemode:'tozero'}}),CFG);
    tsrc.textContent='ONS BERD 2024 (published Nov 2025), expenditure on R&D performed in UK businesses by ITL region, 2022 to 2024, converted to real terms with the CPM price index. Places without their own figure show their region.';
  } else { document.getElementById('chBerdTrend').innerHTML='<div class="data-needed">No regional business R&amp;D data for this place. Check input/berd2024official.xlsx.</div>'; tsrc.textContent=''; }
  if(B.uk) Plotly.newPlot('chBerdUK',[{x:B.uk.years,y:B.uk.values,type:'scatter',mode:'lines+markers',name:'UK business R&D',line:{color:C.pd,width:3},marker:{size:7},hovertemplate:'%{x}: <b>£%{y:.1f}bn</b><extra></extra>'}],
      L({height:420,margin:{l:70,r:20,t:10,b:60},yaxis:{title:{text:'£bn',font:{size:12}},gridcolor:'#eeebf1',rangemode:'tozero'}}),CFG);
  // (b) industry
  const I=B.industry, ie=document.getElementById('chBerdInd');
  if(I&&I.rows.length){
    const rows=I.rows.slice().sort((a,b)=>b.pct-a.pct), col=v=>v>=0?C.green:v>-10?'#e8a600':C.pink;
    Plotly.newPlot(ie,[{type:'bar',orientation:'h',y:rows.map(r=>r.g.split(';')[0]),x:rows.map(r=>r.pct),marker:{color:rows.map(r=>col(r.pct))},text:rows.map(r=>(r.pct>0?'+':'')+r.pct.toFixed(1)+'%'),textposition:'outside',cliponaxis:false,hovertemplate:'%{y}: <b>%{x:+.1f}%</b><extra></extra>'}],
      L({height:Math.max(420,rows.length*28+70),margin:{l:200,r:60,t:10,b:40},yaxis:{autorange:'reversed',automargin:true},xaxis:{ticksuffix:'%',gridcolor:'#eeebf1',zeroline:true,range:[Math.min(-10,Math.min(...rows.map(r=>r.pct))-10),Math.max(10,Math.max(...rows.map(r=>r.pct))+8)]}}),CFG);
    document.getElementById('plBerdIndSrc').textContent='Percent change in UK business R&D expenditure, '+I.base+' to '+I.last+', by broad group. Source: '+I.src+'.';
  } else ie.innerHTML='<div class="data-needed">No industry data loaded (input/berd_industry.csv).</div>';
  // (c) growth comparison
  const ge=document.getElementById('chBerdGrow'), gs=document.getElementById('plBerdGrowSrc'), bw=document.getElementById('plBerdBaseWrap');
  if(ser){
    const yrs=[...new Set(ser.flatMap(s=>Object.keys(s.m).map(Number)))].sort(), last=yrs[yrs.length-1];
    const bsel=document.getElementById('plBerdBase'); bw.style.display='';
    if(bsel.dataset.n!==String(yrs.length)){bsel.innerHTML=yrs.slice(0,-1).map(y=>`<option value="${y}">${y}</option>`).join(''); bsel.dataset.n=yrs.length; PX.berdBase=yrs.length>3?yrs[yrs.length-4]:yrs[0]; bsel.value=PX.berdBase;}
    const base=PX.berdBase;
    const rows=ser.map(s=>({s,g:(s.m[base]&&s.m[last])?(s.m[last]/s.m[base]-1)*100:null})).filter(r=>r.g!=null);
    Plotly.newPlot(ge,[{type:'bar',x:rows.map(r=>r.s.name),y:rows.map(r=>r.g),marker:{color:rows.map(r=>r.s.e.col)},text:rows.map(r=>plPct(r.g,1)),textposition:'outside',cliponaxis:false,hovertemplate:'%{x}: <b>%{y:+.1f}%</b><extra></extra>'}],
      L({height:420,margin:{l:60,r:20,t:20,b:90},yaxis:{ticksuffix:'%',gridcolor:'#eeebf1',zeroline:true},xaxis:{tickangle:-20,automargin:true}}),CFG);
    gs.textContent='Change in business R&D expenditure, '+base+' to '+last+', real terms. Source: ONS BERD 2024 (published Nov 2025).';
  } else if(B.intl){
    bw.style.display='none';
    const rows=B.intl.rows.slice().sort((a,b)=>a.pct-b.pct);
    Plotly.newPlot(ge,[{type:'bar',x:rows.map(r=>r.c),y:rows.map(r=>r.pct),marker:{color:rows.map(r=>r.c==='United Kingdom'?C.pink:C.pd)},text:rows.map(r=>r.pct.toFixed(1)+'%'),textposition:'outside',cliponaxis:false,hovertemplate:'%{x}: <b>%{y:+.1f}%</b><extra></extra>'}],
      L({height:420,margin:{l:60,r:20,t:20,b:110},yaxis:{ticksuffix:'%',gridcolor:'#eeebf1',zeroline:true},xaxis:{tickangle:-35,automargin:true}}),CFG);
    gs.innerHTML='Business expenditure on R&D, growth since '+B.intl.base+' across economies. Source: '+B.intl.src+'. <b>The picked place cannot be shown yet: add input/berd_region.csv</b> (see README).';
  } else ge.innerHTML='<div class="data-needed">No comparison data loaded.</div>';
}

/* ---------- 2. CPM indicators, above/below, BCI ---------- */
function plCpm(E){
  const P=E[0], B=E.slice(1), ps=plAllInd(P);
  document.getElementById('plCpmNote').textContent=P.name+' · '+PY[LY]+' · '+(PS.scale==='per'?'per university':'total');
  const th='<thead><tr><th>Indicator</th><th class="c">'+PY[LY]+'</th>'+PL_CMP.map(c=>`<th class="c">${c}</th>`).join('')+B.map(b=>`<th class="c" style="color:#e9d7f3">${b.key==='uk'?'UK':b.name}<br><span style="font-weight:400;font-size:11px">${PY[LY]}</span></th>`).join('')+'</tr></thead>';
  let html=th+'<tbody>', cat='';
  const bs=B.map(b=>plAllInd(b));
  ps.forEach((r,i)=>{
    if(r.cat!==cat){cat=r.cat; html+=`<tr class="cat"><td colspan="${2+PL_CMP.length+B.length}">${cat}</td></tr>`;}
    const f=v=>plFmt(v,r.f);
    html+=`<tr class="data"><td>${r.name}</td><td class="c" style="font-weight:700">${f(r.st.cur)}</td>`+
      r.st.chg.map((p,j)=>`<td class="c" title="${f(r.st.cur)} vs ${f(r.st.base[j])}: ${p==null?'n/a':plPct(p,1)}">${plArrow(p)}</td>`).join('')+
      bs.map(b=>`<td class="c">${f(b[i].st.cur)}</td>`).join('')+'</tr>';
  });
  document.getElementById('plCpm').innerHTML=html+'</tbody>';
  // above / at / below counts
  const names=[],comp=[],cnt={above:[],at:[],below:[]};
  PL_CMP.forEach((c,j)=>E.forEach(e=>{const st=plAllInd(e).map(r=>plBucket(r.st.chg[j])); comp.push(c); names.push(e.name);
    ['above','at','below'].forEach(k=>cnt[k].push(st.filter(x=>x===k).length));}));
  const mk=(k,n,c)=>({type:'bar',name:n,x:[comp,names],y:cnt[k],marker:{color:c},hovertemplate:'%{x}: <b>%{y}</b> indicators '+k+' the comparison<extra></extra>',text:cnt[k].map(v=>v||''),textposition:'inside'});
  Plotly.newPlot('chPlAbove',[mk('above','Above',C.green),mk('at','At the average (±1%)','#e8c200'),mk('below','Below',C.pink)],
    L({barmode:'stack',height:420,margin:{l:50,r:20,t:10,b:110},yaxis:{title:{text:'Number of indicators',font:{size:12}},gridcolor:'#eeebf1',dtick:1,range:[0,9]},xaxis:{tickfont:{size:11}}}),CFG);
}
function plBci(E){
  const u=plUnit();
  document.getElementById('plScaleNote').textContent='£m, '+u+(PS.set==='core'?' · core 136':' · all providers');
  Plotly.newPlot('chPlBci',E.map(e=>plTrace(e,PY.map((_,y)=>plM('bci')(e,y)),null,{hovertemplate:'%{x}: <b>£%{y:.2f}m</b><extra>'+e.name+'</extra>'})),
    L({height:470,margin:{l:70,r:20,t:10,b:70},yaxis:{title:{text:'£m, '+u+', real 2024/25',font:{size:12}},gridcolor:'#eeebf1',rangemode:'tozero'}}),CFG);
}

/* ---------- 3. type of collaboration x business size ---------- */
function plTypes(E){
  const u=plUnit(), P=E[0], B=E.slice(1), tr=[], lay={height:800,margin:{l:60,r:20,t:60,b:60},legend:{orientation:'h',y:-0.07},annotations:[]};
  const panels=[['Contract research','cr_sme','cr_lc'],['Consultancy','cons_sme','cons_lc'],['Facilities & equipment','fac_sme','fac_lc'],['IP licensing','lic_sme','lic_lc']];
  const gx=0.07,gy=0.2,w=(1-gx)/2,h=(1-gy)/2;
  panels.forEach((p,i)=>{
    const c=i%2,r=Math.floor(i/2),sfx=i?String(i+1):'',x0=c*(w+gx),y1=1-r*(h+gy),y0=y1-h;
    lay['xaxis'+sfx]={domain:[x0,x0+w],anchor:'y'+sfx,gridcolor:'#eeebf1',tickangle:-45,tickfont:{size:10}};
    lay['yaxis'+sfx]={domain:[y0,y1],anchor:'x'+sfx,gridcolor:'#eeebf1',rangemode:'tozero',tickformat:',.1f'};
    lay.annotations.push({xref:'paper',yref:'paper',x:x0,y:y1+0.03,text:'<b>'+p[0]+' (£m '+u+')</b>',showarrow:false,xanchor:'left',yanchor:'bottom',font:{size:12.5,color:C.pd}});
    [[1,'SMEs',C.pd],[2,'Large businesses',C.pink]].forEach(([idx,lab,col])=>{
      [P].concat(B).forEach((e,j)=>{
        tr.push({x:PY,y:PY.map((_,y)=>plM(p[idx])(e,y)),xaxis:'x'+sfx,yaxis:'y'+sfx,mode:'lines+markers',name:lab+' · '+e.name,legendgroup:lab+e.key,showlegend:i===0,connectgaps:false,
          line:{color:col,width:j?2:3.5,dash:j?(j===1?'dot':'dash'):'solid'},marker:{size:j?3:6,color:col},opacity:j?0.7:1,hovertemplate:'%{x}: <b>£%{y:.2f}m</b><extra>'+lab+' · '+e.name+'</extra>'});});});
  });
  Plotly.newPlot('chPlTypes',tr,L(lay),CFG);
  // mix and SME share
  const st=[['cr','Contract research',C.pd],['cons','Consultancy',C.pink],['fac','Facilities & equipment',C.blue],['ip','IP licensing',C.green]];
  const rev=E.slice().reverse(), tot=e=>st.reduce((s,k)=>s+(e.s[k[0]][LY]||0),0);
  Plotly.newPlot('chPlMix',st.map(k=>({type:'bar',orientation:'h',name:k[1],y:rev.map(e=>plShort(e.name)),x:rev.map(e=>tot(e)?(e.s[k[0]][LY]||0)/tot(e)*100:0),marker:{color:k[2]},hovertemplate:'%{y}: %{x:.0f}% '+k[1]+'<extra></extra>'})),
    L({barmode:'stack',height:Math.max(320,E.length*62+110),margin:{l:190,r:20,t:10,b:70},xaxis:{ticksuffix:'%',range:[0,100],gridcolor:'#eeebf1'},yaxis:{automargin:true}}),CFG);
  document.getElementById('plMixSrc').textContent=PY[LY]+'. Share of BCI by stream.';
  Plotly.newPlot('chPlSme',E.map(e=>plTrace(e,PY.map((_,y)=>plRat(e,'sme','bci',100,y)),null,{hovertemplate:'%{x}: <b>%{y:.1f}%</b><extra>'+e.name+'</extra>'})),
    L({height:Math.max(320,E.length*62+110),margin:{l:60,r:20,t:10,b:60},yaxis:{ticksuffix:'%',gridcolor:'#eeebf1'}}),CFG);
}

/* ---------- 4. growth vs all other places ---------- */
function plCagrData(seg){
  const out=[];
  Object.values(plAreas(PS.level)).forEach(a=>{const e=plAggregate(plSetF(a.provs)); const g=plCagr(PY.map((_,y)=>plAmt(e,seg,y)),LY,5); if(g!=null) out.push({id:a.id,name:a.name,g,n:e.n[LY]});});
  return out.sort((a,b)=>b.g-a.g);
}
function plCagrChart(E){
  const seg=PX.cagrSeg, rows=plCagrData(seg), col={}, segLab=seg==='bci'?'total BCI':seg==='sme'?'SME BCI':'large-business BCI';
  E.forEach(e=>{ if(e.key==='place') col[PS.place]=e.col; else if(e.key[0]==='x') col[e.id]=e.col; });
  const rev=rows.slice().reverse();
  const shapes=[],ann=[];
  E.filter(e=>e.key==='uk'||e.key==='eng').forEach(e=>{const g=plCagr(PY.map((_,y)=>plAmt(e,seg,y)),LY,5); if(g==null) return;
    shapes.push({type:'line',x0:g,x1:g,y0:-.5,y1:rev.length-.5,line:{color:e.col,dash:'dash',width:1.5}}); ann.push({x:g,y:rev.length-.5,text:e.name+' '+plPct(g,1),showarrow:false,yanchor:'bottom',xanchor:e.key==='uk'?'left':'right',font:{size:11,color:e.col}});});
  Plotly.newPlot('chPlCagr',[{type:'bar',orientation:'h',y:rev.map(r=>plShort(r.name)),x:rev.map(r=>r.g),customdata:rev.map(r=>r.n),
    marker:{color:rev.map(r=>col[r.id]||'#cfc9dc'),line:{color:rev.map(r=>col[r.id]?'#222':'rgba(0,0,0,0)'),width:rev.map(r=>col[r.id]?2:0)}},
    hovertemplate:'<b>%{y}</b><br>%{x:+.1f}% a year · %{customdata} universities<extra></extra>'}],
    L({height:Math.max(440,rev.length*(PS.level==='ttwa'?17:24)+90),margin:{l:230,r:30,t:24,b:50},xaxis:{ticksuffix:'%',gridcolor:'#eeebf1',zeroline:true},yaxis:{automargin:true,tickfont:{size:PS.level==='ttwa'?10:12}},shapes,annotations:ann}),CFG);
  document.getElementById('plCagrSrc').textContent=PY[LY-5]+' to '+PY[LY]+', '+segLab+(PS.scale==='per'?' per university':'')+', real prices. Pink = selected place, blue = places compared, dashed = UK / England. '+(PS.set==='all'?'All providers: growth also reflects providers entering the panel.':'Core 136 universities.');
  Plotly.newPlot('chPlIdx',E.map(e=>{const raw=PY.map((_,y)=>e.s.bci[y]); const b=raw.find(v=>v>0); return plTrace(e,raw.map(v=>v==null||!b?null:v/b*100),null,{hovertemplate:'%{x}: <b>%{y:.0f}</b><extra>'+e.name+'</extra>'});}),
    L({height:400,margin:{l:60,r:20,t:10,b:70},yaxis:{title:{text:'Index, first year = 100',font:{size:12}},gridcolor:'#eeebf1'}}),CFG);
}

/* ---------- 5. types of university ---------- */
function plClusters(E){
  const A=plAreas(PS.level)[PS.place], u=plUnit(), uk=PLP.provs;
  const grow=(provs)=>{const e=plAggregate(plSetF(provs)); return e.n[LY]?plCagr(PY.map((_,y)=>plAmt(e,'bci',y)),LY,5):null;};
  const cats=[0,1,2,3,4].map(plClName);
  const ukG=[0,1,2,3,4].map(i=>grow(uk.filter(p=>plClOf(p)===i))), plG=[0,1,2,3,4].map(i=>{const ps=A.provs.filter(p=>plClOf(p)===i); return ps.length?grow(ps):null;});
  const nPl=[0,1,2,3,4].map(i=>A.provs.filter(p=>plClOf(p)===i&&p.s.bci[LY]!=null).length);
  Plotly.newPlot('chPlTypesNat',[
    {type:'bar',name:'UK, all universities of this type',x:cats,y:ukG,marker:{color:C.pd},text:ukG.map(v=>v==null?'':plPct(v,1)),textposition:'outside',cliponaxis:false},
    {type:'bar',name:A.name+' universities of this type',x:cats,y:plG,marker:{color:C.pink},text:plG.map((v,i)=>v==null?'':plPct(v,1)+' (n='+nPl[i]+')'),textposition:'outside',cliponaxis:false}],
    L({barmode:'group',height:460,margin:{l:60,r:20,t:20,b:150},yaxis:{ticksuffix:'%',gridcolor:'#eeebf1',zeroline:true,title:{text:'5-year CAGR of BCI'+(PS.scale==='per'?' per university':''),font:{size:12}}},xaxis:{tickangle:-20,automargin:true}}),CFG);
  document.getElementById('plTypesSrc').textContent=PY[LY-5]+' to '+PY[LY]+', real prices. Pink bars appear only for types of university present in this place.';
  const tr=[0,1,2,3,4,5].map(i=>{const ps=A.provs.filter(p=>plClOf(p)===i);
    return {x:PY,y:PY.map((_,y)=>{const s=ps.reduce((a,p)=>a+(p.s.bci[y]||0),0); const n=PS.scale==='per'?(A.provs.filter(p=>p.s.bci[y]!=null).length||1):1; return ps.length&&(!PS.set||PS.set==='all'||ps.some(p=>p.core))?s/n/1000:null;}),
      type:'scatter',mode:'lines',stackgroup:'one',name:plClName(i),line:{width:0.5,color:PL_CL_COL[i]},fillcolor:PL_CL_COL[i],hovertemplate:'%{x}: <b>£%{y:.2f}m</b><extra>'+plClName(i)+'</extra>'};});
  Plotly.newPlot('chPlClusterArea',tr,L({height:460,margin:{l:60,r:20,t:20,b:130},legend:{orientation:'h',y:-0.2},yaxis:{title:{text:'£m, '+u+', real',font:{size:12}},gridcolor:'#eeebf1'}}),CFG);
}

/* ---------- 6. IP income, patents, spin-outs ---------- */
function plProducts(E){
  const P=E[0], u=plUnit();
  const lay={height:520,margin:{l:60,r:20,t:56,b:70},legend:{orientation:'h',y:-0.14},barmode:'stack',annotations:[],
    xaxis:{domain:[0,0.56],anchor:'y',tickangle:-45,tickfont:{size:10}},yaxis:{domain:[0,1],anchor:'x',gridcolor:'#eeebf1',tickformat:',.2f'},
    xaxis2:{domain:[0.64,1],anchor:'y2',tickangle:-45,tickfont:{size:10}},yaxis2:{domain:[0,1],anchor:'x2',gridcolor:'#eeebf1',rangemode:'tozero'}};
  lay.annotations.push({xref:'paper',yref:'paper',x:0,y:1.03,text:'<b>Licensing income (£m '+u+')</b>',showarrow:false,xanchor:'left',yanchor:'bottom',font:{size:12.5,color:C.pd}});
  lay.annotations.push({xref:'paper',yref:'paper',x:0.64,y:1.03,text:'<b>Licences granted</b>',showarrow:false,xanchor:'left',yanchor:'bottom',font:{size:12.5,color:C.pd}});
  const lc=PY.map((_,y)=>plM('lic_lc')(P,y)), sm=PY.map((_,y)=>plM('lic_sme')(P,y)), tot=PY.map((_,y)=>lc[y]==null&&sm[y]==null?null:(lc[y]||0)+(sm[y]||0));
  const okT=tot.filter(v=>v!=null), avg=okT.length?okT.reduce((a,b)=>a+b,0)/okT.length:0;
  const tr=[{type:'bar',x:PY,y:lc,name:'Large businesses',marker:{color:C.pd},hovertemplate:'%{x}: £%{y:.2f}m<extra>Large businesses</extra>'},
    {type:'bar',x:PY,y:sm,name:'SMEs',marker:{color:C.pink},hovertemplate:'%{x}: £%{y:.2f}m<extra>SMEs</extra>'},
    {type:'scatter',mode:'lines',x:PY,y:PY.map(()=>avg),name:'All-time average (£'+avg.toFixed(2)+'m)',line:{color:C.blue,dash:'dot',width:2}},
    Object.assign(plTrace(P,PY.map((_,y)=>plAmt(P,'licn_lc',y)),'Large businesses (licences)',{xaxis:'x2',yaxis:'y2'}),{line:{color:C.pd,width:3},legendgroup:'ll'}),
    Object.assign(plTrace(P,PY.map((_,y)=>plAmt(P,'licn_sme',y)),'SMEs (licences)',{xaxis:'x2',yaxis:'y2'}),{line:{color:C.pink,width:3},marker:{size:6,color:C.pink},legendgroup:'ls'})];
  Plotly.newPlot('chPlIp',tr,L(lay),CFG);
  plSub('chPlPatents',[{t:'Patents filed ('+u+')',get:(e,y)=>plAmt(e,'patf',y),hf:'.1f',tf:',.1f'},{t:'Patents granted ('+u+')',get:(e,y)=>plAmt(e,'patg',y),hf:'.1f',tf:',.1f'},{t:'Patents filed by external parties with a university co-applicant ('+u+')',get:(e,y)=>plAmt(e,'pate',y),hf:'.1f',tf:',.1f'}],3,420);
  plSub('chPlSpin',[{t:'Surviving spin-outs, 3+ years ('+u+')',get:(e,y)=>plAmt(e,'spin',y),hf:'.1f',tf:',.1f'},{t:'Spin-outs per 100 academics',get:(e,y)=>plRat(e,'spin','acad',100,y),hf:'.1f',tf:',.1f'}],2,420);
}

/* ---------- storytelling: a coherent thread of questions and answers ---------- */
function plStories(E){
  const P=E[0], B=E.slice(1), y=LY, u=plUnit(), Bn=B.length?B[0]:null, nm=b=>b.key==='uk'?'the UK':b.name, A=plAreas(PS.level)[PS.place], BD=PLP.berd||{};
  const set=(id,paras,cards)=>{document.getElementById(id).innerHTML=paras.filter(Boolean).map(t=>`<p>${t}</p>`).join('')+(cards&&cards.length?`<div class="insights">${cards.map(c=>`<div class="insight"><b class="h">${c[0]}</b>${c[1]}</div>`).join('')}</div>`:'');};
  // chapter 1
  const p1=[];
  {const ukS=plBerdSeries(E.filter(e=>e.key==='uk')); const m=ukS&&ukS[0]&&ukS[0].m; if(m){const ys=Object.keys(m).map(Number).sort(), l=ys[ys.length-1], f=ys[0];
    p1.push(`Universities collaborate with businesses that invest in R&amp;D, so the backdrop matters. UK business R&amp;D was <b>£${(BD.official?BD.official[2].v/1000:m[l]/1000).toFixed(1)}bn in ${l}</b> (current prices), ${Math.abs((m[l]/m[f]-1)*100)<0.5?'unchanged':`<b>${Math.abs((m[l]/m[f]-1)*100).toFixed(1)}% ${m[l]>=m[f]?'higher':'lower'}</b>`} than in ${f} in real terms.`);}
   else if(BD.uk){const v=BD.uk.values, yr=BD.uk.years; p1.push(`Universities collaborate with businesses that invest in R&amp;D, so the backdrop matters. UK business R&amp;D stood at £${v[v.length-1].toFixed(1)}bn in ${yr[yr.length-1]}.`);}}
  if(BD.industry&&BD.industry.rows.length){const r=BD.industry.rows.slice().sort((a,b)=>b.pct-a.pct), up=r.filter(x=>x.pct>0).length;
    p1.push(`Under the headline the picture is uneven: between ${BD.industry.base} and ${BD.industry.last}, <b>${up} of ${r.length}</b> broad industry groups increased business R&amp;D, led by ${r[0].g.toLowerCase()} (${plPct(r[0].pct,1)}), while ${r[r.length-1].g.toLowerCase()} fell furthest (${plPct(r[r.length-1].pct,1)}).`);}
  if(BD.intl){const uk=BD.intl.rows.find(x=>x.c==='United Kingdom'); if(uk){const lower=BD.intl.rows.filter(x=>x.pct<uk.pct).length; p1.push(`Internationally the UK is an outlier: business R&amp;D growth since ${BD.intl.base} was ${plPct(uk.pct,1)}, ${lower===0?'the weakest of the economies shown':'below most economies shown'}.`);}}
  const ser=plBerdSeries(E);
  if(ser){const m=ser.find(s=>s.e.key==='place'); if(m){const ys=Object.keys(m.m).map(Number).sort(); const l=ys[ys.length-1], b=PX.berdBase||ys[0]; if(m.m[b]) p1.push(`In <b>${m.name}</b>, business R&amp;D changed by <b>${plPct((m.m[l]/m.m[b]-1)*100,1)}</b> between ${b} and ${l} (real terms).`);}}
  else{const i2=PS.level==='itl2'?PLP.itl2[PS.place]:null; if(i2&&i2.berd!=null) p1.push(`In ${A.name}, business R&amp;D per job is <b>£${Math.round(i2.berd).toLocaleString('en-GB')}</b> (ONS BERD 2024). <i>Add <code>input/berd_region.csv</code> to see the place's own trend and growth against the UK and England.</i>`); else p1.push(`<i>The place's own business R&amp;D trend needs the regional ONS BERD series: add <code>input/berd_region.csv</code> (format in the README).</i>`);}
  p1.push(`<b>So what is happening to university–business collaboration in ${P.name}?</b> The next chapters follow that question.`);
  set('plStory1',p1);
  // chapter 2
  const ps=plAllInd(P), cnt=j=>{const b=ps.map(r=>plBucket(r.st.chg[j])); return {a:b.filter(x=>x==='above').length,at:b.filter(x=>x==='at').length,b:b.filter(x=>x==='below').length};};
  const c1=cnt(0),c5=cnt(1),c10=cnt(2),c19=cnt(3);
  const withChg=ps.filter(r=>r.st.chg[0]!=null).sort((a,b)=>b.st.chg[0]-a.st.chg[0]);
  const p2=[`Of the nine CPM indicators, <b>${c1.a}</b> rose and <b>${c1.b}</b> fell in the latest year in ${P.name}. Against the average of the previous five years ${c5.a} are above and ${c5.b} below; against ten years ${c10.a} are above and ${c10.b} below; and compared with 2018/19, before Covid, ${c19.a} are above and ${c19.b} below.`];
  if(withChg.length>1) p2.push(`The strongest year-on-year move was <b>${withChg[0].name.replace(/^([A-Z])([a-z])/,(m,a,b)=>a.toLowerCase()+b)}</b> (${plPct(withChg[0].st.chg[0],0)}); the weakest was <b>${withChg[withChg.length-1].name.replace(/^([A-Z])([a-z])/,(m,a,b)=>a.toLowerCase()+b)}</b> (${plPct(withChg[withChg.length-1].st.chg[0],0)}).`);
  if(Bn){const bc=cnt2(Bn); p2.push(`For comparison, ${nm(Bn)} has ${bc.a} indicators above and ${bc.b} below their 5-year averages.`);}
  function cnt2(e){const b=plAllInd(e).map(r=>plBucket(r.st.chg[1])); return {a:b.filter(x=>x==='above').length,b:b.filter(x=>x==='below').length};}
  const pu=plAmt(P,'bci',y), pa=plRat(P,'bci','acad',1,y);
  set('plStory2',p2,[['Income '+u,`${plFmt(pu,'gbp')} of BCI in ${PY[LY]}`+(Bn?` against ${plFmt(plAmt(Bn,'bci',y),'gbp')} for ${nm(Bn)}`:'')+'.'],['Intensity',`BCI per academic is ${plFmt(pa,'gbp1')}`+(Bn?` (${plFmt(plRat(Bn,'bci','acad',1,y),'gbp1')} ${nm(Bn)})`:'')+'.']]);
  // chapter 3
  const st=[['cr','contract research'],['cons','consultancy'],['fac','facilities & equipment'],['ip','IP licensing']], tot=e=>st.reduce((s,k)=>s+(e.s[k[0]][y]||0),0);
  const big=tot(P)?st.map(k=>[k[1],(P.s[k[0]][y]||0)/tot(P)*100]).sort((a,b)=>b[1]-a[1])[0]:null;
  const smG=plIndStats(P,'sme').chg[3], lcG=plIndStats(P,'lc').chg[3];
  const smS=plRat(P,'sme','bci',100,y);
  const p3=[`${big?`<b>${big[0][0].toUpperCase()+big[0].slice(1)}</b> is the largest stream in ${P.name} (${big[1].toFixed(0)}% of BCI). `:''}SMEs supply <b>${plFmt(smS,'pct')}</b> of the income${Bn?` against ${plFmt(plRat(Bn,'sme','bci',100,y),'pct')} for ${nm(Bn)}`:''}.`];
  if(smG!=null&&lcG!=null) p3.push(`Compared with 2018/19, SME-funded income ${u} is ${plSign(smG)} <b>${Math.abs(smG).toFixed(0)}%</b> and large-business income is ${plSign(lcG)} <b>${Math.abs(lcG).toFixed(0)}%</b>: ${smG>lcG?'SMEs have held up better than large businesses':'large businesses have held up better than SMEs'}.`);
  set('plStory3',p3);
  // chapter 4
  const rows=plCagrData(PX.cagrSeg), me=rows.find(r=>r.id===PS.place), p4=[];
  if(me){const gs=rows.map(r=>r.g); p4.push(`Over five years BCI ${PS.scale==='per'?'per university ':''}${me.g>=0?'grew':'fell'} by <b>${Math.abs(me.g).toFixed(1)}% a year</b> in ${P.name}. Across the ${rows.length} ${PS.level==='itl1'?'regions':PS.level==='itl2'?'sub-regions':'travel-to-work areas'} shown, five-year growth ranges from ${plPct(Math.min(...gs),1)} to ${plPct(Math.max(...gs),1)} a year, with a median of ${plPct(plMedian(gs),1)}`+(B.length?`; ${B.map(b=>{const g=plCagr(PY.map((_,k)=>plAmt(b,PX.cagrSeg,k)),LY,5); return nm(b)+' '+plPct(g,1);}).join(', ')}`:'')+'.');}
  set('plStory4',p4);
  // chapter 5
  const sets=[0,1,2,3,4,5].map(i=>A.provs.filter(p=>plClOf(p)===i&&p.s.bci[y]!=null));
  const mix=sets.map((s,i)=>s.length?`${s.length} ${plClName(i).replace(/^SME/,'SME')}`:null).filter(Boolean);
  set('plStory5',[`The universities in ${P.name} are: ${mix.length?mix.join(', '):'none reporting'}. Types matter because the national picture differs sharply between, for example, research-intensive universities and SME-focused ones: compare the pink and purple bars.`]);
  // chapter 6
  const ipN=PY.map((_,k)=>plM('lic')(P,k)), ipNow=ipN[y], ipB=ipN[4], pg=plAmt(P,'patg',y), pg0=plAmt(P,'patg',y-1), sp=plAmt(P,'spin',y);
  const p6=[];
  if(ipNow!=null&&ipB>0) p6.push(`Licensing income is £${ipNow.toFixed(2)}m ${u}, ${Math.abs((ipNow/ipB-1)*100).toFixed(0)}% ${ipNow>=ipB?'above':'below'} 2018/19. `+(pg!=null&&pg0>0?`Patents granted ${pg>=pg0?'rose':'fell'} ${Math.abs((pg/pg0-1)*100).toFixed(0)}% in the latest year, and `:'')+(sp!=null?`there are <b>${plFmt(P.s.spin[y],'n')}</b> surviving spin-outs (${(P.s.spin[y]/P.n[y]).toFixed(1)} per university${Bn?` against ${(Bn.s.spin[y]/Bn.n[y]).toFixed(1)} for ${nm(Bn)}`:''}).`:''));
  set('plStory6',p6);
  // chapter 7
  const tt=[...new Set(A.provs.map(p=>p.t).filter(Boolean))], c=tt.length===1?PLP.ttwa[tt[0]]:null;
  set('plStory7',[c?`${P.name} is a <b>${(c.type||'local economy').toLowerCase()}</b>${c.ki!=null?` where ${(c.ki*100).toFixed(0)}% of employment is knowledge-intensive`:''}${c.gva?`, with GVA per filled job of £${Math.round(c.gva).toLocaleString('en-GB')}`:''}. Does collaboration income here track the strength of the local economy? Compare with the medians below.`:`${P.name} spans ${tt.length} travel-to-work area${tt.length===1?'':'s'}; the table shows how their economies differ.`]);
}

/* ---------- locator map ---------- */
function plMap(E){
  const A=plAreas(PS.level), el=document.getElementById('chPlMap'), ids=E.filter(e=>e.key==='place'||e.key[0]==='x');
  const colOf={}; E.forEach(e=>{if(e.key==='place') colOf[PS.place]=e.col; else if(e.key[0]==='x') colOf[e.id]=e.col;});
  let tr=[];
  if(PS.level==='itl1'){
    const names=PLP.itl1;
    tr.push({type:'choropleth',geojson:D.geo,locations:names,z:names.map(n=>colOf[n]?1:0),featureidkey:'properties.region',
      colorscale:[[0,'#e6e2ea'],[1,'#e6e2ea']],showscale:false,
      marker:{line:{color:'#fff',width:1}},text:names,hovertemplate:'<b>%{text}</b><extra></extra>'});
    tr.push({type:'choropleth',geojson:D.geo,locations:Object.keys(colOf),z:Object.keys(colOf).map(()=>1),featureidkey:'properties.region',
      colorscale:[[0,'#ff0090'],[1,'#ff0090']],showscale:false,marker:{line:{color:'#fff',width:1.5}},hoverinfo:'skip'});
    // recolour comparison regions
    const cmp=Object.keys(colOf).filter(k=>k!==PS.place);
    if(cmp.length) tr.push({type:'choropleth',geojson:D.geo,locations:cmp,z:cmp.map(()=>1),featureidkey:'properties.region',colorscale:[[0,'#0085ca'],[1,'#0085ca']],showscale:false,marker:{line:{color:'#fff',width:1.5}},hoverinfo:'skip'});
  } else {
    tr.push({type:'choropleth',geojson:D.geo,locations:PLP.itl1,z:PLP.itl1.map(()=>0),featureidkey:'properties.region',colorscale:[[0,'#eeebf1'],[1,'#eeebf1']],showscale:false,hoverinfo:'skip',marker:{line:{color:'#fff',width:1}}});
    const all=Object.values(A).filter(a=>a.lat!=null);
    tr.push({type:'scattergeo',lat:all.map(a=>a.lat),lon:all.map(a=>a.lon),customdata:all.map(a=>a.id),text:all.map(a=>`<b>${a.name}</b><br>${a.provs.length} universit${a.provs.length===1?'y':'ies'}`),hovertemplate:'%{text}<extra></extra>',
      marker:{size:all.map(a=>colOf[a.id]?0:9),color:'#9a93ad',opacity:.8,line:{color:'#fff',width:1}},showlegend:false});
    const sel=all.filter(a=>colOf[a.id]);
    tr.push({type:'scattergeo',lat:sel.map(a=>a.lat),lon:sel.map(a=>a.lon),customdata:sel.map(a=>a.id),text:sel.map(a=>`<b>${a.name}</b>`),hovertemplate:'%{text}<extra></extra>',
      marker:{size:sel.map(a=>a.id===PS.place?22:16),color:sel.map(a=>a.id===PS.place?'#ff0090':'#0085ca'),line:{color:'#fff',width:2}},showlegend:false});
  }
  Plotly.newPlot(el,tr,L({geo:{scope:'europe',fitbounds:'locations',projection:{type:'mercator'},bgcolor:'rgba(0,0,0,0)',showframe:false,showcoastlines:false,showland:false},
    margin:{l:0,r:0,t:6,b:0},height:560,dragmode:false}),CFG);
  if(el.removeAllListeners) el.removeAllListeners('plotly_click');
  el.on('plotly_click',ev=>{const p=ev.points&&ev.points[0]; if(!p) return; const id=PS.level==='itl1'?p.location:p.customdata; if(!id||!A[id]||id===PS.place) return;
    PS.place=id; PS.extra=PS.extra.filter(x=>x!==id); plFillSelects(); plRender();});
}

/* ---------- universities table ---------- */
function plProfile(E){
  const P=E[0], a=plAreas(PS.level)[PS.place];
  document.getElementById('plProfTitle').textContent='Universities in '+a.name;
  document.getElementById('plProfNote').textContent=a.r+' · '+PY[LY];
  const rows=a.provs.slice().sort((p,q)=>(q.s.bci[LY]||0)-(p.s.bci[LY]||0)).map(p=>`<tr><td>${p.n}</td><td>${p.cl?p.cl.split(' (')[0]:'–'}</td><td class="n">${plFmt(p.s.bci[LY],'gbp')}</td><td class="n">${plFmt(p.s.spin[LY],'n')}</td><td class="n">${plFmt(p.s.acad[LY],'n')}</td></tr>`).join('');
  document.getElementById('plProfile').innerHTML=`<div style="max-height:520px;overflow:auto"><table class="pl-table"><thead><tr><th>University</th><th>BCI portfolio group</th><th class="n">BCI</th><th class="n">Spin-outs</th><th class="n">Academics</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="src">${a.provs.length} universit${a.provs.length===1?'y':'ies'} with a main campus here. BCI = business collaboration income, ${PY[LY]}, real prices.</p>`;
}

/* ---------- local economy ---------- */
function plMedian(a){const s=a.filter(v=>v!=null&&isFinite(v)).sort((p,q)=>p-q); if(!s.length) return null; const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function plEco(E){
  const A=plAreas(PS.level)[PS.place], box=document.getElementById('plEco'), note=document.getElementById('plEcoNote');
  const ttwaIds=[...new Set(A.provs.map(p=>p.t).filter(Boolean))];
  const allT=Object.keys(PLP.ttwa).map(id=>{const c=PLP.ttwa[id]; const ps=PLP.provs.filter(p=>p.t===id); return {id,c,r:(ps[0]||{}).r,bci:ps.reduce((s,p)=>s+(p.s.bci[LY]||0),0)};});
  const engT=allT.filter(t=>!PL_NONENG.includes(t.r));
  const row=(lbl,get,f,mult)=>{const v=ttwaIds.length===1?get(PLP.ttwa[ttwaIds[0]]):null; const med=x=>plMedian(x.map(t=>get(t.c)));
    return `<tr><td>${lbl}</td><td class="n">${v==null?'–':plFmt(v*(mult||1),f)}</td><td class="n">${plFmt(med(allT)*(mult||1),f)}</td><td class="n">${plFmt(med(engT)*(mult||1),f)}</td></tr>`;};
  let html='';
  if(PS.level==='ttwa'&&ttwaIds.length===1){
    const c=PLP.ttwa[ttwaIds[0]]; note.textContent=c.type||'';
    const perjob=c.jobs?(A.provs.reduce((s,p)=>s+(p.s.bci[LY]||0),0))*1000/c.jobs:null;
    const mj=x=>plMedian(x.map(t=>t.c.jobs?t.bci*1000/t.c.jobs:null));
    html=`<table class="pl-table"><thead><tr><th>Measure</th><th class="n">${A.name}</th><th class="n">Median, UK university TTWAs</th><th class="n">Median, England</th></tr></thead><tbody>
      <tr><td>Type of local economy</td><td class="n" colspan="3">${c.type||'–'}</td></tr>
      ${row('Knowledge-intensive jobs (% of employment)',x=>x.ki,'pct',100)}
      ${row('GVA per filled job, 2023',x=>x.gva,'gbp0')}
      ${row('Employee jobs (BRES 2024)',x=>x.jobs,'n')}
      ${row('Composite place score (percentile)',x=>x.comp,'n')}
      ${row('Productivity score (percentile)',x=>x.prod,'n')}
      ${row('Knowledge-intensity score (percentile)',x=>x.know,'n')}
      ${row('Industrial-legacy employment share',x=>x.legsh,'pct',100)}
      <tr><td>BCI per local job</td><td class="n">${plFmt(perjob,'gbp0')}</td><td class="n">${plFmt(mj(allT),'gbp0')}</td><td class="n">${plFmt(mj(engT),'gbp0')}</td></tr></tbody></table>
      <p class="src">TTWA = Travel-to-Work Area (2011). Sources: ONS GVA, BRES 2024, ONS BERD 2024; NCUB typology. Medians are across travel-to-work areas that host a university.</p>`;
  } else {
    note.textContent=PS.level==='itl2'&&A.provs[0]&&PLP.itl2[A.id]&&PLP.itl2[A.id].berd!=null?'Business R&D per job (ONS BERD 2024): £'+Math.round(PLP.itl2[A.id].berd).toLocaleString('en-GB'):'';
    const rows=ttwaIds.map(id=>{const c=PLP.ttwa[id], ps=A.provs.filter(p=>p.t===id); const b=ps.reduce((s,p)=>s+(p.s.bci[LY]||0),0);
      return `<tr><td>${c.name}</td><td>${c.type||'–'}</td><td class="n">${c.ki!=null?(c.ki*100).toFixed(0)+'%':'–'}</td><td class="n">${plFmt(c.gva,'gbp0')}</td><td class="n">${plFmt(c.jobs,'n')}</td><td class="n">${plFmt(c.jobs?b*1000/c.jobs:null,'gbp0')}</td></tr>`;}).join('');
    html=`<p style="font-size:13.5px;margin:4px 0 8px">Travel-to-work areas in ${A.name} that host a university:</p><table class="pl-table"><thead><tr><th>TTWA</th><th>Type of local economy</th><th class="n">KI jobs</th><th class="n">GVA per job</th><th class="n">Jobs</th><th class="n">BCI per job</th></tr></thead><tbody>${rows||'<tr><td colspan="6">No travel-to-work-area data for this place.</td></tr>'}</tbody></table>
      <p class="src">Pick "Travel-to-work areas" above for a full local-economy comparison. Sources: ONS GVA, BRES 2024, ONS BERD 2024; NCUB typology.</p>`;
  }
  box.innerHTML=html;
}


/* ---------- editable PowerPoint report on the selected place (PptxGenJS, inlined) ---------- */
function plPptx(){
  const msg=document.getElementById('plPptMsg');
  if(typeof PptxGenJS==='undefined'){msg.textContent='The PowerPoint library did not load in this browser. Try reloading the page.'; return;}
  msg.textContent='Building…';
  try{ plPptxBuild(); msg.textContent='Done: check your downloads.'; }catch(err){ console.error(err); msg.textContent='Could not build the report: '+err.message; }
}
function plPptxBuild(){
  const E=plEntities(), P=E[0], B=E.slice(1), y=LY, area=plAreas(PS.level)[PS.place];
  const lvlTxt=PS.level==='itl1'?'ITL1 region':PS.level==='itl2'?'ITL2 sub-region':'travel-to-work area';
  const pp=new PptxGenJS(); pp.layout='LAYOUT_WIDE'; pp.title='NCUB place report: '+P.name;
  const PUR='3E1151',MID='60537F',PNK='FF0090',FONT_='Aptos', hx=c=>c.replace('#','');
  const SRC='Source: HE-BCI via NCUB master panel, real 2024/25 prices; ONS BERD. Income is recorded at each university\'s main campus, not where partners are located.';
  const u=PS.scale==='per'?'per university':'total';
  const strip=h=>String(h).replace(/<[^>]+>/g,'').replace(/&amp;/g,'&');
  const storyText=id=>[...document.querySelectorAll('#'+id+' p')].map(p=>strip(p.innerHTML)).join('\n\n');
  let pg=1;
  const logo=(s,w)=>{ if(PL_LOGO&&PL_LOGO.length>40) s.addImage({data:w?PL_LOGO_W:PL_LOGO,x:0.4,y:w?0.4:0.35,w:w?2.4:0.56,h:0.6}); };
  let s=pp.addSlide(); s.background={color:PUR}; logo(s,true);
  s.addShape(pp.ShapeType.line,{x:0.5,y:3.3,w:12.3,h:0,line:{color:'FEDB00',width:2}});
  s.addText(P.name,{x:0.9,y:3.6,w:8.8,h:1.1,fontFace:'Georgia',bold:true,fontSize:34,color:'FFFFFF',fit:'shrink'});
  s.addText('University–business collaboration in this '+lvlTxt+', from business R&D to outcomes · compared with '+(B.map(b=>b.name).join(', ')||'no benchmark'),{x:0.9,y:4.8,w:8.6,h:0.9,fontFace:FONT_,fontSize:15,color:'AAA5BB'});
  s.addText('Collaboration Progress Monitor · '+PY[y]+' · '+new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'}),{x:0.9,y:6.5,w:8,h:0.4,fontFace:FONT_,fontSize:12,color:'FFFFFF'});
  const body=(topic,finding,sub,panel)=>{
    const sl=pp.addSlide(); sl.background={color:'FFFFFF'}; logo(sl,false); pg++;
    sl.addText(topic,{x:1.34,y:0.3,w:11,h:0.3,fontFace:FONT_,bold:true,fontSize:11,color:PNK,charSpacing:2});
    sl.addText(finding,{x:1.34,y:0.55,w:11.4,h:0.62,fontFace:FONT_,bold:true,fontSize:22,color:PUR,fit:'shrink'});
    sl.addText(sub,{x:1.34,y:1.15,w:11,h:0.4,fontFace:FONT_,fontSize:13,color:MID});
    if(panel){
      sl.addShape(pp.ShapeType.rect,{x:9.4,y:1.89,w:3.4,h:4.94,fill:{color:PUR},line:{color:PUR}});
      sl.addShape(pp.ShapeType.rect,{x:9.67,y:2.23,w:0.47,h:0.05,fill:{color:PNK},line:{color:PNK}});
      sl.addText(panel[0],{x:9.67,y:2.4,w:2.85,h:0.95,fontFace:FONT_,bold:true,fontSize:panel[0].length>9?20:32,color:'FFFFFF',fit:'shrink',valign:'top'});
      sl.addText(panel[1],{x:9.67,y:3.4,w:2.85,h:0.9,fontFace:FONT_,bold:true,fontSize:13,color:'FFFFFF',valign:'top',fit:'shrink'});
      sl.addText(panel[2],{x:9.67,y:4.4,w:2.85,h:2.2,fontFace:FONT_,fontSize:11.5,color:'FFFFFF',valign:'top',fit:'shrink'});
    }
    sl.addText(SRC,{x:0.55,y:6.99,w:11.2,h:0.25,fontFace:FONT_,fontSize:8,color:MID});
    sl.addText(String(pg).padStart(2,'0'),{x:12.3,y:6.99,w:0.5,h:0.25,fontFace:FONT_,bold:true,fontSize:9,color:PUR,align:'right'});
    return sl;
  };
  const gridOpt={valGridLine:{color:'EEEBF1',size:0.5},catAxisLabelFontSize:10,valAxisLabelFontSize:10,legendFontSize:10,showLegend:true,legendPos:'b'};
  const chartBox={x:0.5,y:1.75,w:8.6,h:5.05};
  const line=(slide,series,fmtc)=>slide.addChart(pp.charts.LINE,series.map(q=>({name:q.n,labels:q.l||PY,values:q.v})),Object.assign({},chartBox,gridOpt,{chartColors:series.map(q=>hx(q.c)),lineSize:3,lineDataSymbolSize:6,valAxisLabelFormatCode:fmtc||'#,##0.0'}));
  const note=(sl,t)=>sl.addText(t,{x:0.5,y:1.7,w:12.3,h:5,fontFace:FONT_,fontSize:14,color:PUR,valign:'top',fit:'shrink'});
  const rs=(arr,f)=>arr.map(f);
  // 1 the story at a glance (all chapters)
  let sl=body('Summary',P.name+': the story in brief','The place at a glance, then comparisons',null);
  sl.addText(['plHead1','plHead2','plHead3','plStory1','plStory2','plStory3','plStory4','plStory5','plStory6'].flatMap(i=>{const t=storyText(i).split('\n\n')[0]||''; return t?[{text:t,options:{breakLine:true,paraSpaceAfter:8,bullet:true}}]:[];}),{x:0.55,y:1.7,w:12.2,h:5.1,fontFace:FONT_,fontSize:13,color:PUR,valign:'top',fit:'shrink'});
  // Part 1: the place at a glance
  {const bci=plSeries(P,'bci'), idx=plIdx(bci), hd=document.getElementById('plHead1').innerText.split('\n').filter(Boolean);
   const g5=plCagr(bci,y,5);
   sl=body('Part 1 · Collaboration income',P.name+': business collaboration income',hd[0]?hd[0].slice(0,150):'',[g5==null?'n/a':plFmt(g5,'pcts'),'5-year CAGR','Real 2024/25 prices, '+u+'.']);
   const bs=E.slice(1).map(b=>({n:b.name+' BCI',c:b.col,v:plIdx(plSeries(b,'bci')).map(v=>v==null?null:+v.toFixed(1))}));
   line(sl,[{n:P.name+' BCI (index)',c:PNK,v:idx.map(v=>v==null?null:+v.toFixed(1))}].concat(bs),'0');
   const yoy=bci.map((v,i)=>i&&bci[i-1]>0&&v!=null?+((v/bci[i-1]-1)*100).toFixed(1):0);
   sl=body('Part 1 · Collaboration income','Annual growth of collaboration income','% change on the previous year, '+u,null);
   sl.addChart(pp.charts.BAR,[{name:'YoY %',labels:PY,values:yoy}],Object.assign({},chartBox,{w:12.2},gridOpt,{barDir:'col',chartColors:yoy.map(v=>v>=0?'00B388':'FF0090'),showLegend:false,showValue:true,dataLabelFontSize:9,dataLabelFormatCode:'0"%"',valAxisLabelFormatCode:'0"%"'}));
   const i0=P.s.bci.findIndex(v=>v>0), T0=P.s.bci[i0], T1=P.s.bci[y];
   const cs=[['Total BCI change',null],['Consultancy','cons'],['Facilities & equipment','fac'],['Contract research','cr'],['Licensing / IP','ip'],['SME','sme'],['Large business','lc']];
   const dv=cs.map(r=>r[1]?+(((P.s[r[1]][y]||0)-(P.s[r[1]][i0]||0))/T0*100).toFixed(1):+((T1/T0-1)*100).toFixed(1));
   sl=body('Part 1 · Collaboration income','What drove the change in income?','Contribution to change in BCI, percentage points, '+PY[i0]+' to '+PY[y],null);
   sl.addChart(pp.charts.BAR,[{name:'pp',labels:cs.map(r=>r[0]),values:dv}],Object.assign({},chartBox,{w:12.2},gridOpt,{barDir:'bar',catAxisOrientation:'maxMin',chartColors:['3E1151','0085CA','00B388','FF0090','6D5F8F','8C7BB0','1A0524'],showLegend:false,showValue:true,dataLabelFontSize:10,dataLabelFormatCode:'0.0',valAxisLabelFormatCode:'0"pp"'}));
   sl=body('Part 1 · Commercialisation','Industry funding to universities','£m, real 2024/25 prices, '+u,null);
   sl.addChart(pp.charts.BAR,[['ukind','UK industry'],['ind_eu','EU industry'],['ind_non','Non-EU industry']].map(k=>({name:k[1],labels:PY,values:PY.map((_,i)=>{const v=plAmt(P,k[0],i);return v==null?0:+(v/1000).toFixed(2);})})),Object.assign({},chartBox,{w:12.2},gridOpt,{barDir:'col',barGrouping:'stacked',chartColors:['3E1151','0085CA','FF0090']}));
   sl=body('Part 1 · Spin-outs','New and surviving spin-outs',u,[plFmt(P.s.spin[y],'n'),'surviving spin-outs, '+PY[y],plFmt(P.s.sp_new[y],'n')+' newly registered in the year.']);
   line(sl,[{n:'Active after 3 years',c:PNK,v:PY.map((_,i)=>{const v=plAmt(P,'spin',i);return v==null?null:+v.toFixed(2);})},{n:'Newly registered',c:'0085CA',v:PY.map((_,i)=>{const v=plAmt(P,'sp_new',i);return v==null?null:+v.toFixed(2);})}],'0.0');
   sl=body('Part 1 · Spin-outs','Spin-outs, staff and student start-ups','Firms active after 3+ years, '+u,null);
   sl.addChart(pp.charts.BAR,[['spin','Spin-outs'],['staff_su','Staff start-ups'],['stud_su','Student start-ups']].map(k=>({name:k[1],labels:PY,values:PY.map((_,i)=>{const v=plAmt(P,k[0],i);return v==null?0:+v.toFixed(1);})})),Object.assign({},chartBox,{w:12.2},gridOpt,{barDir:'col',barGrouping:'stacked',chartColors:['3E1151','FF0090','0085CA']}));
   sl=body('Part 1 · Spin-outs','Employment in spin-outs and start-ups','Estimated FTE of active firms, '+u,[Math.round(P.s.sp_fte[y]||0).toLocaleString('en-GB'),'FTE in spin-outs, '+PY[y],P.s.spin[y]>0?(P.s.sp_fte[y]/P.s.spin[y]).toFixed(1)+' FTE per surviving spin-out.':'']);
   sl.addChart(pp.charts.BAR,[['sp_fte','Spin-outs'],['staff_fte','Staff start-ups'],['stud_fte','Student start-ups']].map(k=>({name:k[1],labels:PY,values:PY.map((_,i)=>{const v=plAmt(P,k[0],i);return v==null?0:+v.toFixed(0);})})),Object.assign({},chartBox,gridOpt,{barDir:'col',barGrouping:'stacked',chartColors:['3E1151','FF0090','0085CA']}));
   sl=body('Part 1 · Spin-outs','Spin-outs and external investment','£m real (bars) and spin-outs surviving 3+ years',null);
   sl.addChart(pp.charts.BAR,[{name:'External investment (£m)',labels:PY,values:PY.map((_,i)=>{const v=plAmt(P,'ext',i);return v==null?0:+(v/1000).toFixed(1);})}],Object.assign({},chartBox,{w:12.2},gridOpt,{barDir:'col',chartColors:['3E1151'],showLegend:false,showValue:true,dataLabelFontSize:9,dataLabelFormatCode:'0.0'}));
  }
  // 2 BERD context
  const Bd=PLP.berd||{}, ser=plBerdSeries(E);
  sl=body('1 · Context','Business R&D: the backdrop to collaboration',ser?'Business R&D, £m, real terms (ONS BERD)':'UK business expenditure on R&D, £bn (ONS BERD)',[Bd.uk?'£'+Bd.uk.values[Bd.uk.values.length-1].toFixed(1)+'bn':'–','UK business R&D, '+(Bd.uk?Bd.uk.years[Bd.uk.years.length-1]:''),storyText('plStory1').split('\n\n')[0]||'']);
  if(ser){const yrs=[...new Set(ser.flatMap(q=>Object.keys(q.m).map(Number)))].sort(); line(sl,ser.map(q=>({n:q.name,c:q.e.col,l:yrs,v:yrs.map(k=>q.m[k]==null?null:+q.m[k].toFixed(0))})),'#,##0');}
  else if(Bd.uk) line(sl,[{n:'UK business R&D (£bn)',c:PUR,l:Bd.uk.years,v:Bd.uk.values}],'0.0');
  if(Bd.industry&&Bd.industry.rows.length){
    const rows=Bd.industry.rows.slice().sort((a,b)=>b.pct-a.pct);
    sl=body('1 · Context','Where business R&D is growing and falling','% change by broad industry group, '+Bd.industry.base+' to '+Bd.industry.last,[plPct(rows[0].pct,1),rows[0].g,'Largest increase. Largest fall: '+rows[rows.length-1].g+' ('+plPct(rows[rows.length-1].pct,1)+').']);
    sl.addChart(pp.charts.BAR,[{name:'% change',labels:rows.map(r=>r.g),values:rows.map(r=>r.pct)}],Object.assign({},chartBox,gridOpt,{barDir:'bar',catAxisOrientation:'maxMin',chartColors:rows.map(r=>r.pct>=0?'00B388':r.pct>-10?'E8A600':'FF0090'),showLegend:false,showValue:true,dataLabelFontSize:8,dataLabelFormatCode:'0.0',valAxisLabelFormatCode:'0"%"'}));
  }
  if(!ser&&Bd.intl){
    const rows=Bd.intl.rows.slice().sort((a,b)=>a.pct-b.pct);
    sl=body('1 · Context','Business R&D growth across economies','% growth since '+Bd.intl.base,null);
    sl.addChart(pp.charts.BAR,[{name:'%',labels:rows.map(r=>r.c),values:rows.map(r=>r.pct)}],Object.assign({},chartBox,{w:12.2},gridOpt,{barDir:'col',chartColors:rows.map(r=>r.c==='United Kingdom'?'FF0090':PUR),showLegend:false,showValue:true,dataLabelFontSize:8,dataLabelFormatCode:'0.0'}));
  }
  // 3 CPM table
  const ps=plAllInd(P);
  sl=body('2 · Indicators','The CPM indicators for '+P.name,'Latest year '+PY[y]+', '+u+'. ⏫ ≥10% · ⌃ 1–10% · — within 1% · ⌄ down 1–10% · ⏬ ≥10% down',null);
  const arr=p=>p==null?'n/a':p>=10?'⏫':p>=1?'⌃':p>-1?'—':p>-10?'⌄':'⏬';
  const hd=['Indicator',String(PY[y])].concat(PL_CMP).concat(B.map(b=>b.name)).map(t=>({text:t,options:{bold:true,color:'FFFFFF',fill:{color:PUR},fontSize:9}}));
  const bsAll=B.map(b=>plAllInd(b));
  sl.addTable([hd].concat(ps.map((r,i)=>[{text:r.name},{text:plFmt(r.st.cur,r.f),options:{align:'right',bold:true}}].concat(r.st.chg.map(p=>({text:arr(p)+(p==null?'':' '+plPct(p,0)),options:{align:'center'}}))).concat(bsAll.map(b=>({text:plFmt(b[i].st.cur,r.f),options:{align:'right'}}))))),
    {x:0.5,y:1.7,w:12.3,fontFace:FONT_,fontSize:9.5,color:PUR,border:{type:'solid',color:'EEEBF1',pt:0.75},rowH:0.4});
  // 4 above/at/below
  sl=body('2 · Indicators','How many indicators are above or below their averages?','Number of the nine CPM indicators',['','Above, at or below','Compares the latest year with last year, the 5- and 10-year averages and 2018/19. “At” means within ±1%.']);
  const names=PL_CMP, ent=E.map(e=>e.name);
  const cnt=(e,j,k)=>plAllInd(e).filter(r=>plBucket(r.st.chg[j])===k).length;
  const lab=[],ab=[],at=[],be=[];
  PL_CMP.forEach((c,j)=>E.forEach(e=>{lab.push(c.replace('vs ','')+' · '+(e.key==='uk'?'UK':e.key==='eng'?'England':plShort(e.name))); ab.push(cnt(e,j,'above')); at.push(cnt(e,j,'at')); be.push(cnt(e,j,'below'));}));
  sl.addChart(pp.charts.BAR,[{name:'Above',labels:lab,values:ab},{name:'At average',labels:lab,values:at},{name:'Below',labels:lab,values:be}],Object.assign({},chartBox,gridOpt,{barDir:'bar',barGrouping:'stacked',catAxisOrientation:'maxMin',chartColors:['00B388','E8C200','FF0090'],catAxisLabelFontSize:8,showValue:true,dataLabelFontSize:8}));
  // 5 BCI trend
  const g5=plCagr(plBciSeries(P),y,5);
  sl=body('3 · Collaboration','Business collaboration income over time','£m '+u+', real 2024/25 prices',[g5==null?'n/a':plFmt(g5,'pcts'),'5-year CAGR',storyText('plStory2').split('\n\n').slice(-1)[0].slice(0,220)]);
  line(sl,E.map(e=>({n:e.name,c:e.col,v:PY.map((_,k)=>{const v=plAmt(e,'bci',k);return v==null?null:+(v/1000).toFixed(2);})})));
  // 6 types x size (one slide per type)
  [['Contract research','cr_sme','cr_lc'],['Consultancy','cons_sme','cons_lc'],['Facilities & equipment','fac_sme','fac_lc'],['IP licensing','lic_sme','lic_lc']].forEach(p=>{
    sl=body('3 · Collaboration',p[0]+': SMEs and large businesses','£m '+u+' in '+P.name+(B.length?' (dashed = '+B[0].name+')':''),[plFmt(plAmt(P,p[1],y),'gbp'),'from SMEs, '+PY[y],'Large businesses: '+plFmt(plAmt(P,p[2],y),'gbp')+'.']);
    const ser2=[{n:'SMEs · '+P.name,c:PUR,v:PY.map((_,k)=>{const v=plAmt(P,p[1],k);return v==null?null:+(v/1000).toFixed(2);})},{n:'Large · '+P.name,c:'FF0090',v:PY.map((_,k)=>{const v=plAmt(P,p[2],k);return v==null?null:+(v/1000).toFixed(2);})}];
    line(sl,ser2,'#,##0.0');});
  // 7 CAGR vs all places
  const rows=plCagrData('bci'), col={}; E.forEach(e=>{if(e.key==='place') col[PS.place]=e.col; else if(e.key[0]==='x') col[e.id]=e.col;});
  const top=rows.slice(0,40);
  if(!top.some(r=>r.id===PS.place)){const me=rows.find(r=>r.id===PS.place); if(me) top.push(me);}
  sl=body('4 · Growth','Five-year growth of collaboration income against all places',PY[y-5]+' to '+PY[y]+', compound annual growth, '+(PS.scale==='per'?'per university':'total'),[(rows.find(r=>r.id===PS.place)||{g:null}).g==null?'n/a':plFmt(rows.find(r=>r.id===PS.place).g,'pcts'),P.name+' a year','Rank is not the point: the chart shows where '+P.name+' sits in the range (pink).']);
  sl.addChart(pp.charts.BAR,[{name:'CAGR %',labels:top.map(r=>plShort(r.name)),values:top.map(r=>+r.g.toFixed(1))}],Object.assign({},chartBox,gridOpt,{barDir:'bar',catAxisOrientation:'maxMin',chartColors:top.map(r=>col[r.id]?hx(col[r.id]):'CFC9DC'),showLegend:false,catAxisLabelFontSize:top.length>25?7:9,valAxisLabelFormatCode:'0"%"'}));
  // 8 clusters
  const grow=provs=>{const e=plAggregate(plSetF(provs)); return e.n[y]?plCagr(PY.map((_,k)=>plAmt(e,'bci',k)),y,5):null;};
  const cats=[0,1,2,3,4].map(plClName);
  sl=body('5 · Types of university','Growth by type of university',PY[y-5]+' to '+PY[y]+', 5-year CAGR of BCI',['','Types follow the NCUB BCI portfolio clusters.',storyText('plStory5')]);
  sl.addChart(pp.charts.BAR,[{name:'UK',labels:cats,values:[0,1,2,3,4].map(i=>{const v=grow(PLP.provs.filter(p=>plClOf(p)===i));return v==null?0:+v.toFixed(1);})},{name:P.name,labels:cats,values:[0,1,2,3,4].map(i=>{const ps2=area.provs.filter(p=>plClOf(p)===i);const v=ps2.length?grow(ps2):null;return v==null?0:+v.toFixed(1);})}],Object.assign({},chartBox,gridOpt,{barDir:'col',chartColors:[PUR,'FF0090'],catAxisLabelFontSize:8,showValue:true,dataLabelFontSize:8,dataLabelFormatCode:'0.0'}));
  // 9 IP, patents, spin-outs
  sl=body('6 · Outcomes','IP licensing income, '+u,'£m, real prices; stacked by business size',[plFmt(plAmt(P,'lic',y),'gbp'),'licensing income, '+PY[y],storyText('plStory6').slice(0,260)]);
  sl.addChart(pp.charts.BAR,[{name:'Large businesses',labels:PY,values:PY.map((_,k)=>{const v=plAmt(P,'lic_lc',k);return v==null?0:+(v/1000).toFixed(2);})},{name:'SMEs',labels:PY,values:PY.map((_,k)=>{const v=plAmt(P,'lic_sme',k);return v==null?0:+(v/1000).toFixed(2);})}],Object.assign({},chartBox,gridOpt,{barDir:'col',barGrouping:'stacked',chartColors:[PUR,'FF0090']}));
  sl=body('6 · Outcomes','Patents '+u,'Filed, granted, and filed by external parties with a university co-applicant',null);
  line(sl,[['patf','Filed'],['patg','Granted'],['pate','External parties']].map((k,i)=>({n:k[1],c:[PUR,'FF0090','0085CA'][i],v:PY.map((_,j)=>{const v=plAmt(P,k[0],j);return v==null?null:+v.toFixed(2);})})),'0.0');
  sl=body('6 · Outcomes','Surviving spin-outs '+u,'CPM definition: HE-owned plus other spin-outs surviving 3+ years',[plFmt(plAmt(P,'spin',y),PS.scale==='per'?'n1':'n'),'spin-outs '+u+', '+PY[y],'Benchmarks: '+(B.map(b=>b.name+' '+plFmt(plAmt(b,'spin',y),PS.scale==='per'?'n1':'n')).join(', ')||'–')+'.']);
  line(sl,E.map(e=>({n:e.name,c:e.col,v:PY.map((_,k)=>{const v=plAmt(e,'spin',k);return v==null?null:+v.toFixed(2);})})),'0.0');
  // 10 universities
  sl=body('7 · Place','Universities in '+P.name,'Main campus in this '+lvlTxt+', '+PY[y],[String(area.provs.length),'universities','Listed by business collaboration income.']);
  const h2=['University','BCI portfolio group','BCI','Spin-outs'].map(t=>({text:t,options:{bold:true,color:'FFFFFF',fill:{color:PUR},fontSize:10}}));
  sl.addTable([h2].concat(area.provs.slice().sort((p,q)=>(q.s.bci[y]||0)-(p.s.bci[y]||0)).slice(0,12).map(p=>[{text:p.n},{text:p.cl?p.cl.split(' (')[0]:'–'},{text:plFmt(p.s.bci[y],'gbp'),options:{align:'right'}},{text:plFmt(p.s.spin[y],'n'),options:{align:'right'}}])),
    {x:0.5,y:1.8,w:8.6,colW:[3.6,2.6,1.2,1.2],fontFace:FONT_,fontSize:10,color:PUR,border:{type:'solid',color:'EEEBF1',pt:0.75},rowH:0.32});
  const tIds=[...new Set(area.provs.map(p=>p.t).filter(Boolean))];
  if(tIds.length){
    sl=body('7 · Place','The local economy around '+P.name,'Travel-to-work areas hosting a university',[String(tIds.length),'travel-to-work area'+(tIds.length>1?'s':''),storyText('plStory7').slice(0,260)]);
    const h3=['TTWA','Type','KI jobs','GVA per job','Jobs'].map(t=>({text:t,options:{bold:true,color:'FFFFFF',fill:{color:PUR},fontSize:10}}));
    sl.addTable([h3].concat(tIds.slice(0,12).map(id=>{const c=PLP.ttwa[id];return [{text:c.name},{text:c.type||'–'},{text:c.ki!=null?(c.ki*100).toFixed(0)+'%':'–',options:{align:'right'}},{text:plFmt(c.gva,'gbp0'),options:{align:'right'}},{text:plFmt(c.jobs,'n'),options:{align:'right'}}];})),
      {x:0.5,y:1.8,w:8.6,colW:[2.4,2.8,1.0,1.4,1.0],fontFace:FONT_,fontSize:10,color:PUR,border:{type:'solid',color:'EEEBF1',pt:0.75},rowH:0.32});
  }
  sl=body('Method','Reading this report','Definitions and caveats',null);
  sl.addText([
    {text:'Where it is recorded. ',options:{bold:true,color:PNK}},{text:'Income is recorded where the university is based (main-campus place); it does not show where partners are located.',options:{breakLine:true,paraSpaceAfter:8}},
    {text:'Per university. ',options:{bold:true,color:PNK}},{text:'Per-university figures divide by the providers reporting each year, so places with many providers can be compared with places with few.',options:{breakLine:true,paraSpaceAfter:8}},
    {text:'Real terms. ',options:{bold:true,color:PNK}},{text:'Money is deflated to 2024/25 prices with the CPM price index. BCI covers contract research, consultancy, facilities & equipment and IP income; excludes CPD.',options:{breakLine:true,paraSpaceAfter:8}},
    {text:'Business R&D. ',options:{bold:true,color:PNK}},{text:'ONS BERD. Regional series require the input/berd_region.csv file; otherwise the UK total is shown.',options:{breakLine:true,paraSpaceAfter:8}},
    {text:'Benchmarks. ',options:{bold:true,color:PNK}},{text:'England = providers in English regions. UK = all providers in the HE-BCI panel.'}],
    {x:0.55,y:1.7,w:12,h:4.5,fontFace:FONT_,fontSize:14,color:PUR,valign:'top'});
  pp.writeFile({fileName:'NCUB_place_report_'+P.name.replace(/[^A-Za-z0-9]+/g,'_')+'.pptx'});
}

/* ======================= PART 1: THE PLACE AT A GLANCE (place only) ======================= */
const plYrNum=i=>+String(PY[i]).slice(0,4);
const plSeries=(e,k)=>PY.map((_,y)=>plAmt(e,k,y));
const plIdx=a=>{const i0=a.findIndex(v=>v!=null&&v>0); return a.map(v=>v==null||i0<0?null:v/a[i0]*100);};
function plMacroFor(P,kind){
  const M=PLP.berd&&PLP.berd.macro; if(!M||!M.length) return null;
  const A=plAreas(PS.level)[PS.place], norm=x=>String(x).toLowerCase().replace(/[^a-z0-9]/g,'');
  let rows=M.filter(r=>norm(r.area)===norm(P.name)); let src=P.name;
  if(!rows.length&&A&&A.r){rows=M.filter(r=>norm(r.area)===norm(A.r)); src=A.r+' (region)';}
  if(!rows.length) return null;
  const by={}; rows.forEach(r=>{if(r[kind]!=null) by[+r.year]=+r[kind];});
  const a=PY.map((_,y)=>by[plYrNum(y)]==null?null:by[plYrNum(y)]);
  return a.some(v=>v!=null)?{a,src}:null;
}
function plHeads(E){
  const P=E[0], u=plUnit(), y=LY;
  plHeadBci(P,u,y); plHeadCom(P,u,y); plHeadSpin(P,u,y);
}
const plTraceP=(x,yv,name,col,extra)=>Object.assign({x,y:yv,name,mode:'lines+markers',connectgaps:false,line:{color:col,width:3},marker:{size:6,color:col}},extra||{});
function plHeadBci(P,u,y){
  const bci=plSeries(P,'bci'), g1=bci[y-1]>0?(bci[y]/bci[y-1]-1)*100:null, g5=plCagr(bci,y,5), v19=bci[4]>0?(bci[y]/bci[4]-1)*100:null;
  const smeS=plRat(P,'sme','bci',100,y), smeS0=plRat(P,'sme','bci',100,0);
  const K=[['£'+(bci[y]/1000).toFixed(bci[y]>=10000?1:2)+'m','BCI '+u+', '+PY[y],'g'],[plPct(g1,1),'on the previous year',g1>=0?'g':'p'],[plPct(g5,1),'a year over five years (CAGR)',g5>=0?'g':'p'],[plPct(v19,0),'vs 2018/19, pre-Covid',v19>=0?'g':'p'],[plFmt(smeS,'pct'),'from SMEs'+(smeS0!=null?' (was '+plFmt(smeS0,'pct')+' in '+PY[0]+')':''),'b']];
  document.getElementById('plHeadKpis').innerHTML=K.map(k=>`<div class="kpi ${k[2]}" style="padding:10px 12px"><div class="v" style="font-size:22px">${k[0]}</div><div class="l">${k[1]}</div></div>`).join('');
  const peak=Math.max(...bci.filter(v=>v!=null)), py=PY[bci.indexOf(peak)];
  const st=[['cr','contract research'],['cons','consultancy'],['fac','facilities & equipment'],['ip','IP income']];
  const tot=st.reduce((s,k)=>s+(P.s[k[0]][y]||0),0), lead=st.map(k=>[k[1],(P.s[k[0]][y]||0)/(tot||1)*100]).sort((a,b)=>b[1]-a[1])[0];
  const par=[`<b>How is collaboration income in ${P.name} doing?</b> BCI ${u} was <b>${plFmt(bci[y],'gbp')}</b> in ${PY[y]}, ${g1==null?'':plPct(g1,1)+' on the year'}, ${g5==null?'':`${g5>=0?'growing':'falling'} by ${Math.abs(g5).toFixed(1)}% a year over five years`}${v19==null?'':` and ${Math.abs(v19).toFixed(0)}% ${v19>=0?'above':'below'} its 2018/19 level`}. ${bci[y]<peak?`Its peak was ${plFmt(peak,'gbp')} in ${py}.`:'This is its highest level in the series.'}`,
    `${lead[0][0].toUpperCase()+lead[0].slice(1)} is the largest stream (${lead[1].toFixed(0)}% of income), and SMEs supply ${plFmt(smeS,'pct')}.`];
  document.getElementById('plHead1').innerHTML=par.map(t=>`<p>${t}</p>`).join('');
  // indexed vs GDP / IPP
  const gdp=plMacroFor(P,'gdp_real'), ipp=plMacroFor(P,'ipp_real'), tr=[plTraceP(PY,plIdx(bci),'BCI (real terms)',C.pd,{line:{color:C.pd,width:4},fill:'tozeroy',fillcolor:'rgba(62,17,81,0.07)',marker:{size:8,color:'#fff',line:{color:C.pd,width:2}}})];
  const src=document.getElementById('plMacroSrc');
  if(gdp) tr.push(plTraceP(PY,plIdx(gdp.a),'GDP (real terms) · '+gdp.src,C.blue,{line:{color:C.blue,width:2.5,dash:'dot'}}));
  if(ipp) tr.push(plTraceP(PY,plIdx(ipp.a),'Intellectual property investment (incl. R&D) · '+ipp.src,C.pink,{line:{color:C.pink,width:2.5,dash:'dot'}}));
  if(!gdp&&!ipp){
    [['uk','UK BCI',C.blue],['eng','England BCI','#3a6ea5']].forEach(([k,n,c])=>{const b=plEntities().find(e=>e.key===k); if(b) tr.push(plTraceP(PY,plIdx(plSeries(b,'bci')),n,c,{line:{color:c,width:2,dash:'dot'},marker:{size:4,color:c}}));});
    src.innerHTML='Indexed to the first year with data. <b>Regional GDP and IP investment are not loaded:</b> add <code>input/regional_macro.csv</code> (template in <code>input/</code>) with real-terms GDP and IP investment by region to compare against them. Until then, UK and England BCI are shown as reference lines.';
  } else src.textContent='BCI, regional GDP and IP investment all in real terms, each indexed to the first year with data. Source: HE-BCI via NCUB master panel; regional series from input/regional_macro.csv.';
  const last=(a)=>{for(let i=a.length-1;i>=0;i--) if(a[i]!=null) return [i,a[i]]; return null;};
  const ann=tr.map(t=>{const l=last(t.y); return l?{x:PY[l[0]],y:l[1],text:'<b>'+Math.round(l[1])+'</b>',showarrow:false,xanchor:'left',xshift:8,font:{size:13,color:t.line.color}}:null;}).filter(Boolean);
  Plotly.newPlot('chBciMacro',tr,L({height:430,margin:{l:55,r:60,t:20,b:80},legend:{orientation:'h',y:-0.18},yaxis:{gridcolor:'#eeebf1'},annotations:ann,shapes:[{type:'line',xref:'paper',x0:0,x1:1,y0:100,y1:100,line:{color:'#9a90a6',width:1}}]}),CFG);
  // decomposition: whole period and latest year
  const st2=[['Total BCI change',null,C.pd],['Consultancy','cons',C.blue],['Facilities & equipment','fac',C.green],['Contract research','cr',C.pink],['Licensing / IP','ip','#6d5f8f'],['SME','sme','#8c7bb0'],['Large business','lc','#1a0524']];
  const i0=P.s.bci.findIndex(v=>v>0);
  const dec=(a,b)=>{const T0=P.s.bci[a],T1=P.s.bci[b]; return st2.map(r=>{ if(!r[1]) return T0>0?(T1/T0-1)*100:null; const v0=P.s[r[1]][a]||0,v1=P.s[r[1]][b]||0; return T0>0?(v1-v0)/T0*100:null;});};
  const dA=dec(i0,y), dB=dec(y-1,y), labs=st2.map(r=>r[0]), rl=labs.slice().reverse();
  const bar=(vals,xa,ya,ttl)=>({type:'bar',orientation:'h',x:vals.slice().reverse().map(v=>v==null?0:+v.toFixed(1)),y:rl,xaxis:xa,yaxis:ya,marker:{color:st2.map(r=>r[2]).reverse()},text:vals.slice().reverse().map(v=>v==null?'':(v>0?'+':'')+v.toFixed(1)+'pp'),textposition:'outside',cliponaxis:false,hovertemplate:'%{y}: <b>%{x:+.1f}pp</b><extra>'+ttl+'</extra>',showlegend:false});
  const rng=v=>{const m=Math.max(5,...v.map(x=>Math.abs(x||0)))*1.7; return [-m,m];};
  Plotly.newPlot('chBciDecomp',[bar(dA,'x','y',PY[i0]+' to '+PY[y]),bar(dB,'x2','y2',PY[y-1]+' to '+PY[y])],L({height:430,margin:{l:170,r:30,t:56,b:40},
    xaxis:{domain:[0,0.46],range:rng(dA),zeroline:true,zerolinewidth:2,ticksuffix:'pp',gridcolor:'#eeebf1',anchor:'y'},yaxis:{automargin:true,anchor:'x',tickfont:{size:12}},
    xaxis2:{domain:[0.56,1],range:rng(dB),zeroline:true,zerolinewidth:2,ticksuffix:'pp',gridcolor:'#eeebf1',anchor:'y2'},yaxis2:{showticklabels:false,anchor:'x2',matches:'y'},
    annotations:[{xref:'paper',yref:'paper',x:0.23,y:1.1,text:'<b>'+PY[i0]+' – '+PY[y]+'</b>',showarrow:false,font:{size:13}},{xref:'paper',yref:'paper',x:0.78,y:1.1,text:'<b>'+PY[y-1]+' – '+PY[y]+'</b>',showarrow:false,font:{size:13}}],
    shapes:[{type:'line',xref:'paper',yref:'paper',x0:-0.4,x1:1,y0:1-1/7,y1:1-1/7,line:{color:'#d0c8da',dash:'dot',width:1}}]}),CFG);
  // annual growth
  const yoy=bci.map((v,i)=>i&&bci[i-1]>0&&v!=null?(v/bci[i-1]-1)*100:null);
  Plotly.newPlot('chBciYoy',[{type:'bar',x:PY,y:yoy,marker:{color:yoy.map(v=>v==null?'#ccc':v>=0?C.green:C.pink)},text:yoy.map(v=>v==null?'':(v>0?'+':'')+v.toFixed(0)+'%'),textposition:'outside',cliponaxis:false,hovertemplate:'%{x}: <b>%{y:+.1f}%</b><extra></extra>'}],
    L({height:380,margin:{l:55,r:20,t:30,b:70},yaxis:{ticksuffix:'%',gridcolor:'#eeebf1',zeroline:true,zerolinewidth:2},xaxis:{tickangle:-45}}),CFG);
  document.getElementById('plYoySrc').textContent='Change in BCI '+u+' on the previous year, real prices. Green = growth, pink = fall.'+(g5!=null?' Five-year CAGR: '+plPct(g5,1)+' a year.':'');
  // stream stack + SME / large
  document.getElementById('plStackNote').textContent='£m, '+u;
  const mk=(k,n,c,xa,ya,sg)=>({type:'scatter',mode:'lines',stackgroup:sg,x:PY,y:PY.map((_,i)=>{const v=plAmt(P,k,i);return v==null?null:v/1000;}),name:n,xaxis:xa,yaxis:ya,line:{width:.5,color:c},fillcolor:c+'cc',hovertemplate:'%{x}: <b>£%{y:.2f}m</b><extra>'+n+'</extra>'});
  Plotly.newPlot('chBciStack',[mk('cr','Contract research',C.pink,'x','y','a'),mk('cons','Consultancy',C.blue,'x','y','a'),mk('fac','Facilities & equipment',C.green,'x','y','a'),mk('ip','IP income','#6d5f8f','x','y','a'),
    mk('lc','Large business',C.pd,'x2','y2','b'),mk('sme','SMEs',C.pink,'x2','y2','b')],
    L({height:420,margin:{l:60,r:20,t:56,b:90},legend:{orientation:'h',y:-0.22},
      xaxis:{domain:[0,0.47],anchor:'y',tickangle:-45,tickfont:{size:10}},yaxis:{domain:[0,1],anchor:'x',gridcolor:'#eeebf1',rangemode:'tozero'},
      xaxis2:{domain:[0.55,1],anchor:'y2',tickangle:-45,tickfont:{size:10}},yaxis2:{domain:[0,1],anchor:'x2',gridcolor:'#eeebf1',rangemode:'tozero'},
      annotations:[{xref:'paper',yref:'paper',x:0,y:1.04,text:'<b>By stream</b>',showarrow:false,xanchor:'left',yanchor:'bottom',font:{size:13,color:C.pd}},{xref:'paper',yref:'paper',x:0.55,y:1.04,text:'<b>By size of business</b>',showarrow:false,xanchor:'left',yanchor:'bottom',font:{size:13,color:C.pd}}]}),CFG);
}
function plHeadCom(P,u,y){
  // licensing + patents place-only; industry funding
  const m=k=>PY.map((_,i)=>{const v=plAmt(P,k,i);return v==null?null:v;});
  Plotly.newPlot('chPatA',[['patf','Filed',C.pd],['patg','Granted',C.pink],['pate','External parties with a university co-applicant',C.blue]].map(([k,n,c])=>plTraceP(PY,m(k),n,c,{hovertemplate:'%{x}: <b>%{y:.1f}</b><extra>'+n+'</extra>'})),
    L({height:520,margin:{l:60,r:20,t:30,b:100},legend:{orientation:'h',y:-0.2},yaxis:{title:{text:'Patents, '+u,font:{size:12}},gridcolor:'#eeebf1',rangemode:'tozero'},xaxis:{tickangle:-45}}),CFG);
  const fund=[['ukind','UK industry',C.pd],['ind_eu','EU industry',C.blue],['ind_non','Non-EU industry',C.pink]];
  const fdi=(PLP.berd&&PLP.berd.fdi)||null, tr=fund.map(f=>({type:'bar',x:PY,y:PY.map((_,i)=>{const v=plAmt(P,f[0],i);return v==null?null:v/1000;}),name:f[1],marker:{color:f[2]},hovertemplate:'%{x}: <b>£%{y:.2f}m</b><extra>'+f[1]+'</extra>'}));
  const lay={barmode:'stack',height:430,margin:{l:60,r:70,t:20,b:90},legend:{orientation:'h',y:-0.22},xaxis:{tickangle:-45},yaxis:{title:{text:'£m, real, '+u,font:{size:12}},gridcolor:'#eeebf1',rangemode:'tozero'}};
  const fs=document.getElementById('plFundSrc');
  if(fdi&&fdi.length){
    const orig=[...new Set(fdi.map(r=>r.origin))];
    orig.forEach((o,i)=>{const by={}; fdi.filter(r=>r.origin===o&&(!r.area||/united kingdom|uk/i.test(r.area)||r.area===P.name)).forEach(r=>by[+r.year]=(by[+r.year]||0)+(+r.projects));
      tr.push({type:'scatter',mode:'lines+markers',yaxis:'y2',x:PY,y:PY.map((_,k)=>by[plYrNum(k)]==null?null:by[plYrNum(k)]),name:'FDI projects · '+o,line:{color:i?'#e8a600':'#111',width:3,dash:'dot'},marker:{size:6}});});
    lay.yaxis2={overlaying:'y',side:'right',title:{text:'FDI projects',font:{size:12}},showgrid:false,rangemode:'tozero'};
    fs.textContent='Funds from industry received by universities (UK, EU, non-EU) with inward investment projects (input/fdi_projects.csv).';
  } else fs.innerHTML='HE-BCI funds from industry for research (HESA Table 1, real 2024/25 prices). <b>Inward investment projects are not loaded:</b> add <code>input/fdi_projects.csv</code> (year, origin, projects; template in <code>input/</code>) to overlay FDI projects by EU / non-EU origin.';
  Plotly.newPlot('chIndFund',tr,L(lay),CFG);
  document.getElementById('plHead2').innerHTML=(()=>{
    const lic=plM('lic')(P,y), lic0=plM('lic')(P,4), pg=plAmt(P,'patg',y), pf=plAmt(P,'patf',y), ind=PY.map((_,i)=>(plAmt(P,'ukind',i)||0)+(plAmt(P,'ind_eu',i)||0)+(plAmt(P,'ind_non',i)||0));
    const p=[`<b>What does collaboration turn into in ${P.name}?</b> ${lic!=null?`IP licensing income was <b>£${lic.toFixed(2)}m</b> ${u} in ${PY[y]}${lic0>0?`, ${Math.abs((lic/lic0-1)*100).toFixed(0)}% ${lic>=lic0?'above':'below'} 2018/19`:''}. `:''}${pf!=null?`Universities filed ${pf.toFixed(1)} patents and were granted ${pg==null?'–':pg.toFixed(1)} ${u}.`:''}`];
    if(ind[y]>0&&ind[4]>0) p.push(`Funds from industry for university R&amp;D came to <b>£${(ind[y]/1000).toFixed(2)}m</b> ${u}, ${Math.abs((ind[y]/ind[4]-1)*100).toFixed(0)}% ${ind[y]>=ind[4]?'above':'below'} 2018/19.`);
    return p.map(t=>`<p>${t}</p>`).join('');})();
}
function plHeadSpin(P,u,y){
  const m=(k,f)=>PY.map((_,i)=>{const v=plAmt(P,k,i);return v==null?null:(f?f(v):v);});
  Plotly.newPlot('chSpinDual',[plTraceP(PY,m('spin'),'Active after 3 years',C.pink,{hovertemplate:'%{x}: <b>%{y:.1f}</b><extra>Active after 3 years</extra>'}),plTraceP(PY,m('sp_new'),'Newly registered',C.blue,{yaxis:'y2',hovertemplate:'%{x}: <b>%{y:.1f}</b><extra>Newly registered</extra>'})],
    L({height:440,margin:{l:60,r:60,t:20,b:100},legend:{orientation:'h',y:-0.22},xaxis:{tickangle:-45},yaxis:{title:{text:'Spin-outs active after 3 years, '+u,font:{size:12,color:C.pink}},gridcolor:'#eeebf1'},yaxis2:{overlaying:'y',side:'right',title:{text:'Newly registered, '+u,font:{size:12,color:C.blue}},showgrid:false}}),CFG);
  Plotly.newPlot('chStartups',[['spin','Spin-outs',C.pd],['staff_su','Staff start-ups',C.pink],['stud_su','Student start-ups',C.blue]].map(([k,n,c])=>({type:'bar',x:PY,y:m(k),name:n,marker:{color:c},hovertemplate:'%{x}: <b>%{y:.1f}</b><extra>'+n+'</extra>'})),
    L({barmode:'stack',height:440,margin:{l:60,r:20,t:20,b:100},legend:{orientation:'h',y:-0.22},xaxis:{tickangle:-45},yaxis:{title:{text:'Active after 3+ years, '+u,font:{size:12}},gridcolor:'#eeebf1'}}),CFG);
  const per=PY.map((_,i)=>{const s=P.s.sp_fte[i],n=P.s.spin[i];return s!=null&&n>0?s/n:null;});
  Plotly.newPlot('chSpinEmp',[['sp_fte','Spin-outs',C.pd],['staff_fte','Staff start-ups',C.pink],['stud_fte','Student start-ups',C.blue]].map(([k,n,c])=>({type:'bar',x:PY,y:m(k),name:n+' (FTE)',marker:{color:c},hovertemplate:'%{x}: <b>%{y:,.0f}</b> FTE<extra>'+n+'</extra>'})).concat([plTraceP(PY,per,'FTE per surviving spin-out',C.green,{yaxis:'y2',line:{color:C.green,width:3,dash:'dot'},hovertemplate:'%{x}: <b>%{y:.1f}</b> FTE per spin-out<extra></extra>'})]),
    L({barmode:'stack',height:440,margin:{l:60,r:60,t:20,b:100},legend:{orientation:'h',y:-0.22},xaxis:{tickangle:-45},yaxis:{title:{text:'Employment (FTE), '+u,font:{size:12}},gridcolor:'#eeebf1'},yaxis2:{overlaying:'y',side:'right',title:{text:'FTE per spin-out',font:{size:12,color:C.green}},showgrid:false,rangemode:'tozero'}}),CFG);
  Plotly.newPlot('chSpinInv',[{type:'bar',x:PY,y:m('ext',v=>v/1000),name:'External investment (£m)',marker:{color:C.pd},hovertemplate:'%{x}: <b>£%{y:.1f}m</b><extra>External investment</extra>'},plTraceP(PY,m('spin'),'Spin-outs active after 3 years',C.pink,{yaxis:'y2',hovertemplate:'%{x}: <b>%{y:.1f}</b><extra>Spin-outs</extra>'})],
    L({height:440,margin:{l:60,r:60,t:20,b:100},legend:{orientation:'h',y:-0.22},xaxis:{tickangle:-45},yaxis:{title:{text:'£m, real, '+u,font:{size:12}},gridcolor:'#eeebf1',rangemode:'tozero'},yaxis2:{overlaying:'y',side:'right',title:{text:'Spin-outs, '+u,font:{size:12,color:C.pink}},showgrid:false,rangemode:'tozero'}}),CFG);
  const sp=plAmt(P,'spin',y), nw=plAmt(P,'sp_new',y), fte=P.s.sp_fte[y], ext=plM('ext')(P,y);
  const par=[`<b>How many spin-outs does ${P.name} produce, and what do they employ?</b> There are <b>${plFmt(P.s.spin[y],'n')}</b> surviving spin-outs${PS.scale==='per'?` (${plFmt(sp,'n1')} per university)`:''}, with ${plFmt(P.s.sp_new[y],'n')} newly registered in ${PY[y]}. `+(fte?`Active spin-outs employ an estimated <b>${Math.round(fte).toLocaleString('en-GB')} FTE</b>${P.s.spin[y]>0?` (${(fte/P.s.spin[y]).toFixed(1)} per surviving spin-out)`:''}. `:'')+(ext?`They have drawn an estimated £${ext.toFixed(1)}m of external investment ${u}.`:'')];
  document.getElementById('plHead3').innerHTML=par.map(t=>`<p>${t}</p>`).join('');
}
