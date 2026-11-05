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

/* ---------- controls ---------- */
function plOptionsHtml(lvl,excl,ph){
  const A=Object.values(plAreas(lvl)).filter(a=>!excl||!excl.includes(a.id));
  const byR={}; A.forEach(a=>(byR[a.r||'Other']=byR[a.r||'Other']||[]).push(a));
  let h=ph?`<option value="">${ph}</option>`:'';
  if(lvl==='itl1') return h+A.sort((p,q)=>p.name.localeCompare(q.name)).map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
  Object.keys(byR).sort().forEach(r=>{h+=`<optgroup label="${r}">`+byR[r].sort((p,q)=>p.name.localeCompare(q.name)).map(a=>`<option value="${a.id}">${a.name}</option>`).join('')+'</optgroup>';});
  return h;
}
function plDefaultPlace(lvl){
  const A=Object.values(plAreas(lvl)); A.sort((p,q)=>q.provs.length-p.provs.length||p.name.localeCompare(q.name)); return A[0].id;
}
function plFillSelects(){
  document.getElementById('plPlace').innerHTML=plOptionsHtml(PS.level,null,null);
  document.getElementById('plPlace').value=PS.place;
  document.getElementById('plAdd').innerHTML=plOptionsHtml(PS.level,[PS.place].concat(PS.extra),'Add a place…');
}
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
  document.getElementById('plPlace').addEventListener('change',e=>{PS.place=e.target.value;PS.extra=PS.extra.filter(x=>x!==PS.place);plFillSelects();plRender();});
  document.getElementById('plAdd').addEventListener('change',e=>{const v=e.target.value; if(v&&!PS.extra.includes(v)&&PS.extra.length<4) PS.extra.push(v); plFillSelects(); plRender();});
  document.getElementById('plChips').addEventListener('click',e=>{const b=e.target.closest('button[data-id]'); if(!b) return; PS.extra=PS.extra.filter(x=>x!==b.dataset.id); plFillSelects(); plRender();});
  document.getElementById('plPptArea').addEventListener('click',plPptx);
  plRender();
}
function plRender(){
  const E=plEntities(); if(!E.length) return;
  plChips(E); plKpis(E); plInsights(E); plMap(E); plProfile(E);
  plCharts(E); plEco(E);
}
function plChips(E){
  document.getElementById('plChips').innerHTML=E.map(e=>`<span class="pl-chip" style="background:${e.col}">${e.key==='place'?'📍 ':''}${e.name}${e.key[0]==='x'?`<button data-id="${e.id}" aria-label="Remove ${e.name}">✕</button>`:''}</span>`).join('');
}

/* ---------- KPIs ---------- */
function plKpis(E){
  const P=E[0], B=E.slice(1), y=LY;
  const def=[
    {l:'universities reporting, '+PY[y],v:e=>e.n[y],f:'n',cls:''},
    {l:'BCI '+plUnit()+', '+PY[y],v:e=>plAmt(e,'bci',y),f:'gbp',cls:'g'},
    {l:'BCI per academic (£000)',v:e=>plRat(e,'bci','acad',1,y),f:'gbp1',cls:'b'},
    {l:'SME share of BCI',v:e=>plRat(e,'sme','bci',100,y),f:'pct',cls:'y'},
    {l:'BCI growth, 5-year CAGR'+(PS.scale==='per'?' (per university)':''),v:e=>plCagr(plBciSeries(e),y,5),f:'pcts',cls:''},
    {l:'surviving spin-outs '+plUnit(),v:e=>plAmt(e,'spin',y),f:PS.scale==='per'?'n1':'n',cls:'g'},
  ];
  document.getElementById('plKpis').innerHTML=def.map(d=>{
    const pv=d.v(P);
    const cmp=B.map(b=>`<span style="color:${b.col};font-weight:700">${b.name==='United Kingdom'?'UK':plShort(b.name)}</span> ${plFmt(d.v(b),d.f)}`).join(' · ');
    return `<div class="kpi ${d.cls}"><div class="v" style="font-size:26px">${plFmt(pv,d.f)}</div><div class="l">${d.l}</div><div style="font-size:11.5px;margin-top:6px;line-height:1.5">${cmp}</div></div>`;}).join('');
}

