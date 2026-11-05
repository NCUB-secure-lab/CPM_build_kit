/* ===================== PLACE (ITL1 / ITL2 / TTWA) ===================== */
const PLP = D.place;
const PY = PLP ? PLP.years : [];
const PL_PAL=[C.pink,C.blue,C.green,'#e8a600',C.pd,'#7b3fe4','#00a3a1','#c2185b','#6d8f00','#e8710a','#8d6e63','#3a6ea5'];
const PL_REG_COL={}; if(PLP) PLP.itl1.forEach((r,i)=>PL_REG_COL[r]=PL_PAL[i%PL_PAL.length]);
const PL_TYPE_COL={'Innovation-intensive city-regions':C.pink,'Major regional cities':C.blue,
  'Mid-sized and market towns':C.green,'Post-industrial towns and cities':C.pd,'Rural and dispersed areas':'#e8a600'};
const PL_SCALE=[[0,'#f0eaf4'],[.35,'#c79ad8'],[.7,'#8a3aa8'],[1,'#3e1151']];
const PS={level:'itl1',metric:'bci',yi:PY.length-1,set:'all',reg:'all',topN:15,sel:[],mode:'abs',cx:'ki',cy:'bci_job',init:false};
const PL_CACHE={};
const PL_LOGO='__PL_LOGO__', PL_LOGO_W='__PL_LOGO_W__';

/* metric catalogue */
const PLM={
  bci:{l:'Business collaboration income (BCI)',t:'sum',k:'bci',f:'gbp'},
  sme:{l:'BCI from SMEs',t:'sum',k:'sme',f:'gbp'},
  lc:{l:'BCI from large businesses',t:'sum',k:'lc',f:'gbp'},
  cr:{l:'Contract research income',t:'sum',k:'cr',f:'gbp'},
  cons:{l:'Consultancy income',t:'sum',k:'cons',f:'gbp'},
  fac:{l:'Facilities & equipment income',t:'sum',k:'fac',f:'gbp'},
  ip:{l:'IP licensing income',t:'sum',k:'ip',f:'gbp'},
  cpd:{l:'CPD / continuing education income',t:'sum',k:'cpd',f:'gbp'},
  collab:{l:'Collaborative research, publicly funded (total value)',t:'sum',k:'collab',f:'gbp'},
  spin:{l:'Surviving spin-outs, 3+ years (CPM definition)',t:'sum',k:'spin',f:'n'},
  acad:{l:'Academic staff (headcount)',t:'sum',k:'acad',f:'n'},
  bci_acad:{l:'BCI per academic (£000)',t:'ratio',num:'bci',den:'acad',f:'gbp1'},
  sme_sh:{l:'SME share of BCI',t:'ratio',num:'sme',den:'bci',mult:100,f:'pct'},
  intens:{l:'BCI as % of total university income',t:'ratio',num:'bci',den:'inc',mult:100,f:'pct'},
  partner:{l:'Partner share of collaborative research',t:'ratio',num:'cpart',den:'collab',mult:100,f:'pct'},
  lq:{l:'Location quotient (BCI share ÷ academic share)',t:'lq',f:'x'},
  cagr:{l:'BCI growth, 5-year CAGR',t:'cagr',f:'pcts'},
  bci_job:{l:'BCI per job in the local economy (£)',t:'job',f:'gbp0',ttwaOnly:true},
};
const PLX={ // local-economy measures for the scatter
  ki:{l:'Knowledge-intensive employment share (%)',k:'ki',m:100},
  gva:{l:'GVA per filled job, 2023 (£)',k:'gva',m:1},
  comp:{l:'Composite place score (percentile)',k:'comp',m:1},
  prod:{l:'Productivity score (percentile)',k:'prod',m:1},
  know:{l:'Knowledge-intensity score (percentile)',k:'know',m:1},
  legsh:{l:'Industrial-legacy employment share (%)',k:'legsh',m:100},
  dens:{l:'Job density (jobs per km², log scale)',k:'dens',m:1,log:true},
  jobs:{l:'Employee jobs in TTWA (log scale)',k:'jobs',m:1,log:true},
};
const PLY={bci_job:{l:'BCI per job (£, log scale)',log:true},bci:{l:'BCI (£000, log scale)',log:true},bci_acad:{l:'BCI per academic (£000)'},sme_sh:{l:'SME share of BCI (%)'},cagr:{l:'BCI 5-year CAGR (%)'}};

/* ---------- formatting ---------- */
function plFmt(v,f){
  if(v==null||!isFinite(v)) return '–';
  switch(f){
    case 'gbp': return v>=1e6?'£'+(v/1e6).toFixed(2)+'bn':v>=1000?'£'+(v/1000).toFixed(v>=100000?0:1)+'m':'£'+Math.round(v)+'k';
    case 'gbp1': return '£'+v.toFixed(1)+'k';
    case 'gbp0': return '£'+Math.round(v).toLocaleString('en-GB');
    case 'n': return Math.round(v).toLocaleString('en-GB');
    case 'pct': return v.toFixed(1)+'%';
    case 'pcts': return (v>0?'+':'')+v.toFixed(1)+'%';
    case 'x': return v.toFixed(2)+'×';
  }
  return String(v);
}
const plName=(lvl,id)=> lvl==='itl1'?id : lvl==='itl2'?(PLP.itl2[id]?PLP.itl2[id].name:id) : (PLP.ttwa[id]?PLP.ttwa[id].name:id);
const plLc=t=>t.replace(/^([A-Z])([a-z])/,(m,a,b)=>a.toLowerCase()+b);
const plShort=s=> s.length>34?s.slice(0,32)+'…':s;