/* ---------- insights ---------- */
function plVs(a,b,suffix){ if(a==null||b==null||!b) return ''; const r=(a/b-1)*100; return Math.abs(r)<3?`in line with ${suffix}`:`${Math.abs(r).toFixed(0)}% ${r>0?'above':'below'} ${suffix}`; }
function plSpearman(xs,ys){const rank=a=>{const idx=a.map((v,i)=>[v,i]).sort((p,q)=>p[0]-q[0]);const r=Array(a.length);idx.forEach((p,i)=>r[p[1]]=i+1);return r;};
  const rx=rank(xs),ry=rank(ys),n=xs.length; if(n<5) return null; const mx=rx.reduce((a,b)=>a+b,0)/n,my=ry.reduce((a,b)=>a+b,0)/n;
  let sxy=0,sx=0,sy=0; for(let i=0;i<n;i++){sxy+=(rx[i]-mx)*(ry[i]-my);sx+=(rx[i]-mx)**2;sy+=(ry[i]-my)**2;} return sxy/Math.sqrt(sx*sy);}
function plInsightList(E){
  const P=E[0], B=E.slice(1), y=LY, out=[], area=P.name;
  const uk=E.find(e=>e.key==='uk')||plEntities().find(e=>e.key==='uk')||(()=>Object.assign({name:'UK'},plAggregate(plSetF(PLP.provs))))();
  const bn=B.length?B:[uk]; const first=bn[0];
  const list=(fn,f)=>bn.map(b=>`${fn(b)==null?'–':plFmt(fn(b),f)} ${b.name}`).join(', ');
  // 1 presence
  const nUK=uk.n[y]||1;
  out.push(['Presence',`${area} has <b>${P.n[y]}</b> universit${P.n[y]===1?'y':'ies'} reporting in ${PY[y]} (${(P.n[y]/nUK*100).toFixed(1)}% of the UK's) and accounts for <b>${((P.s.bci[y]||0)/uk.s.bci[y]*100).toFixed(1)}%</b> of UK business collaboration income (${plFmt(P.s.bci[y],'gbp')}).`]);
  // 2 per university
  const pu=P.s.bci[y]/P.n[y];
  out.push(['Income per university',`Business collaboration income averages <b>${plFmt(pu,'gbp')}</b> per university here, against ${bn.map(b=>plFmt(b.s.bci[y]/b.n[y],'gbp')+' '+(b.key==='uk'?'across the UK':b.key==='eng'?'in England':'in '+b.name)).join(' and ')}. That is ${plVs(pu,first.s.bci[y]/first.n[y],plN(first)+' average')}.`]);
  // 3 per academic
  const pa=plRat(P,'bci','acad',1,y);
  if(pa!=null) out.push(['Intensity',`BCI per academic is <b>${plFmt(pa,'gbp1')}</b> (${list(b=>plRat(b,'bci','acad',1,y),'gbp1')}): ${plVs(pa,plRat(first,'bci','acad',1,y),plN(first)+' figure')}.`]);
  // 4 growth
  const g5=plCagr(plBciSeries(P),y,5), gb=plCagr(plBciSeries(first),y,5);
  if(g5!=null) out.push(['Five-year momentum',`${PY[y-5]} to ${PY[y]}: BCI ${PS.scale==='per'?'per university ':''}${g5>=0?'grew':'fell'} <b>${Math.abs(g5).toFixed(1)}% a year</b> here, against ${gb>=0?'growth of ':'a fall of '}${Math.abs(gb).toFixed(1)}% for ${plN(first)}.`+(PS.set==='all'?' <i>Includes providers entering the panel; switch to "Core 136" for a stable set.</i>':'')]);
  // 5 pre-covid
  const i19=PY.indexOf('2019/20'); const p19=plAmt(P,'bci',i19), p24=plAmt(P,'bci',y), f19=plAmt(first,'bci',i19), f24=plAmt(first,'bci',y);
  if(p19>0&&f19>0) out.push(['Since pre-Covid',`Compared with 2019/20, BCI ${plUnit()} is <b>${Math.abs((p24/p19-1)*100).toFixed(0)}%</b> ${p24>=p19?'higher':'lower'} here and ${Math.abs((f24/f19-1)*100).toFixed(0)}% ${f24>=f19?'higher':'lower'} for ${plN(first)}.`]);
  // 6 mix
  const st=[['cr','contract research'],['cons','consultancy'],['fac','facilities & equipment'],['ip','IP licensing']];
  const tot=e=>st.reduce((s,k)=>s+(e.s[k[0]][y]||0),0);
  if(tot(P)>0&&tot(first)>0){const diffs=st.map(k=>[k[1],(P.s[k[0]][y]||0)/tot(P)*100-(first.s[k[0]][y]||0)/tot(first)*100,(P.s[k[0]][y]||0)/tot(P)*100]).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
    const d=diffs[0]; const big=st.map(k=>[k[1],(P.s[k[0]][y]||0)/tot(P)*100]).sort((a,b)=>b[1]-a[1])[0];
    out.push(['What the income is for',`${big[0][0].toUpperCase()+big[0].slice(1)} is the largest stream (${big[1].toFixed(0)}% of BCI). Compared with ${plN(first)}, the biggest difference is <b>${d[0]}</b>: ${d[2].toFixed(0)}% of BCI here, ${Math.abs(d[1]).toFixed(0)} points ${d[1]>0?'above':'below'}.`]);}
  // 7 SME
  const sm=plRat(P,'sme','bci',100,y), smb=plRat(first,'sme','bci',100,y);
  if(sm!=null) out.push(['Who it is with',`SMEs supply <b>${plFmt(sm,'pct')}</b> of BCI here (${list(b=>plRat(b,'sme','bci',100,y),'pct')}).`]);
  // 8 spin-outs
  const sp=plAmt(P,'spin',y), spb=plAmt(first,'spin',y);
  if(sp!=null) out.push(['Spin-outs',`${plFmt(P.s.spin[y],'n')} surviving spin-outs (3+ years), ${PS.scale==='per'?'':'or '}<b>${(P.s.spin[y]/P.n[y]).toFixed(1)} per university</b>, against ${(first.s.spin[y]/first.n[y]).toFixed(1)} for ${plN(first)}.`]);
  // 9 partners
  const ps=plRat(P,'cpart','collab',100,y), pb=plRat(first,'cpart','collab',100,y);
  if(ps!=null&&pb!=null) out.push(['Partner contribution',`Partners fund <b>${plFmt(ps,'pct')}</b> of publicly funded collaborative research here (${list(b=>plRat(b,'cpart','collab',100,y),'pct')}).`]);
  return out;
}
function plInsights(E){
  document.getElementById('plInsHead').textContent='What stands out in '+E[0].name;
  const html=plInsightList(E).map(i=>`<div class="insight"><b class="h">${i[0]}</b>${i[1]}</div>`).join('');
  const minE=E[0].provs.filter(p=>(p.s.bci[LY]||0)<200).length;
  document.getElementById('plInsights').innerHTML=html+(minE>0&&E[0].provs.length>1?`<div class="insight" style="border-left-color:var(--purple-light)"><b class="h">Reading averages</b>${minE} of the ${E[0].provs.length} providers here report under £0.2m of BCI. Per-university averages are pulled down by small providers: see the universities table.</div>`:'');
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

/* ---------- trend charts ---------- */
function plTrace(e,y,name,extra){
  return Object.assign({x:PY,y:y,name:name||e.name,legendgroup:e.key,mode:'lines+markers',connectgaps:false,
    line:{color:e.col,width:e.w,dash:e.dash},marker:{size:e.key==='place'?7:5,color:e.col}},extra||{});
}
/* grid of small multiples; each panel: {t,get(e,y),fmt,suffix} */
function plSub(id,panels,cols,height){
  const E=plEntities(), rows=Math.ceil(panels.length/cols), tr=[], lay={height:height||(rows*300+80),margin:{l:60,r:20,t:30,b:60},legend:{orientation:'h',y:-0.08},annotations:[]};
  const gx=0.07, gy=0.16;
  panels.forEach((p,i)=>{
    const c=i%cols, r=Math.floor(i/cols), sfx=i?String(i+1):'';
    const w=(1-gx*(cols-1))/cols, h=(1-gy*(rows-1))/rows;
    const x0=c*(w+gx), y1=1-r*(h+gy), y0=y1-h;
    lay['xaxis'+sfx]={domain:[x0,x0+w],anchor:'y'+sfx,gridcolor:'#eeebf1',tickangle:-45,tickfont:{size:10}};
    lay['yaxis'+sfx]={domain:[y0,y1],anchor:'x'+sfx,gridcolor:'#eeebf1',tickformat:p.tf||',',rangemode:p.zero===false?'normal':'tozero'};
    lay.annotations.push({xref:'paper',yref:'paper',x:x0,y:y1+0.03,text:'<b>'+p.t+'</b>',showarrow:false,xanchor:'left',yanchor:'bottom',font:{size:12.5,color:C.pd}});
    E.forEach(e=>{const ys=PY.map((_,y)=>{const v=p.get(e,y); return v==null?null:v;});
      tr.push(plTrace(e,ys,null,{xaxis:'x'+sfx,yaxis:'y'+sfx,showlegend:i===0,hovertemplate:'%{x}: <b>%{y:'+(p.hf||',.1f')+'}</b>'+(p.suffix||'')+'<extra>'+e.name+'</extra>'}));});
  });
  Plotly.newPlot(id,tr,L(lay),CFG);
}
function plCharts(E){
  const per=PS.scale==='per', u=per?'per university':'total';
  document.getElementById('plScaleNote').textContent='£m, '+u+(PS.set==='core'?' · core 136':' · all providers');
  const m=(k)=>(e,y)=>{const v=plAmt(e,k,y); return v==null?null:v/1000;};
  // BCI
  Plotly.newPlot('chPlBci',E.map(e=>plTrace(e,PY.map((_,y)=>m('bci')(e,y)),null,{hovertemplate:'%{x}: <b>£%{y:.2f}m</b><extra>'+e.name+'</extra>'})),
    L({height:470,margin:{l:70,r:20,t:10,b:70},yaxis:{title:{text:'£m, '+u+', real 2024/25',font:{size:12}},gridcolor:'#eeebf1',rangemode:'tozero'}}),CFG);
  // indexed growth
  Plotly.newPlot('chPlIdx',E.map(e=>{const raw=PY.map((_,y)=>e.s.bci[y]); const b=raw.find(v=>v>0); return plTrace(e,raw.map(v=>v==null||!b?null:v/b*100),null,{hovertemplate:'%{x}: <b>%{y:.0f}</b><extra>'+e.name+'</extra>'});}),
    L({height:400,margin:{l:60,r:20,t:10,b:70},yaxis:{title:{text:'Index, first year = 100',font:{size:12}},gridcolor:'#eeebf1'}}),CFG);
  // streams
  plSub('chPlStreams',[{t:'Contract research (£m '+u+')',get:m('cr'),hf:'.2f',suffix:'m',tf:',.1f'},{t:'Consultancy (£m '+u+')',get:m('cons'),hf:'.2f',suffix:'m',tf:',.1f'},
    {t:'Facilities & equipment (£m '+u+')',get:m('fac'),hf:'.2f',suffix:'m',tf:',.1f'},{t:'IP licensing (£m '+u+')',get:m('ip'),hf:'.2f',suffix:'m',tf:',.1f'}],2,720);
  // mix
  const st=[['cr','Contract research',C.pd],['cons','Consultancy',C.pink],['fac','Facilities & equipment',C.blue],['ip','IP licensing',C.green]];
  const rev=E.slice().reverse(), tot=e=>st.reduce((s,k)=>s+(e.s[k[0]][LY]||0),0);
  Plotly.newPlot('chPlMix',st.map(k=>({type:'bar',orientation:'h',name:k[1],y:rev.map(e=>plShort(e.name)),x:rev.map(e=>tot(e)?(e.s[k[0]][LY]||0)/tot(e)*100:0),marker:{color:k[2]},hovertemplate:'%{y}: %{x:.0f}% '+k[1]+'<extra></extra>'})),
    L({barmode:'stack',height:Math.max(320,E.length*62+110),margin:{l:190,r:20,t:10,b:70},xaxis:{ticksuffix:'%',range:[0,100],gridcolor:'#eeebf1'},yaxis:{automargin:true}}),CFG);
  document.getElementById('plMixSrc').textContent=PY[LY]+'. Share of BCI by stream; independent of the per-university switch.';
  // who with
  plSub('chPlSme',[{t:'SME BCI (£m '+u+')',get:m('sme'),hf:'.2f',suffix:'m',tf:',.1f'},{t:'Large-business BCI (£m '+u+')',get:m('lc'),hf:'.2f',suffix:'m',tf:',.1f'},
    {t:'SME share of BCI (%)',get:(e,y)=>plRat(e,'sme','bci',100,y),hf:'.1f',suffix:'%',tf:'.0f'}],3,380);
  // collaboration beyond contracts
  plSub('chPlCollab',[{t:'CPD income (£m '+u+')',get:m('cpd'),hf:'.2f',suffix:'m',tf:',.1f'},{t:'Collaborative research (£m '+u+')',get:m('collab'),hf:'.2f',suffix:'m',tf:',.1f'},
    {t:'Partner share of collaborative research (%)',get:(e,y)=>plRat(e,'cpart','collab',100,y),hf:'.1f',suffix:'%',tf:'.0f'}],3,400);
  // spin-outs, staff, intensity
  plSub('chPlSpin',[{t:'Surviving spin-outs ('+u+')',get:(e,y)=>plAmt(e,'spin',y),hf:'.1f',tf:',.1f'},{t:'Academic staff ('+u+')',get:(e,y)=>plAmt(e,'acad',y),hf:',.0f',tf:','},
    {t:'BCI per academic (£000)',get:(e,y)=>plRat(e,'bci','acad',1,y),hf:'.1f',suffix:'k',tf:',.1f'},{t:'BCI as % of total university income',get:(e,y)=>plRat(e,'bci','inc',100,y),hf:'.1f',suffix:'%',tf:'.1f'}],2,720);
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
  const E=plEntities(), P=E[0], B=E.slice(1), y=LY, area=PS.place&&plAreas(PS.level)[PS.place];
  const lvlTxt=PS.level==='itl1'?'ITL1 region':PS.level==='itl2'?'ITL2 sub-region':'travel-to-work area';
  const pp=new PptxGenJS(); pp.layout='LAYOUT_WIDE'; pp.title='NCUB place report: '+P.name;
  const PUR='3E1151',MID='60537F',PNK='FF0090',FONT_='Aptos', hx=c=>c.replace('#','');
  const SRC='Source: HE-BCI via NCUB master panel, real 2024/25 prices. Income is recorded at each university\'s main campus, not where partners are located.';
  const u=PS.scale==='per'?'per university':'total';
  let pg=1;
  const logo=(s,w)=>{ if(PL_LOGO&&PL_LOGO.length>40) s.addImage({data:w?PL_LOGO_W:PL_LOGO,x:0.4,y:w?0.4:0.35,w:w?2.4:0.56,h:0.6}); };
  let s=pp.addSlide(); s.background={color:PUR}; logo(s,true);
  s.addShape(pp.ShapeType.line,{x:0.5,y:3.3,w:12.3,h:0,line:{color:'FEDB00',width:2}});
  s.addShape(pp.ShapeType.line,{x:0.5,y:3.3,w:0,h:4.2,line:{color:'FEDB00',width:2}});
  s.addText(P.name,{x:0.9,y:3.6,w:8.8,h:1.1,fontFace:'Georgia',bold:true,fontSize:34,color:'FFFFFF',fit:'shrink'});
  s.addText('University–business collaboration in this '+lvlTxt+' · compared with '+(B.map(b=>b.name).join(', ')||'no benchmark'),{x:0.9,y:4.8,w:8.6,h:0.9,fontFace:FONT_,fontSize:15,color:'AAA5BB'});
  s.addText('Collaboration Progress Monitor · '+PY[y]+' · '+new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'}),{x:0.9,y:6.5,w:8,h:0.4,fontFace:FONT_,fontSize:12,color:'FFFFFF'});
  const body=(topic,finding,sub,panel)=>{
    const sl=pp.addSlide(); sl.background={color:'FFFFFF'}; logo(sl,false); pg++;
    sl.addText(topic,{x:1.34,y:0.3,w:11,h:0.3,fontFace:FONT_,bold:true,fontSize:11,color:PNK,charSpacing:2});
    sl.addText(finding,{x:1.34,y:0.55,w:11.4,h:0.62,fontFace:FONT_,bold:true,fontSize:24,color:PUR,fit:'shrink'});
    sl.addText(sub,{x:1.34,y:1.15,w:11,h:0.4,fontFace:FONT_,fontSize:14,color:MID});
    if(panel){
      sl.addShape(pp.ShapeType.rect,{x:9.4,y:1.89,w:3.4,h:4.94,fill:{color:PUR},line:{color:PUR}});
      sl.addShape(pp.ShapeType.rect,{x:9.67,y:2.23,w:0.47,h:0.05,fill:{color:PNK},line:{color:PNK}});
      sl.addText(panel[0],{x:9.67,y:2.4,w:2.85,h:0.95,fontFace:FONT_,bold:true,fontSize:panel[0].length>9?20:32,color:'FFFFFF',fit:'shrink',valign:'top'});
      sl.addText(panel[1],{x:9.67,y:3.4,w:2.85,h:0.9,fontFace:FONT_,bold:true,fontSize:13,color:'FFFFFF',valign:'top',fit:'shrink'});
      sl.addText(panel[2],{x:9.67,y:4.4,w:2.85,h:2.2,fontFace:FONT_,fontSize:12,color:'FFFFFF',valign:'top',fit:'shrink'});
    }
    sl.addText(SRC,{x:0.55,y:6.99,w:11.2,h:0.25,fontFace:FONT_,fontSize:8,color:MID});
    sl.addText(String(pg).padStart(2,'0'),{x:12.3,y:6.99,w:0.5,h:0.25,fontFace:FONT_,bold:true,fontSize:9,color:PUR,align:'right'});
    return sl;
  };
  const strip=h=>h.replace(/<[^>]+>/g,'');
  const ins=plInsightList(E);
  // 1 findings
  let sl=body('Key findings',P.name+': key findings','Generated from the NCUB master panel · '+PY[y],null);
  sl.addText(ins.slice(0,7).flatMap(i=>[{text:i[0].toUpperCase(),options:{bold:true,color:PNK,fontSize:10,breakLine:true}},{text:strip(i[1]),options:{color:PUR,fontSize:12.5,breakLine:true,paraSpaceAfter:6}}]),{x:0.55,y:1.65,w:12.2,h:5.2,fontFace:FONT_,valign:'top',fit:'shrink'});
  // 2 at a glance table
  sl=body('At a glance',P.name+' against '+(B.map(b=>b.name).join(' and ')||'benchmarks'),'Latest year, '+PY[y],[plFmt(plAmt(P,'bci',y),'gbp'),'BCI '+u,P.n[y]+' universities reporting.']);
  const kp=[['Universities reporting',e=>e.n[y],'n'],['BCI '+u,e=>plAmt(e,'bci',y),'gbp'],['BCI per academic (£000)',e=>plRat(e,'bci','acad',1,y),'gbp1'],['SME share of BCI',e=>plRat(e,'sme','bci',100,y),'pct'],
    ['BCI 5-yr CAGR',e=>plCagr(plBciSeries(e),y,5),'pcts'],['Spin-outs '+u,e=>plAmt(e,'spin',y),'n1'],['Partner share of collab. research',e=>plRat(e,'cpart','collab',100,y),'pct']];
  const hdr=['Measure'].concat(E.map(e=>e.name)).map(t=>({text:t,options:{bold:true,color:'FFFFFF',fill:{color:PUR},fontSize:10}}));
  sl.addTable([hdr].concat(kp.map(k=>[{text:k[0]}].concat(E.map(e=>({text:plFmt(k[1](e),k[2]),options:{align:'right'}}))))),{x:0.5,y:1.8,w:8.6,fontFace:FONT_,fontSize:10.5,color:PUR,border:{type:'solid',color:'EEEBF1',pt:0.75},rowH:0.38});
  // 3 BCI trend
  const g5=plCagr(plBciSeries(P),y,5);
  sl=body('Trend',P.name+': business collaboration income over time','£m '+u+', real 2024/25 prices',[g5==null?'n/a':plFmt(g5,'pcts'),'5-year CAGR','Dashed lines are benchmarks. '+(PS.set==='core'?'Core 136 universities.':'All reporting providers.')]);
  const line=(slide,series,fmtc)=>slide.addChart(pp.charts.LINE,series.map(s=>({name:s.n,labels:PY,values:s.v})),{x:0.5,y:1.75,w:8.6,h:5.05,chartColors:series.map(s=>hx(s.c)),lineSize:3,lineDataSymbolSize:6,showLegend:true,legendPos:'b',legendFontSize:10,catAxisLabelFontSize:10,valAxisLabelFontSize:10,valGridLine:{color:'EEEBF1',size:0.5},valAxisLabelFormatCode:fmtc||'#,##0.0'});
  line(sl,E.map(e=>({n:e.name,c:e.col,v:PY.map((_,k)=>{const v=plAmt(e,'bci',k);return v==null?null:+(v/1000).toFixed(2);})})));
  // 4 growth index
  sl=body('Growth','Growth since the start of the series','Total BCI indexed, first year = 100',[g5==null?'n/a':plFmt(g5,'pcts'),'a year, last 5 years','Indexing lets places of different size be compared directly.']);
  line(sl,E.map(e=>{const raw=PY.map((_,k)=>e.s.bci[k]);const b=raw.find(v=>v>0);return {n:e.name,c:e.col,v:raw.map(v=>v==null||!b?null:+(v/b*100).toFixed(1))};}),'0');
  // 5 streams
  const sts=[['cr','Contract research'],['cons','Consultancy'],['fac','Facilities & equipment'],['ip','IP licensing']];
  sl=body('Composition','What the income is for','BCI by stream, £m '+u+', '+PY[y],[plFmt(plAmt(P,'bci',y),'gbp'),'BCI '+u,'Contract research, consultancy, facilities & equipment and IP licensing.']);
  sl.addChart(pp.charts.BAR,E.map(e=>({name:e.name,labels:sts.map(k=>k[1]),values:sts.map(k=>{const v=plAmt(e,k[0],y);return v==null?0:+(v/1000).toFixed(2);})})),{x:0.5,y:1.75,w:8.6,h:5.05,barDir:'col',chartColors:E.map(e=>hx(e.col)),showLegend:true,legendPos:'b',legendFontSize:10,catAxisLabelFontSize:10,valAxisLabelFontSize:10,valGridLine:{color:'EEEBF1',size:0.5},showValue:true,dataLabelFontSize:8,dataLabelFormatCode:'0.0'});
  // 6 mix 100%
  const tot=e=>sts.reduce((a,k)=>a+(e.s[k[0]][y]||0),0);
  sl=body('Composition','Mix of income streams','Share of BCI, '+PY[y],[plFmt(plRat(P,'sme','bci',100,y),'pct'),'of BCI is with SMEs','Benchmarks: '+(B.map(b=>b.name+' '+plFmt(plRat(b,'sme','bci',100,y),'pct')).join(', ')||'–')+'.']);
  sl.addChart(pp.charts.BAR,sts.map((k,i)=>({name:k[1],labels:E.map(e=>e.name),values:E.map(e=>tot(e)?+((e.s[k[0]][y]||0)/tot(e)*100).toFixed(1):0)})),{x:0.5,y:1.75,w:8.6,h:5.05,barDir:'bar',barGrouping:'percentStacked',valAxisLabelFormatCode:'0%',catAxisOrientation:'maxMin',chartColors:['3E1151','FF0090','0085CA','00B388'],showLegend:true,legendPos:'b',legendFontSize:10,catAxisLabelFontSize:10,valAxisLabelFontSize:9});
  // 7 SME share trend
  sl=body('Who it is with','SME share of business collaboration income','% of BCI from SMEs',[plFmt(plRat(P,'sme','bci',100,y),'pct'),'SME share, '+PY[y],'SMEs versus large businesses as the source of BCI.']);
  line(sl,E.map(e=>({n:e.name,c:e.col,v:PY.map((_,k)=>{const v=plRat(e,'sme','bci',100,k);return v==null?null:+v.toFixed(1);})})),'0');
  // 8 spin-outs
  sl=body('Spin-outs','Surviving spin-outs '+u,'CPM definition: HE-owned plus other spin-outs surviving 3+ years',[plFmt(plAmt(P,'spin',y),PS.scale==='per'?'n1':'n'),'spin-outs '+u+', '+PY[y],'Benchmarks: '+(B.map(b=>b.name+' '+plFmt(plAmt(b,'spin',y),PS.scale==='per'?'n1':'n')).join(', ')||'–')+'.']);
  line(sl,E.map(e=>({n:e.name,c:e.col,v:PY.map((_,k)=>{const v=plAmt(e,'spin',k);return v==null?null:+v.toFixed(2);})})),'0.0');
  // 9 universities
  const a=plAreas(PS.level)[PS.place];
  sl=body('Universities','Universities in '+P.name,'Main campus in this '+lvlTxt+', '+PY[y],[String(a.provs.length),'universities','Listed by business collaboration income.']);
  const h2=['University','BCI portfolio group','BCI','Spin-outs'].map(t=>({text:t,options:{bold:true,color:'FFFFFF',fill:{color:PUR},fontSize:10}}));
  sl.addTable([h2].concat(a.provs.slice().sort((p,q)=>(q.s.bci[y]||0)-(p.s.bci[y]||0)).slice(0,12).map(p=>[{text:p.n},{text:p.cl?p.cl.split(' (')[0]:'–'},{text:plFmt(p.s.bci[y],'gbp'),options:{align:'right'}},{text:plFmt(p.s.spin[y],'n'),options:{align:'right'}}])),
    {x:0.5,y:1.8,w:8.6,colW:[3.6,2.6,1.2,1.2],fontFace:FONT_,fontSize:10,color:PUR,border:{type:'solid',color:'EEEBF1',pt:0.75},rowH:0.32});
  // 10 local economy
  const tIds=[...new Set(a.provs.map(p=>p.t).filter(Boolean))];
  if(tIds.length){
    sl=body('Local economy','The local economy around '+P.name,'Travel-to-work areas hosting a university',[String(tIds.length),'travel-to-work area'+(tIds.length>1?'s':''),'Types follow the NCUB five-way typology (productivity, knowledge intensity, industrial legacy).']);
    const h3=['TTWA','Type','KI jobs','GVA per job','Jobs'].map(t=>({text:t,options:{bold:true,color:'FFFFFF',fill:{color:PUR},fontSize:10}}));
    sl.addTable([h3].concat(tIds.slice(0,12).map(id=>{const c=PLP.ttwa[id];return [{text:c.name},{text:c.type||'–'},{text:c.ki!=null?(c.ki*100).toFixed(0)+'%':'–',options:{align:'right'}},{text:plFmt(c.gva,'gbp0'),options:{align:'right'}},{text:plFmt(c.jobs,'n'),options:{align:'right'}}];})),
      {x:0.5,y:1.8,w:8.6,colW:[2.4,2.8,1.0,1.4,1.0],fontFace:FONT_,fontSize:10,color:PUR,border:{type:'solid',color:'EEEBF1',pt:0.75},rowH:0.32});
  }
  // 11 notes
  sl=body('Method','Reading this report','Definitions and caveats',null);
  sl.addText([
    {text:'Where it is recorded. ',options:{bold:true,color:PNK,breakLine:false}},{text:'Income is recorded where the university is based (main-campus TTWA); it does not show where partners are located or where collaboration took place.',options:{breakLine:true,paraSpaceAfter:8}},
    {text:'Per university. ',options:{bold:true,color:PNK}},{text:'Per-university figures divide by the number of providers reporting in each year, so places with many providers can be compared with places with few. Small providers pull averages down.',options:{breakLine:true,paraSpaceAfter:8}},
    {text:'BCI. ',options:{bold:true,color:PNK}},{text:'Contract research, consultancy, facilities & equipment and IP income from SMEs and large businesses; excludes CPD. Real 2024/25 prices.',options:{breakLine:true,paraSpaceAfter:8}},
    {text:'Benchmarks. ',options:{bold:true,color:PNK}},{text:'England = providers in English regions. UK = all providers in the HE-BCI panel.',options:{breakLine:true}}],
    {x:0.55,y:1.7,w:12,h:4.5,fontFace:FONT_,fontSize:14,color:PUR,valign:'top'});
  pp.writeFile({fileName:'NCUB_place_report_'+P.name.replace(/[^A-Za-z0-9]+/g,'_')+'.pptx'});
}