/* ---------- aggregation ---------- */
function plAgg(level,set){
  const key=level+'|'+set; if(PL_CACHE[key]) return PL_CACHE[key];
  const nY=PY.length, M=Object.keys(PLP.provs[0].s);
  const mk=()=>{const o={};M.forEach(k=>o[k]=Array(nY).fill(null));return o;};
  const add=(o,p)=>M.forEach(k=>{const a=p.s[k];for(let y=0;y<nY;y++) if(a[y]!=null) o[k][y]=(o[k][y]||0)+a[y];});
  const areas={}, uk=mk(), ukN=Array(nY).fill(0);
  PLP.provs.forEach(p=>{
    if(set==='core'&&!p.core) return;
    add(uk,p); for(let y=0;y<nY;y++) if(p.s.bci[y]!=null) ukN[y]++;
    const id=level==='itl1'?p.r:level==='itl2'?p.i2:p.t; if(!id) return;
    let a=areas[id];
    if(!a) a=areas[id]={id,name:plName(level,id),r:null,provs:[],s:mk(),n:Array(nY).fill(0),_r:{}};
    add(a.s,p); a.provs.push(p); if(p.r) a._r[p.r]=(a._r[p.r]||0)+1;
    for(let y=0;y<nY;y++) if(p.s.bci[y]!=null) a.n[y]++;
  });
  const list=Object.values(areas);
  list.forEach(a=>{
    if(level==='itl1') a.r=a.id;
    else if(level==='itl2') a.r=PLP.itl2[a.id]?PLP.itl2[a.id].r:null;
    if(!a.r){ let b=-1; for(const r in a._r) if(a._r[r]>b){b=a._r[r];a.r=r;} }
    let sw=0,sla=0,slo=0;
    a.provs.forEach(p=>{ if(p.lat==null) return; const w=Math.max((p.s.bci[PY.length-1]||0),1); sw+=w; sla+=w*p.lat; slo+=w*p.lon; });
    a.lat=sw?sla/sw:null; a.lon=sw?slo/sw:null;
    a.ctx=level==='ttwa'?PLP.ttwa[a.id]:null;
    a.i2c=level==='itl2'?PLP.itl2[a.id]:null;
  });
  return PL_CACHE[key]={list,map:Object.fromEntries(list.map(a=>[a.id,a])),uk,ukN};
}
function plVal(a,m,y,uk,mkey){
  const d=PLM[m||PS.metric], s=a.s;
  switch(d.t){
    case 'sum': return s[d.k][y];
    case 'ratio': {const n=s[d.num][y],q=s[d.den][y]; return (n==null||!q)?null:n/q*(d.mult||1);}
    case 'lq': {const sh=s.bci[y]/uk.bci[y], ah=(s.acad[y]!=null&&uk.acad[y])?s.acad[y]/uk.acad[y]:null; return (ah&&sh!=null)?sh/ah:null;}
    case 'cagr': {if(y<5) return null; const a0=s.bci[y-5],b=s.bci[y]; return (a0>0&&b>0)?(Math.pow(b/a0,1/5)-1)*100:null;}
    case 'job': {const c=a.ctx; return (c&&c.jobs&&s.bci[y]!=null)?s.bci[y]*1000/c.jobs:null;}
  }
  return null;
}
/* UK-wide equivalent of the metric (null when it has no meaning) */
function plUk(m,y,G){
  const d=PLM[m], uk=G.uk;
  const fake={s:uk,ctx:null};
  if(d.t==='job') return null;
  return plVal(fake,m,y,uk);
}
function plVisible(G){
  let l=G.list;
  if(PS.level!=='itl1' && PS.reg!=='all') l=l.filter(a=>a.r===PS.reg);
  return l;
}
function plRanked(G,m,y){
  m=m||PS.metric; y=(y==null)?PS.yi:y;
  return plVisible(G).map(a=>({a,v:plVal(a,m,y,G.uk)})).filter(o=>o.v!=null&&isFinite(o.v)).sort((p,q)=>q.v-p.v);
}
const plCol=a=>PL_REG_COL[a.r]||C.pm;
function plSelColour(i){return PL_PAL[i%PL_PAL.length];}

/* ---------- control wiring ---------- */
function renderPlace(){
  if(!PLP||!PLP.provs){document.getElementById('sub-place').innerHTML='<p>Place data unavailable (input/master_panel.xlsx not found at build time).</p>';return;}
  const mSel=document.getElementById('plMetric');
  const groups=[['Collaboration income',['bci','sme','lc','cr','cons','fac','ip','cpd','collab']],
                ['Activity & scale',['spin','acad']],
                ['Intensity & performance',['bci_acad','sme_sh','intens','partner','lq','cagr','bci_job']]];
  mSel.innerHTML=groups.map(g=>`<optgroup label="${g[0]}">${g[1].map(k=>`<option value="${k}">${PLM[k].l}${PLM[k].ttwaOnly?' (TTWA only)':''}</option>`).join('')}</optgroup>`).join('');
  mSel.value=PS.metric;
  document.getElementById('plYear').innerHTML=PY.map((y,i)=>`<option value="${i}">${y}</option>`).join('');
  document.getElementById('plYear').value=PS.yi;
  document.getElementById('plReg').innerHTML='<option value="all">All of the UK</option>'+PLP.itl1.map(r=>`<option>${r}</option>`).join('');
  document.getElementById('plCtxX').innerHTML=Object.keys(PLX).map(k=>`<option value="${k}">${PLX[k].l}</option>`).join('');
  document.getElementById('plCtxY').innerHTML=['bci_job','bci','bci_acad','sme_sh','cagr'].map(k=>`<option value="${k}">${PLM[k].l}</option>`).join('');
  document.getElementById('plCtxX').value=PS.cx; document.getElementById('plCtxY').value=PS.cy;

  const seg=(id,key,after)=>document.getElementById(id).addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b) return;
    document.querySelectorAll('#'+id+' button').forEach(x=>x.classList.toggle('active',x===b));
    PS[key]=b.dataset.v; if(after) after(); plRender();
  });
  seg('plLevel','level',()=>{PS.sel=[];PS.reg='all';document.getElementById('plReg').value='all';
    if(PS.level!=='ttwa'&&PLM[PS.metric].ttwaOnly){PS.metric='bci';mSel.value='bci';}});
  seg('plSet','set',()=>{PS.sel=[];});
  seg('plTrendMode','mode');
  mSel.addEventListener('change',()=>{PS.metric=mSel.value;
    if(PLM[PS.metric].ttwaOnly&&PS.level!=='ttwa'){ // switch to TTWA so the metric has meaning
      PS.level='ttwa';PS.sel=[];document.querySelectorAll('#plLevel button').forEach(x=>x.classList.toggle('active',x.dataset.v==='ttwa'));}
    plRender();});
  document.getElementById('plYear').addEventListener('change',e=>{PS.yi=+e.target.value;plRender();});
  document.getElementById('plReg').addEventListener('change',e=>{PS.reg=e.target.value;PS.sel=[];plRender();});
  document.getElementById('plTopN').addEventListener('change',e=>{PS.topN=+e.target.value;plRender();});
  document.getElementById('plCtxX').addEventListener('change',e=>{PS.cx=e.target.value;plCtx();});
  document.getElementById('plCtxY').addEventListener('change',e=>{PS.cy=e.target.value;plCtx();});
  document.getElementById('plChips').addEventListener('click',e=>{
    const b=e.target.closest('button[data-id]'); if(!b) return;
    PS.sel=PS.sel.filter(x=>x!==b.dataset.id); plRender();});
  document.getElementById('plPptArea').addEventListener('click',()=>plPptx(PS.sel[0]||null));
  document.getElementById('plPptUk').addEventListener('click',()=>plPptx(null));
  plRender();
}

function plToggleSel(id){
  const i=PS.sel.indexOf(id);
  if(i>=0) PS.sel.splice(i,1); else { PS.sel.push(id); if(PS.sel.length>6) PS.sel.shift(); }
  plRender();
}

function plRender(){
  const G=plAgg(PS.level,PS.set);
  document.getElementById('plRegWrap').style.display=PS.level==='itl1'?'none':'';
  // keep only valid selection; default to the top 3 of the current metric
  PS.sel=PS.sel.filter(id=>G.map[id]);
  if(!PS.sel.length){ PS.sel=plRanked(G,PS.metric==='cagr'||PS.metric==='lq'?'bci':PS.metric).slice(0,3).map(o=>o.a.id); }
  plKpis(G); plInsights(G); plMap(G); plRank(G); plChips(G); plTrend(G);
  plShare(G); plConc(G); plMix(G); plSme(G); plCtx(); plType(); plProfile(G);
}

/* ---------- KPIs ---------- */
function plKpis(G){
  const d=PLM[PS.metric], y=PS.yi, rk=plRanked(G,PS.metric,y), uk=plUk(PS.metric,y,G);
  const nUni=G.ukN[y];
  const placed=PS.level==='itl1'?G.list.reduce((s,a)=>s+a.n[y],0):G.list.reduce((s,a)=>s+a.n[y],0);
  const lead=rk[0];
  const k=[];
  k.push({v:G.list.length,l:(PS.level==='itl1'?'ITL1 regions':PS.level==='itl2'?'ITL2 sub-regions':'travel-to-work areas')+' with a university',cls:''});
  k.push({v:placed+' of '+nUni,l:'universities placed at a campus location in '+PY[y],cls:'b'});
  if(d.t==='sum'){
    const tot=G.uk[d.k][y];
    k.push({v:plFmt(tot,d.f),l:'UK total, '+PY[y],cls:'g'});
    if(lead){const top3=rk.slice(0,3).reduce((s,o)=>s+o.v,0)/tot*100;
      k.push({v:lead.a.name.length>22?plShort(lead.a.name):lead.a.name,l:'largest: '+plFmt(lead.v,d.f)+' ('+(lead.v/tot*100).toFixed(0)+'% of UK)',cls:'y'});
      k.push({v:top3.toFixed(0)+'%',l:'of the UK total sits in the top three',cls:''});}
  } else {
    k.push({v:uk!=null?plFmt(uk,d.f):'–',l:'UK-wide value, '+PY[y],cls:'g'});
    if(lead){k.push({v:plShort(lead.a.name),l:'highest: '+plFmt(lead.v,d.f),cls:'y'});
      const above=uk!=null?rk.filter(o=>o.v>uk).length:null;
      k.push({v:above==null?'–':above+' of '+rk.length,l:'areas above the UK-wide value',cls:''});}
  }
  document.getElementById('plKpis').innerHTML=k.map(o=>`<div class="kpi ${o.cls}"><div class="v" style="font-size:${String(o.v).length>14?'18':'26'}px">${o.v}</div><div class="l">${o.l}</div></div>`).join('');
}

/* ---------- insights (computed from the current selection) ---------- */
function plSpearman(xs,ys){
  const rank=a=>{const idx=a.map((v,i)=>[v,i]).sort((p,q)=>p[0]-q[0]);const r=Array(a.length);idx.forEach((p,i)=>r[p[1]]=i+1);return r;};
  const rx=rank(xs),ry=rank(ys),n=xs.length; if(n<5) return null;
  const mx=rx.reduce((a,b)=>a+b,0)/n,my=ry.reduce((a,b)=>a+b,0)/n;
  let sxy=0,sx=0,sy=0; for(let i=0;i<n;i++){sxy+=(rx[i]-mx)*(ry[i]-my);sx+=(rx[i]-mx)**2;sy+=(ry[i]-my)**2;}
  return sxy/Math.sqrt(sx*sy);
}
function plInsightList(G,y){
  const out=[], d=PLM[PS.metric], lvl=PS.level==='itl1'?'region':PS.level==='itl2'?'sub-region':'travel-to-work area';
  const bciRank=plRanked(G,'bci',y), totB=G.uk.bci[y];
  const rk=plRanked(G,PS.metric,y);
  // 1 leader on the chosen metric
  if(rk.length){
    const ld=rk[0], uk=plUk(PS.metric,y,G);
    if(d.t==='sum'){const tot=G.uk[d.k][y];
      out.push(['Where it concentrates',`<b>${ld.a.name}</b> leads on ${plLc(d.l)} with ${plFmt(ld.v,d.f)}, ${(ld.v/tot*100).toFixed(0)}% of the UK total in ${PY[y]}.`+(rk.length>3?` The top three ${lvl}s together hold ${(rk.slice(0,3).reduce((s,o)=>s+o.v,0)/tot*100).toFixed(0)}%.`:'')]);
    } else {
      const lo=rk[rk.length-1];
      out.push(['Spread across places',`${d.l} runs from <b>${plFmt(lo.v,d.f)}</b> in ${lo.a.name} to <b>${plFmt(ld.v,d.f)}</b> in ${ld.a.name}`+(uk!=null?` (UK-wide ${plFmt(uk,d.f)}).`:'.')]);
    }
  }
  // 2 how many areas for half of BCI
  if(bciRank.length>3){let c=0,n=0;for(const o of bciRank){c+=o.v;n++;if(c>=totB*.5)break;}
    out.push(['Concentration',`Just <b>${n}</b> of ${bciRank.length} ${lvl}s account for half of UK business collaboration income (${plFmt(totB,'gbp')} in ${PY[y]}).`]);}
  // 3 over / under indexing
  const lqs=plVisible(G).map(a=>({a,lq:plVal(a,'lq',y,G.uk),sh:a.s.bci[y]/totB})).filter(o=>o.lq!=null&&o.sh>=0.01).sort((p,q)=>q.lq-p.lq);
  if(lqs.length>3){const hi=lqs[0],lo=lqs[lqs.length-1];
    out.push(['Above and below weight',`<b>${hi.a.name}</b> earns ${(hi.sh*100).toFixed(0)}% of UK BCI with ${(hi.a.s.acad[y]/G.uk.acad[y]*100).toFixed(0)}% of academics (${hi.lq.toFixed(1)}×); <b>${lo.a.name}</b> sits lowest among larger areas at ${lo.lq.toFixed(1)}×.`]);}
  // 4 growth
  const gr=plVisible(G).map(a=>({a,g:plVal(a,'cagr',y,G.uk),sh:a.s.bci[y]/totB})).filter(o=>o.g!=null&&o.sh>=0.01).sort((p,q)=>q.g-p.g);
  if(gr.length>3){const hi=gr[0],lo=gr[gr.length-1];
    out.push(['Momentum (5 years)',`Fastest-growing BCI among larger ${lvl}s: <b>${hi.a.name}</b> (${plFmt(hi.g,'pcts')} a year). Weakest: <b>${lo.a.name}</b> (${plFmt(lo.g,'pcts')}).`+(PS.set==='all'?' <i>Includes providers entering the panel.</i>':'')]);}
  // 5 SME orientation
  const sm=plVisible(G).map(a=>({a,v:plVal(a,'sme_sh',y,G.uk)})).filter(o=>o.v!=null&&o.a.s.bci[y]>=totB*.01).sort((p,q)=>q.v-p.v);
  if(sm.length>3){const ukv=plUk('sme_sh',y,G);
    out.push(['SME orientation',`SMEs supply ${plFmt(ukv,'pct')} of UK BCI. The most SME-oriented larger ${lvl} is <b>${sm[0].a.name}</b> (${plFmt(sm[0].v,'pct')}); the least is <b>${sm[sm.length-1].a.name}</b> (${plFmt(sm[sm.length-1].v,'pct')}).`]);}
  // 6 place & economy (always TTWA level, independent of geography toggle)
  const T=plAgg('ttwa',PS.set).list.filter(a=>a.ctx&&a.ctx.ki!=null&&a.ctx.jobs&&a.s.bci[y]>0);
  if(T.length>8){const rho=plSpearman(T.map(a=>a.ctx.ki),T.map(a=>a.s.bci[y]*1000/a.ctx.jobs));
    if(rho!=null) out.push(['Place and economy',`Across ${T.length} university towns and cities, BCI per local job is ${Math.abs(rho)<.2?'only weakly':rho>0?'positively':'negatively'} associated with knowledge-intensive employment share (Spearman ρ = ${rho.toFixed(2)}).`]);}
  // 7 selected area
  const f=PS.sel[0]&&G.map[PS.sel[0]];
  if(f&&bciRank.length){const pos=bciRank.findIndex(o=>o.a.id===f.id)+1;
    if(pos) out.push(['In focus: '+plShort(f.name),`Ranks <b>#${pos} of ${bciRank.length}</b> on BCI (${plFmt(f.s.bci[y],'gbp')}, ${(f.s.bci[y]/totB*100).toFixed(1)}% of UK) across ${f.n[y]} universit${f.n[y]===1?'y':'ies'}.`]);}
  return out;
}
function plInsights(G){
  document.getElementById('plInsights').innerHTML=plInsightList(G,PS.yi).map(i=>`<div class="insight"><b class="h">${i[0]}</b>${i[1]}</div>`).join('');
}

/* ---------- map ---------- */
function plMap(G){
  const d=PLM[PS.metric], y=PS.yi, rk=plRanked(G,PS.metric,y), el=document.getElementById('chPlMap');
  document.getElementById('plMapTitle').textContent=d.l+', '+PY[y];
  const traces=[];
  if(PS.level==='itl1'){
    traces.push({type:'choropleth',geojson:D.geo,locations:rk.map(o=>o.a.id),z:rk.map(o=>o.v),featureidkey:'properties.region',
      colorscale:PL_SCALE,marker:{line:{color:PS.sel.length?rk.map(o=>PS.sel.includes(o.a.id)?C.pink:'#fff'):'#fff',width:rk.map(o=>PS.sel.includes(o.a.id)?3:1)}},
      text:rk.map(o=>`<b>${o.a.name}</b><br>${d.l}: <b>${plFmt(o.v,d.f)}</b><br>${o.a.n[y]} universities`),hovertemplate:'%{text}<extra></extra>',
      colorbar:{thickness:12,len:.6,tickfont:{size:11}}});
  } else {
    traces.push({type:'choropleth',geojson:D.geo,locations:PLP.itl1,z:PLP.itl1.map(()=>0),featureidkey:'properties.region',
      colorscale:[[0,'#eeebf1'],[1,'#eeebf1']],showscale:false,hoverinfo:'skip',marker:{line:{color:'#fff',width:1}}});
    const ok=rk.filter(o=>o.a.lat!=null), mx=Math.max(...ok.map(o=>Math.max(o.v,0)),1e-9);
    traces.push({type:'scattergeo',lat:ok.map(o=>o.a.lat),lon:ok.map(o=>o.a.lon),customdata:ok.map(o=>o.a.id),
      text:ok.map(o=>`<b>${o.a.name}</b><br>${o.a.r}<br>${d.l}: <b>${plFmt(o.v,d.f)}</b><br>${o.a.n[y]} universit${o.a.n[y]===1?'y':'ies'}`),hovertemplate:'%{text}<extra></extra>',
      marker:{size:ok.map(o=>6+(PS.level==='itl2'?44:36)*Math.sqrt(Math.max(o.v,0)/mx)),color:ok.map(o=>PL_REG_COL[o.a.r]||C.pm),opacity:.78,
        line:{color:ok.map(o=>PS.sel.includes(o.a.id)?'#111':'#fff'),width:ok.map(o=>PS.sel.includes(o.a.id)?3:1)}},showlegend:false});
  }
  Plotly.newPlot(el,traces,L({geo:{scope:'europe',fitbounds:'locations',projection:{type:'mercator'},bgcolor:'rgba(0,0,0,0)',showframe:false,showcoastlines:false,showland:false},
    margin:{l:0,r:0,t:6,b:0},height:560,dragmode:false}),CFG);
  if(el.removeAllListeners) el.removeAllListeners('plotly_click');
  el.on('plotly_click',ev=>{const p=ev.points&&ev.points[0]; if(!p) return; const id=PS.level==='itl1'?p.location:p.customdata; if(id&&G.map[id]) plToggleSel(id);});
}

/* ---------- ranking ---------- */
function plRank(G){
  const d=PLM[PS.metric], y=PS.yi; let rk=plRanked(G,PS.metric,y); const total=rk.length;
  const n=PS.level==='itl1'?rk.length:Math.min(PS.topN,rk.length); rk=rk.slice(0,n);
  document.getElementById('plTopN').parentNode.style.display=PS.level==='itl1'?'none':'';
  document.getElementById('plRankTitle').textContent='Ranking: '+d.l+', '+PY[y];
  document.getElementById('plRankSrc').textContent=(n<total?'Showing '+n+' of '+total+' areas. ':'')+'Colours show the ITL1 region. Selected areas are outlined. Source: HE-BCI via NCUB master panel.';
  const rev=rk.slice().reverse(), el=document.getElementById('chPlRank');
  const ukv=plUk(PS.metric,y,G);
  Plotly.newPlot(el,[{type:'bar',orientation:'h',y:rev.map(o=>plShort(o.a.name)),x:rev.map(o=>o.v),customdata:rev.map(o=>o.a.id),
    marker:{color:rev.map(o=>plCol(o.a)),line:{color:rev.map(o=>PS.sel.includes(o.a.id)?'#111':'rgba(0,0,0,0)'),width:rev.map(o=>PS.sel.includes(o.a.id)?3:0)}},
    text:rev.map(o=>plFmt(o.v,d.f)),textposition:'outside',cliponaxis:false,
    hovertemplate:rev.map(o=>`<b>${o.a.name}</b><br>${o.a.r}<br>${d.l}: <b>${plFmt(o.v,d.f)}</b><extra></extra>`)}],
    L({height:Math.max(420,26*rk.length+90),margin:{l:230,r:70,t:10,b:40},xaxis:{gridcolor:'#eeebf1',zeroline:true},yaxis:{automargin:true,tickfont:{size:12}},
      shapes:(ukv!=null&&d.t!=='sum')?[{type:'line',x0:ukv,x1:ukv,y0:-.5,y1:rk.length-.5,line:{color:C.pd,dash:'dash',width:1.5}}]:[],
      annotations:(ukv!=null&&d.t!=='sum')?[{x:ukv,y:rk.length-.5,text:'UK '+plFmt(ukv,d.f),showarrow:false,yanchor:'bottom',font:{size:11,color:C.pd}}]:[]}),CFG);
  if(el.removeAllListeners) el.removeAllListeners('plotly_click');
  el.on('plotly_click',ev=>{const p=ev.points&&ev.points[0]; if(p&&p.customdata) plToggleSel(p.customdata);});
}

/* ---------- selected-area chips and trend ---------- */
function plChips(G){
  document.getElementById('plChips').innerHTML=PS.sel.map((id,i)=>`<span class="pl-chip" style="background:${plSelColour(i)}">${G.map[id].name}<button data-id="${id}" aria-label="Remove ${G.map[id].name}">✕</button></span>`).join('')
    +(PS.sel.length?'':'<span style="font-size:13px;color:var(--purple-mid)">Click bars, bubbles or regions to add areas</span>');
}
function plTrend(G){
  const d=PLM[PS.metric], idxOk=(d.t==='sum'||d.t==='job')&&PS.mode==='idx', traces=[];
  PS.sel.forEach((id,i)=>{const a=G.map[id]; let ys=PY.map((_,y)=>plVal(a,PS.metric,y,G.uk));
    if(idxOk){const b=ys.find(v=>v!=null&&v>0); ys=ys.map(v=>v==null||!b?null:v/b*100);}
    traces.push({x:PY,y:ys,name:a.name,mode:'lines+markers',line:{color:plSelColour(i),width:3},marker:{size:6},connectgaps:false,
      hovertemplate:'%{x}: <b>'+(idxOk?'%{y:.0f}':'%{y}')+'</b><extra>'+a.name+'</extra>'});});
  if(PLM[PS.metric].t!=='job'){
    let uy=PY.map((_,y)=>plUk(PS.metric,y,G));
    if(idxOk){const b=uy.find(v=>v!=null&&v>0); uy=uy.map(v=>v==null||!b?null:v/b*100);}
    if(idxOk||d.t!=='sum') traces.push({x:PY,y:uy,name:'UK',mode:'lines',line:{color:C.pm,width:2,dash:'dash'}});}
  const fmtAx=idxOk?{}:{tickformat:d.f==='pct'||d.f==='pcts'?'.0f':d.f==='x'?'.2f':','};
  Plotly.newPlot('chPlTrend',traces,L({height:480,margin:{l:80,r:20,t:10,b:60},
    yaxis:Object.assign({gridcolor:'#eeebf1',title:{text:idxOk?'Index (first year = 100)':d.l,font:{size:12}}},fmtAx)}),CFG);
}

/* ---------- share of BCI vs share of academics ---------- */
function plShare(G){
  const y=PS.yi, rk=plRanked(G,'bci',y).slice(0,Math.min(PS.level==='itl1'?12:15,999)), totB=G.uk.bci[y], totA=G.uk.acad[y];
  const rev=rk.slice().reverse();
  Plotly.newPlot('chPlShare',[
    {type:'bar',orientation:'h',name:'Share of UK BCI',y:rev.map(o=>plShort(o.a.name)),x:rev.map(o=>o.a.s.bci[y]/totB*100),marker:{color:C.pink},
     hovertemplate:'%{y}: %{x:.1f}% of UK BCI<extra></extra>'},
    {type:'bar',orientation:'h',name:'Share of UK academic staff',y:rev.map(o=>plShort(o.a.name)),x:rev.map(o=>o.a.s.acad[y]!=null?o.a.s.acad[y]/totA*100:null),marker:{color:C.pl},
     hovertemplate:'%{y}: %{x:.1f}% of UK academics<extra></extra>'}],
    L({barmode:'group',height:Math.max(420,rk.length*34+90),margin:{l:230,r:30,t:10,b:60},xaxis:{ticksuffix:'%',gridcolor:'#eeebf1'},yaxis:{automargin:true},
      annotations:rev.map(o=>{const lq=plVal(o.a,'lq',y,G.uk); return lq==null?null:{x:Math.max(o.a.s.bci[y]/totB*100,(o.a.s.acad[y]||0)/totA*100),y:plShort(o.a.name),text:' '+lq.toFixed(1)+'×',showarrow:false,xanchor:'left',font:{size:11,color:lq>=1?'#00805f':'#b3261e'}};}).filter(Boolean)}),CFG);
}

/* ---------- concentration ---------- */
function plConc(G){
  const y=PS.yi, d=PLM[PS.metric], m=d.t==='sum'?PS.metric:'bci', dd=PLM[m];
  const rk=plRanked(G,m,y).filter(o=>o.v>0), tot=G.uk[dd.k][y]; let c=0;
  const cum=rk.map(o=>(c+=o.v)/tot*100);
  const half=cum.findIndex(v=>v>=50)+1;
  Plotly.newPlot('chPlConc',[
    {x:rk.map((_,i)=>i+1),y:cum,type:'scatter',mode:'lines+markers',name:'Cumulative share',line:{color:C.pink,width:3},marker:{size:6},text:rk.map(o=>o.a.name),
      hovertemplate:'Top %{x}: %{y:.0f}% of UK<br>last added: %{text}<extra></extra>'},
    {x:[0,rk.length],y:[0,rk.length?cum[cum.length-1]:0],type:'scatter',mode:'lines',name:'Equal spread',line:{color:C.pl,dash:'dash'},hoverinfo:'skip'}],
    L({height:420,margin:{l:60,r:20,t:10,b:60},xaxis:{title:{text:'Areas ranked by '+plLc(dd.l),font:{size:12}},gridcolor:'#eeebf1'},yaxis:{ticksuffix:'%',range:[0,100],gridcolor:'#eeebf1'}}),CFG);
  document.getElementById('plConcSrc').textContent=`${PY[y]}. ${half?half+' area'+(half>1?'s':'')+' account for half of '+dd.l+'. ':''}Shares are of the UK total, including providers without a campus location.`;
}

/* ---------- composition and SME share ---------- */
function plMix(G){
  const y=PS.yi, parts=[['cr','Contract research',C.pd],['cons','Consultancy',C.pink],['fac','Facilities & equipment',C.blue],['ip','IP licensing',C.green]];
  const rows=PS.sel.map(id=>G.map[id]).map(a=>({n:a.name,s:a.s}));
  rows.push({n:'UK',s:G.uk});
  const rev=rows.slice().reverse();
  Plotly.newPlot('chPlMix',parts.map(p=>({type:'bar',orientation:'h',name:p[1],y:rev.map(r=>plShort(r.n)),x:rev.map(r=>{const t=(r.s.cr[y]||0)+(r.s.cons[y]||0)+(r.s.fac[y]||0)+(r.s.ip[y]||0);return t?(r.s[p[0]][y]||0)/t*100:0;}),
    marker:{color:p[2]},hovertemplate:'%{y}: %{x:.0f}% '+p[1]+'<extra></extra>'})),
    L({barmode:'stack',height:Math.max(340,rows.length*58+110),margin:{l:230,r:20,t:10,b:70},xaxis:{ticksuffix:'%',range:[0,100],gridcolor:'#eeebf1'},yaxis:{automargin:true}}),CFG);
}
function plSme(G){
  const traces=PS.sel.map((id,i)=>{const a=G.map[id];return {x:PY,y:PY.map((_,y)=>plVal(a,'sme_sh',y,G.uk)),name:a.name,mode:'lines+markers',line:{color:plSelColour(i),width:3},marker:{size:6}};});
  traces.push({x:PY,y:PY.map((_,y)=>plUk('sme_sh',y,G)),name:'UK',mode:'lines',line:{color:C.pm,width:2,dash:'dash'}});
  Plotly.newPlot('chPlSme',traces,L({height:380,margin:{l:60,r:20,t:10,b:60},yaxis:{ticksuffix:'%',gridcolor:'#eeebf1'}}),CFG);
}

/* ---------- place & local economy ---------- */
function plSelTtwas(){
  const G=plAgg(PS.level,PS.set), s=new Set();
  PS.sel.forEach(id=>{const a=G.map[id]; if(!a) return; if(PS.level==='ttwa') s.add(id); else a.provs.forEach(p=>{if(p.t)s.add(p.t);});});
  return s;
}
function plCtx(){
  const y=PS.yi, X=PLX[PS.cx], Yd=PLM[PS.cy], YY=PLY[PS.cy]||{}, T=plAgg('ttwa',PS.set), sel=plSelTtwas();
  const pts=T.list.map(a=>{const c=a.ctx; if(!c||c[X.k]==null) return null; const v=plVal(a,PS.cy,y,T.uk); if(v==null||(YY.log&&v<=0)||a.s.bci[y]==null) return null;
    return {a,x:c[X.k]*X.m,y:v,b:a.s.bci[y],type:c.type||'Not typed'};}).filter(Boolean);
  const types=[...new Set(pts.map(p=>p.type))];
  const mx=Math.max(...pts.map(p=>p.b),1);
  const traces=types.map(t=>{const P=pts.filter(p=>p.type===t);
    return {type:'scatter',mode:'markers',name:t,x:P.map(p=>p.x),y:P.map(p=>p.y),customdata:P.map(p=>p.a.id),
      text:P.map(p=>`<b>${p.a.name}</b><br>${t}<br>${X.l}: ${p.x.toLocaleString('en-GB',{maximumFractionDigits:1})}<br>${Yd.l}: ${plFmt(p.y,Yd.f)}<br>BCI: ${plFmt(p.b,'gbp')}`),hovertemplate:'%{text}<extra></extra>',
      marker:{color:PL_TYPE_COL[t]||C.pm,opacity:.8,size:P.map(p=>8+38*Math.sqrt(p.b/mx)),line:{color:P.map(p=>sel.has(p.a.id)?'#111':'#fff'),width:P.map(p=>sel.has(p.a.id)?3:1)}}};});
  // fitted trend (OLS on x vs y, log y when the axis is log)
  const xs=pts.map(p=>X.log?Math.log10(p.x):p.x), ys=pts.map(p=>YY.log?Math.log10(p.y):p.y), n=pts.length;
  let note='';
  if(n>5){const mxv=xs.reduce((a,b)=>a+b,0)/n,myv=ys.reduce((a,b)=>a+b,0)/n;let sxy=0,sxx=0;for(let i=0;i<n;i++){sxy+=(xs[i]-mxv)*(ys[i]-myv);sxx+=(xs[i]-mxv)**2;}
    const b1=sxy/sxx,b0=myv-b1*mxv,x0=Math.min(...xs),x1=Math.max(...xs), tx=v=>X.log?Math.pow(10,v):v, ty=v=>YY.log?Math.pow(10,v):v;
    traces.push({type:'scatter',mode:'lines',name:'Linear fit',x:[tx(x0),tx(x1)],y:[ty(b0+b1*x0),ty(b0+b1*x1)],line:{color:C.pd,dash:'dash',width:2},hoverinfo:'skip'});
    const rho=plSpearman(pts.map(p=>p.x),pts.map(p=>p.y)); if(rho!=null) note=`Spearman ρ = ${rho.toFixed(2)} across ${n} areas`;}
  Plotly.newPlot('chPlCtx',traces,L({height:560,margin:{l:80,r:20,t:30,b:70},
    xaxis:{title:{text:X.l,font:{size:12}},type:X.log?'log':'linear',gridcolor:'#eeebf1'},
    yaxis:{title:{text:Yd.l+(YY.log?' (log scale)':''),font:{size:12}},type:YY.log?'log':'linear',gridcolor:'#eeebf1'},
    annotations:note?[{xref:'paper',yref:'paper',x:0,y:1.04,text:note,showarrow:false,xanchor:'left',font:{size:12,color:C.pm}}]:[]}),CFG);
  const el=document.getElementById('chPlCtx'); if(el.removeAllListeners) el.removeAllListeners('plotly_click');
  el.on('plotly_click',ev=>{const p=ev.points&&ev.points[0]; if(!p||!p.customdata) return;
    if(PS.level!=='ttwa'){PS.level='ttwa';PS.sel=[];document.querySelectorAll('#plLevel button').forEach(x=>x.classList.toggle('active',x.dataset.v==='ttwa'));}
    plToggleSel(p.customdata);});
}
function plType(){
  const y=PS.yi, T=plAgg('ttwa',PS.set), groups={};
  T.list.forEach(a=>{const t=(a.ctx&&a.ctx.type)||'Not typed'; const g=groups[t]||(groups[t]={b:0,jobs:0,n:0}); g.b+=a.s.bci[y]||0; g.jobs+=(a.ctx&&a.ctx.jobs)||0; g.n++;});
  const ts=Object.keys(groups).sort((p,q)=>groups[q].b-groups[p].b), tb=ts.reduce((s,t)=>s+groups[t].b,0), tj=ts.reduce((s,t)=>s+groups[t].jobs,0);
  Plotly.newPlot('chPlType',[
    {type:'bar',name:'Share of BCI',x:ts,y:ts.map(t=>groups[t].b/tb*100),marker:{color:C.pink},
     hovertemplate:ts.map(t=>`<b>${t}</b><br>${(groups[t].b/tb*100).toFixed(0)}% of BCI (${plFmt(groups[t].b,'gbp')})<br>${groups[t].n} TTWAs<br>BCI per job: ${plFmt(groups[t].jobs?groups[t].b*1000/groups[t].jobs:null,'gbp0')}<extra></extra>`)},
    {type:'bar',name:'Share of jobs in these TTWAs',x:ts,y:ts.map(t=>groups[t].jobs/tj*100),marker:{color:C.pl},
     hovertemplate:ts.map(t=>`<b>${t}</b><br>${(groups[t].jobs/tj*100).toFixed(0)}% of jobs<extra></extra>`)}],
    L({barmode:'group',height:420,margin:{l:55,r:20,t:10,b:130},yaxis:{ticksuffix:'%',gridcolor:'#eeebf1'},xaxis:{tickangle:-20,automargin:true}}),CFG);
}

/* ---------- area profile ---------- */
function plProfile(G){
  const f=PS.sel[0]&&G.map[PS.sel[0]], y=PS.yi, box=document.getElementById('plProfile');
  if(!f){box.innerHTML='<p style="color:var(--purple-mid)">Select an area to see its profile.</p>';return;}
  document.getElementById('plProfTitle').textContent='Profile: '+f.name;
  document.getElementById('plProfNote').textContent=f.r+' · '+PY[y];
  const totB=G.uk.bci[y], rk=plRanked(G,'bci',y), pos=rk.findIndex(o=>o.a.id===f.id)+1;
  const lq=plVal(f,'lq',y,G.uk), g=plVal(f,'cagr',y,G.uk), sme=plVal(f,'sme_sh',y,G.uk);
  const kp=[['BCI',plFmt(f.s.bci[y],'gbp')],['Rank',pos?'#'+pos+' of '+rk.length:'–'],['Share of UK',(f.s.bci[y]/totB*100).toFixed(1)+'%'],['Location quotient',plFmt(lq,'x')],['5-yr CAGR',plFmt(g,'pcts')],['SME share',plFmt(sme,'pct')],['Spin-outs (3+ yrs)',plFmt(f.s.spin[y],'n')],['Academics',plFmt(f.s.acad[y],'n')]];
  let ctx='';
  if(f.ctx){const c=f.ctx;ctx=`<p style="font-size:13px;margin:10px 0 4px"><b>Local economy:</b> ${c.type||'n/a'}${c.ki!=null?' · knowledge-intensive jobs '+(c.ki*100).toFixed(0)+'%':''}${c.gva?' · GVA per job £'+Math.round(c.gva).toLocaleString('en-GB'):''}${c.jobs?' · '+Math.round(c.jobs).toLocaleString('en-GB')+' jobs':''}${c.comp!=null?' · composite percentile '+Math.round(c.comp):''}.</p>`;}
  else if(f.i2c&&f.i2c.berd!=null) ctx=`<p style="font-size:13px;margin:10px 0 4px"><b>Business R&D per job (ITL2, ONS BERD 2024):</b> £${Math.round(f.i2c.berd).toLocaleString('en-GB')}.</p>`;
  const ttw=new Set(f.provs.map(p=>p.t).filter(Boolean));
  const rows=f.provs.slice().sort((p,q)=>(q.s.bci[y]||0)-(p.s.bci[y]||0)).slice(0,10).map(p=>`<tr><td>${p.n}</td><td>${p.cl&&p.cl.length<34?p.cl:(p.cl?p.cl.slice(0,32)+'…':'–')}</td><td class="n">${plFmt(p.s.bci[y],'gbp')}</td><td class="n">${plFmt(p.s.spin[y],'n')}</td></tr>`).join('');
  box.innerHTML=`<div class="kpis" style="margin-top:6px;grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">${kp.map(k=>`<div class="kpi" style="padding:10px 12px"><div class="v" style="font-size:20px">${k[1]}</div><div class="l">${k[0]}</div></div>`).join('')}</div>${ctx}
    <table class="pl-table"><thead><tr><th>University</th><th>BCI portfolio group</th><th class="n">BCI</th><th class="n">Spin-outs</th></tr></thead><tbody>${rows}</tbody></table>
    ${f.provs.length>10?`<p class="src">Showing the 10 largest of ${f.provs.length} universities.</p>`:''}`;
}

/* ---------- editable PowerPoint (PptxGenJS, NCUB style) ---------- */
function plPptx(areaId){
  if(typeof PptxGenJS==='undefined'){alert('The PowerPoint library could not be loaded (it needs an internet connection). Pre-built decks are in output/place_reports/.');return;}
  const G=plAgg(PS.level,PS.set), y=PS.yi, uk=G.uk, a=areaId&&G.map[areaId]||null;
  const P=new PptxGenJS(); P.layout='LAYOUT_WIDE'; P.title='NCUB place report';
  const PUR='3E1151',MID='60537F',PNK='FF0090',LIGHT='F0EAF4',FONT_='Aptos';
  const lvlTxt=PS.level==='itl1'?'ITL1 region':PS.level==='itl2'?'ITL2 sub-region':'travel-to-work area';
  const title=a?a.name:'UK place overview';
  const SRC='Source: HE-BCI via NCUB master panel (university x year), real 2024/25 prices. Income is recorded at the university\'s main campus. ';
  let pg=1;
  const logo=(s,white)=>{ if(typeof PL_LOGO!=='undefined'&&PL_LOGO) s.addImage({data:white?PL_LOGO_W:PL_LOGO,x:0.4,y:white?0.4:0.35,w:white?2.4:0.56,h:0.6}); };
  /* cover */
  let s=P.addSlide(); s.background={color:PUR}; logo(s,true);
  s.addShape(P.ShapeType.rect,{x:0.5,y:3.3,w:12.3,h:0.0,line:{color:'FEDB00',width:2}});
  s.addShape(P.ShapeType.line,{x:0.5,y:3.3,w:0,h:4.2,line:{color:'FEDB00',width:2}});
  s.addText(title,{x:0.9,y:3.6,w:8.5,h:1.0,fontFace:'Georgia',bold:true,fontSize:34,color:'FFFFFF'});
  s.addText(a?'University–business collaboration in this '+lvlTxt:'Where university–business collaboration happens: ITL1, ITL2 and travel-to-work areas',{x:0.9,y:4.7,w:8,h:0.9,fontFace:FONT_,fontSize:16,color:'AAA5BB'});
  s.addText('Collaboration Progress Monitor · '+PY[y]+' · '+new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'}),{x:0.9,y:6.5,w:8,h:0.4,fontFace:FONT_,fontSize:12,color:'FFFFFF'});
  /* content slide helper, mirrors the NCUB 'chart + stats panel' layout */
  const content=(topic,finding,chartTitle,o)=>{
    const sl=P.addSlide(); sl.background={color:'FFFFFF'}; logo(sl,false); pg++;
    sl.addText(topic,{x:1.34,y:0.3,w:11,h:0.3,fontFace:FONT_,bold:true,fontSize:11,color:PNK,charSpacing:2});
    sl.addText(finding,{x:1.34,y:0.55,w:11.4,h:0.62,fontFace:FONT_,bold:true,fontSize:24,color:PUR,fit:'shrink'});
    sl.addText(chartTitle,{x:1.34,y:1.15,w:11,h:0.4,fontFace:FONT_,fontSize:14,color:MID});
    if(o.panel){
      sl.addShape(P.ShapeType.rect,{x:9.4,y:1.89,w:3.4,h:4.94,fill:{color:PUR},line:{color:PUR}});
      sl.addShape(P.ShapeType.rect,{x:9.67,y:2.23,w:0.47,h:0.05,fill:{color:PNK},line:{color:PNK}});
      sl.addText(o.panel.stat,{x:9.67,y:2.4,w:2.85,h:0.95,fontFace:FONT_,bold:true,fontSize:32,color:'FFFFFF',fit:'shrink',valign:'top'});
      sl.addText(o.panel.def,{x:9.67,y:3.4,w:2.85,h:0.9,fontFace:FONT_,bold:true,fontSize:13,color:'FFFFFF',valign:'top',fit:'shrink'});
      sl.addText(o.panel.text,{x:9.67,y:4.4,w:2.85,h:2.2,fontFace:FONT_,fontSize:12,color:'FFFFFF',valign:'top',fit:'shrink'});
    }
    sl.addText(SRC+(o.src||''),{x:0.55,y:6.99,w:11.2,h:0.25,fontFace:FONT_,fontSize:8,color:MID});
    sl.addText(String(pg).padStart(2,'0'),{x:12.3,y:6.99,w:0.5,h:0.25,fontFace:FONT_,bold:true,fontSize:9,color:PUR,align:'right'});
    return sl;
  };
  const ins=plInsightList(G,y), strip=h=>h.replace(/<[^>]+>/g,'');
  /* 1. findings */
  const tb=G.uk.bci[y];
  const f1=content('Place · '+PY[y],a?title+': key findings':'Where collaboration happens: key findings','Automatically generated from the dashboard selection',{});
  f1.addText(ins.length?ins.slice(0,6).flatMap(i=>[{text:i[0].toUpperCase(),options:{bold:true,color:PNK,fontSize:10,breakLine:true}},{text:strip(i[1]),options:{color:PUR,fontSize:13,breakLine:true,paraSpaceAfter:8}}]):[{text:'No insights available for this selection.',options:{color:PUR,fontSize:13}}],
    {x:0.55,y:1.7,w:12,h:5,fontFace:FONT_,valign:'top'});
  /* 2. ranking */
  const d=PLM[PS.metric], rk=plRanked(G,PS.metric,y).slice(0,15);
  const f2=content('Place · '+lvlTxt+'s',(rk[0]?rk[0].a.name+' leads':'Ranking')+' on '+plLc(d.l),d.l+', '+PY[y],{src:'',
    panel:rk[0]?{stat:plFmt(rk[0].v,d.f),def:rk[0].a.name+' is highest',text:d.t==='sum'?plFmt(uk[d.k][y],d.f)+' UK total across '+G.list.length+' areas.':'Spread across '+G.list.length+' areas.'}:null});
  f2.addChart(P.charts.BAR,[{name:d.l,labels:rk.map(o=>o.a.name),values:rk.map(o=>+(+o.v).toFixed(2))}],
    {x:0.5,y:1.7,w:8.6,h:5.1,barDir:'bar',catAxisOrientation:'maxMin',chartColors:rk.map(o=>(PL_REG_COL[o.a.r]||'60537F').replace('#','')),showValue:true,dataLabelFontSize:9,catAxisLabelFontSize:10,valAxisLabelFontSize:9,valGridLine:{color:'EEEBF1',size:0.5},showLegend:false,barGapWidthPct:40,dataLabelFormatCode:'#,##0.0'});
  /* 3. trend for the area / UK */
  const ids=a?[a.id]:PS.sel.slice(0,4);
  const f3=content('Place · trend',a?title+' over time':'Selected areas over time','Business collaboration income, £m real 2024/25 prices',{src:'',
    panel:{stat:ids.length&&G.map[ids[0]]?plFmt(G.map[ids[0]].s.bci[y],'gbp'):'',def:ids.length&&G.map[ids[0]]?G.map[ids[0]].name+' BCI, '+PY[y]:'',text:ids.length&&G.map[ids[0]]?'5-year CAGR '+plFmt(plVal(G.map[ids[0]],'cagr',y,uk),'pcts')+'. Share of UK '+(G.map[ids[0]].s.bci[y]/tb*100).toFixed(1)+'%.':''}});
  f3.addChart(P.charts.LINE,ids.filter(i=>G.map[i]).map(i=>({name:G.map[i].name,labels:PY,values:PY.map((_,k)=>G.map[i].s.bci[k]!=null?+(G.map[i].s.bci[k]/1000).toFixed(2):null)})),
    {x:0.5,y:1.7,w:8.6,h:5.1,chartColors:ids.map((_,i)=>plSelColour(i).replace('#','')),lineSize:3,lineDataSymbolSize:7,showLegend:true,legendPos:'b',legendFontSize:10,catAxisLabelFontSize:10,valAxisLabelFontSize:10,valGridLine:{color:'EEEBF1',size:0.5}});
  /* 4. mix */
  const rowsM=(a?[a]:PS.sel.slice(0,3).map(i=>G.map[i]).filter(Boolean)).map(x=>({n:x.name,s:x.s})); rowsM.push({n:'UK',s:uk});
  const f4=content('Place · composition','What the collaboration income is for','Mix of BCI by stream, '+PY[y],{src:'',panel:{stat:'4 streams',def:'Contract research, consultancy, facilities & equipment, IP licensing',text:'SMEs supply '+plFmt(plUk('sme_sh',y,G),'pct')+' of UK BCI.'}});
  const part=[['cr','Contract research'],['cons','Consultancy'],['fac','Facilities & equipment'],['ip','IP licensing']];
  f4.addChart(P.charts.BAR,part.map(p=>({name:p[1],labels:rowsM.map(r=>r.n),values:rowsM.map(r=>{const t=(r.s.cr[y]||0)+(r.s.cons[y]||0)+(r.s.fac[y]||0)+(r.s.ip[y]||0);return t?+((r.s[p[0]][y]||0)/t*100).toFixed(1):0;})})),
    {x:0.5,y:1.7,w:8.6,h:5.1,barDir:'bar',barGrouping:'percentStacked',catAxisOrientation:'maxMin',chartColors:['3E1151','FF0090','0085CA','00B388'],showLegend:true,legendPos:'b',legendFontSize:10,catAxisLabelFontSize:10,valAxisLabelFontSize:9});
  /* 5. universities in focus */
  const focus=a||G.map[PS.sel[0]];
  if(focus){
    const f5=content('Place · universities','Universities in '+focus.name,'Largest universities by BCI, '+PY[y],{src:'',panel:{stat:String(focus.n[y]),def:'universities reporting in '+PY[y],text:'Local economy: '+(focus.ctx&&focus.ctx.type?focus.ctx.type:'see profile')+'.'}});
    const hdr=['University','BCI portfolio group','BCI','Spin-outs'].map(t=>({text:t,options:{bold:true,color:'FFFFFF',fill:{color:PUR},fontSize:10}}));
    const body=focus.provs.slice().sort((p,q)=>(q.s.bci[y]||0)-(p.s.bci[y]||0)).slice(0,12).map(p=>[{text:p.n},{text:p.cl||'–'},{text:plFmt(p.s.bci[y],'gbp'),options:{align:'right'}},{text:plFmt(p.s.spin[y],'n'),options:{align:'right'}}]);
    f5.addTable([hdr].concat(body),{x:0.5,y:1.75,w:8.6,colW:[3.6,2.6,1.2,1.2],fontFace:FONT_,fontSize:10,color:PUR,border:{type:'solid',color:'EEEBF1',pt:0.75},rowH:0.32});
  }
  P.writeFile({fileName:'NCUB_place_'+(a?a.name.replace(/[^A-Za-z0-9]+/g,'_'):'UK_overview')+'.pptx'});
}
