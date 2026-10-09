const app = document.getElementById('app');
const status = document.getElementById('status');
const svgNS = 'http://www.w3.org/2000/svg';
const make = (tag, text) => {const el=document.createElement(tag);if(text!=null)el.textContent=text;return el;};
const safeUrl = value => {try {const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const {katex,mermaid,L}=PortableDependencies;
mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'default',flowchart:{htmlLabels:false}});
const widgetCache=new Map();
let mounts=[];
let diagramSerial=0;
function feedback(text){
  document.querySelector('.portable-feedback')?.remove();
  const e=make('div',text);e.className='portable-feedback';e.setAttribute('role','status');document.body.append(e);setTimeout(()=>e.remove(),2600);
}
function dialog(content){
  const d=make('dialog');d.className='portable-dialog';
  const close=make('button','关闭');close.type='button';close.onclick=()=>d.close();
  d.append(close,content);d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();return d;
}
let pendingRender = false;
function update(host) {
  if(pendingRender)return;
  pendingRender=true;
  queueMicrotask(()=>{
    pendingRender=false;
    if(host.errors.length){status.textContent='运行失败：'+host.errors.at(-1);return;}
    const active=document.activeElement;
    const activeId=active?.dataset.nodeId;
    const selection=typeof active?.selectionStart==='number'?[active.selectionStart,active.selectionEnd]:null;
    const scroller=document.scrollingElement;
    const scrollPosition={top:scroller.scrollTop,left:scroller.scrollLeft};
    mounts=[];
    app.replaceChildren(renderNode(host,0));
    for(const mount of mounts)mount();
    scroller.scrollTop=scrollPosition.top;scroller.scrollLeft=scrollPosition.left;
    if(activeId){const next=app.querySelector(`[data-node-id="${activeId}"]`);next?.focus({preventScroll:true});if(selection)next?.setSelectionRange?.(...selection);}
    status.textContent='原程序正在运行 · '+host.nodes.size+' 个界面节点';
  });
}
function widget(host,id){
  const ref=host.bundle.clientDefinedWidgets[id];
  const data=host.bundle.contentReferences[ref?.refIndex]?.data;
  if(!data)return make('div','组件数据不可用');
  if(data.widget_type==='charts_widget_v2')return chart(data.content);
  if(data.language==='mermaid'||data.widget_type==='map_widget_v2'){
    if(!widgetCache.has(id))widgetCache.set(id,data.language==='mermaid'?diagram(data):mapWidget(data));
    const entry=widgetCache.get(id);mounts.push(entry.mount);return entry.element;
  }
  return make('pre',JSON.stringify(data,null,2));
}
function diagram(data){
  const box=make('div'),nav=make('div'),viewport=make('div'),canvas=make('div');
  nav.className='segments';viewport.className='diagram-viewport';canvas.className='diagram-canvas';
  viewport.append(canvas);box.append(nav,viewport);
  let started=false,scale=1,svg;
  const resize=()=>{if(svg){const w=svg.viewBox.baseVal.width||600;svg.style.width=w*scale+'px';svg.style.height='auto';}};
  for(const[label,change]of [['放大流程图',()=>scale=Math.min(3,scale+.25)],['缩小流程图',()=>scale=Math.max(.5,scale-.25)],['重置流程图',()=>scale=1]]){
    const b=make('button',label);b.type='button';b.onclick=()=>{change();resize();};nav.append(b);
  }
  return {element:box,mount:()=>{
    if(started)return;started=true;
    mermaid.render('portable-diagram-'+(++diagramSerial),data.content).then(result=>{
      canvas.innerHTML=result.svg;svg=canvas.querySelector('svg');svg.setAttribute('aria-label','交互式流程图');resize();result.bindFunctions?.(canvas);
    }).catch(error=>{canvas.textContent='流程图加载失败：'+error.message;});
  }};
}
function mapWidget(data){
  const box=make('div'),mapElement=make('div'),places=make('div'),label=make('small');
  box.className='map-panel';mapElement.className='portable-map';mapElement.setAttribute('aria-label',data.title||'交互地图');places.className='map-places';
  box.append(make('strong',data.title||'地图'),mapElement,places,label);
  let map;const markers=[];
  return {element:box,mount:()=>{
    if(map){map.invalidateSize();return;}
    map=L.map(mapElement,{scrollWheelZoom:false,zoomControl:false});
    const zoom=L.control({position:'topleft'});
    zoom.onAdd=()=>{const controls=make('div');controls.style.display='grid';controls.style.gap='4px';
      for(const [label,delta]of [['放大地图',1],['缩小地图',-1]]){const b=make('button',delta>0?'+':'−');b.type='button';b.setAttribute('aria-label',label);b.onclick=()=>map.setZoom(map.getZoom()+delta);controls.append(b);}L.DomEvent.disableClickPropagation(controls);return controls;};zoom.addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
    const bounds=L.latLngBounds([]);
    (data.points||[]).forEach((p,i)=>{
      const pos=[p.latitude,p.longitude];bounds.extend(pos);
      const popup=make('div');popup.append(make('strong',p.name));
      if(p.address)popup.append(make('p',p.address));if(p.description)popup.append(make('p',p.description));
      const close=make('button','关闭地点详情');close.type='button';close.onclick=()=>map.closePopup();popup.append(close);
      const marker=L.marker(pos,{title:p.name,keyboard:true,icon:L.divIcon({className:'map-marker',html:String(i+1),iconSize:[28,28],iconAnchor:[14,14]})}).addTo(map).bindPopup(popup,{closeButton:false});markers.push(marker);
      const b=make('button',`${i+1}. ${p.name}`);b.type='button';b.onclick=()=>{map.setView(pos,Math.max(map.getZoom(),16));marker.openPopup();};places.append(b);
    });
    for(const group of data.groups||[]){
      const route=group.route;if(!route?.geometry)continue;
      const layer=L.geoJSON(route.geometry,{style:{color:'#2563eb',weight:5,opacity:.85}}).addTo(map);bounds.extend(layer.getBounds());
      box.append(make('div',`${group.title||'路线'} · ${(route.distance_meters/1000).toFixed(2)} 公里 · 约 ${Math.round(route.duration_seconds/60)} 分钟`));
      const directions=make('details');directions.append(make('summary','查看步行路线'));
      for(const leg of route.legs||[]){const part=make('div');const from=data.points.find(p=>p.id===leg.from_point_id)?.name||'',to=data.points.find(p=>p.id===leg.to_point_id)?.name||'';part.append(make('strong',`${from} → ${to}`));const list=make('ol');for(const step of leg.instructions||leg.steps||[])list.append(make('li',typeof step==='string'?step:step.instruction||step.maneuver?.instruction||''));part.append(list);directions.append(part);}box.append(directions);
    }
    const reset=make('button','显示完整路线');reset.type='button';reset.onclick=()=>map.fitBounds(bounds,{padding:[35,35]});places.append(reset);
    map.fitBounds(bounds,{padding:[35,35]});
    const state=()=>label.textContent=`缩放级别 ${map.getZoom()} · 拖动地图浏览，点击地点查看详情`;
    map.on('zoomend',state);state();new ResizeObserver(()=>map.invalidateSize()).observe(mapElement);
  }};
}
function chart(c){
  const wrap=make('div');wrap.className='chart';
  const s=document.createElementNS(svgNS,'svg');s.setAttribute('viewBox','0 0 600 260');s.setAttribute('role','img');s.setAttribute('aria-label',c.series?.[0]?.label||'图表');
  const add=(tag,attrs,text)=>{const e=document.createElementNS(svgNS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!=null)e.textContent=text;s.append(e);return e;};
  const colors=['#2563eb','#14b8a6','#f59e0b','#a855f7'];
  const key=c.series?.[0]?.dataKey||c.valueKey;
  const rows=c.data||[];
  if(c.chartType==='pie'){
    let start=-Math.PI/2;const total=rows.reduce((v,d)=>v+d[key],0);
    rows.forEach((d,i)=>{const end=start+d[key]/total*Math.PI*2;const path=`M 180 125 L ${180+95*Math.cos(start)} ${125+95*Math.sin(start)} A 95 95 0 ${end-start>Math.PI?1:0} 1 ${180+95*Math.cos(end)} ${125+95*Math.sin(end)} Z`;const e=add('path',{d:path,fill:colors[i%4]});const title=document.createElementNS(svgNS,'title');title.textContent=`${d[c.nameKey]}: ${d[key]}`;e.append(title);add('text',{x:330,y:60+i*35,fill:colors[i%4]},`${d[c.nameKey]} ${d[key]}%`);start=end;});
  }else{
    const domain=c.axes?.[0]?.domain||[0,Math.max(...rows.map(d=>d[key]))*1.1];
    const x=i=>55+i*490/Math.max(1,rows.length-1), y=v=>215-(v-domain[0])/(domain[1]-domain[0])*185;
    for(const t of c.axes?.[0]?.ticks||[]){add('line',{x1:45,x2:565,y1:y(t.value),y2:y(t.value),stroke:'#e5e7eb'});add('text',{x:40,y:y(t.value)+4,'text-anchor':'end',fill:'#64748b','font-size':12},t.label);}
    if(c.chartType==='line')add('polyline',{points:rows.map((d,i)=>`${x(i)},${y(d[key])}`).join(' '),fill:'none',stroke:colors[0],'stroke-width':3});
    rows.forEach((d,i)=>{const e=c.chartType==='bar'?add('rect',{x:55+i*490/rows.length,y:y(d[key]),width:490/rows.length-15,height:215-y(d[key]),fill:colors[0]}):add('circle',{cx:x(i),cy:y(d[key]),r:5,fill:colors[0]});const title=document.createElementNS(svgNS,'title');title.textContent=`${d[c.xKey]}: ${d[key]}`;e.append(title);add('text',{x:c.chartType==='bar'?75+i*490/rows.length:x(i),y:243,'text-anchor':'middle','font-size':12,fill:'#64748b'},d[c.xKey]);});
  }
  wrap.append(s);return wrap;
}
function renderNode(host,id,context={}){
  const n=host.nodes.get(id),p=n.props||{},t=n.type;
  if(t==='#text')return document.createTextNode(n.text);
  if(t==='__chatgptClientDefinedWidget')return widget(host,p.invocationId);
  const component=host.bundle.appData?.opGenui?.componentResults?.[p.__resolutionId]?.state;
  if(t==='portable-cite'){
    const span=make('span');for(const item of component?.items||[]){const a=make('a',` [${item.source_label}]`);a.href=safeUrl(item.url);a.target='_blank';a.rel='noopener';span.append(a);}return span;
  }
  if(t==='portable-image'){
    const img=make('img');const data=component?.images?.[0];img.src=host.bundle.portableImages?.[p.__resolutionId]||safeUrl(data?.thumbnail_url||data?.content_url);img.alt=p.alt||data?.title||'图片';img.style.width='100%';img.style.aspectRatio=p.aspectRatio||'4/3';img.style.objectFit='cover';img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','预览图片：'+img.alt);const preview=()=>{const full=make('img');full.src=img.src;full.alt=img.alt;dialog(full);};img.onclick=preview;img.onkeydown=e=>{if(e.key==='Enter')preview();};return img;
  }
  if(t==='portable-link'){const a=make('a',component?.title||p.title||p.url);a.href=safeUrl(component?.url||p.url);a.target='_blank';a.rel='noopener';return a;}
  if(t==='segmented-control'){
    const e=make('div');e.className='segments';
    for(const o of p.options||[]){const b=make('button',o.label);b.type='button';b.setAttribute('aria-pressed',String(o.value===p.value));b.onclick=()=>p.onChange(o.value);e.append(b);}return e;
  }
  if(t==='checkbox'||t==='radio'){
    const e=make('label'),input=make('input');input.type=t;input.dataset.nodeId=id;
    input.checked=t==='checkbox'?Boolean(p.checked):context.radio?.value===p.value;
    input.onchange=()=>t==='checkbox'?p.onChange?.(input.checked):context.radio?.onChange(p.value);
    e.append(input,...n.children.map(c=>renderNode(host,c,context)));return e;
  }
  if(t==='slider'||t==='input'||t==='textarea'||t==='date-picker'||t==='select'){
    const e=make(t==='textarea'?'textarea':t==='select'?'select':'input');e.dataset.nodeId=id;
    if(t==='slider')e.type='range';if(t==='date-picker')e.type='date';
    for(const k of ['min','max','step','placeholder','rows'])if(p[k]!=null)e[k]=p[k];
    if(t==='select')for(const o of p.options||[]){const option=make('option',o.label);option.value=o.value;e.append(option);}
    e.value=p.value??'';e.setAttribute('aria-label',p.placeholder||p.label||t);
    e.oninput=()=>p.onChange?.(t==='slider'?Number(e.value):e.value);return e;
  }
  if(t==='icon')return make('span');
  if(t==='math'){const e=make('div');e.className='math-render';e.innerHTML=katex.renderToString(p.value||'',{displayMode:!p.inline,throwOnError:false,trust:false});return e;}
  const tags={root:'div',title:p.size==='xl'?'h1':'h2',text:'div',caption:'small',bold:'strong',italic:'em',underline:'u',strikethrough:'s',code:'code',blockquote:'blockquote',divider:'hr',button:'button',pressable:'button',form:'form',label:'label',table:'table','table-row':'tr','table-cell':p.header?'th':'td','popover':'details','popover-trigger':'summary'};
  const isSvg=context.svg||t==='svg';
  const e=isSvg?document.createElementNS(svgNS,t):make(tags[t]||'div');
  if(isSvg){for(const[k,v]of Object.entries(p))if(typeof v!=='function'&&!k.startsWith('__'))e.setAttribute(k,v);}
  e.dataset.nodeId=id;
  if(t==='radio-group')context={...context,radio:p};
  if(t==='svg')context={...context,svg:true};
  if(t==='button'||t==='pressable'){
    // DIL submission is a callback, not an HTML navigation. Invoke it directly in sandboxed embeds.
    e.type='button';e.disabled=Boolean(p.disabled);
    if(p.submit||p.type==='submit')e.onclick=event=>{event.preventDefault();p.onClick?.();context.form?.onSubmit?.();};
    else if(p.onClick)e.onclick=()=>p.onClick();
  }
  if(t==='form'){
    context={...context,form:p};
    e.onsubmit=event=>{event.preventDefault();p.onSubmit?.();};
    e.onkeydown=event=>{if(event.key==='Enter'&&event.target.tagName==='INPUT'&&!['range','checkbox','radio'].includes(event.target.type)){event.preventDefault();p.onSubmit?.();}};
  }
  if(t==='grid'){e.style.display='grid';e.style.gridTemplateColumns=p.columns?`repeat(${p.columns},minmax(0,1fr))`:`repeat(auto-fit,minmax(min(100%,${p.minChildWidth||240}px),1fr))`;}
  if(t==='row'){e.style.display='flex';e.style.flexWrap='wrap';}
  if(t==='box'||t==='form'){e.style.display='flex';e.style.flexDirection='column';}
  if(t==='carousel'){
    const nav=make('div'),track=make('div');nav.className='segments';track.className='carousel-track';
    const index=p.activeIndex||0;
    for(const [label,offset]of [['上一张',-1],['下一张',1]]){const b=make('button',label);b.type='button';b.onclick=()=>p.onChange((index+offset+n.children.length)%n.children.length);nav.append(b);}
    const position=make('span',`${index+1} / ${n.children.length}`);position.className='carousel-position';position.setAttribute('aria-live','polite');nav.append(position);
    for(let i=0;i<n.children.length;i++)track.append(renderNode(host,n.children[(index+i)%n.children.length],context));
    e.append(nav,track);return e;
  }
  const sizes={xs:'0.75rem',sm:'0.88rem',md:'1rem',lg:'1.2rem',xl:'1.5rem','2xl':'2rem'};
  if(p.size)e.style.fontSize=sizes[p.size]||'';
  if(p.gap!=null)e.style.gap=p.gap*4+'px';
  if(p.padding!=null)e.style.padding=p.padding*4+'px';
  if(p.border)e.style.border='1px solid #dbe1e8';
  if(p.radius)e.style.borderRadius={sm:4,md:8,lg:12,xl:16}[p.radius]+'px';
  if(p.background)e.style.background='#f3f5f8';
  if(p.color==='secondary')e.style.color='#64748b';
  if(p.weight==='medium')e.style.fontWeight='600';
  for(const k of ['width','maxWidth','height','aspectRatio','textAlign'])if(p[k]!=null)e.style[k]=p[k];
  if(p.align)e.style.alignItems=p.align;
  if(p.justify)e.style.justifyContent={between:'space-between',center:'center'}[p.justify]||p.justify;
  if(t==='title'||t==='text')e.style.margin='0';
  e.append(...n.children.map(c=>renderNode(host,c,context)));
  return e;
}
window.addEventListener('error',e=>{status.textContent='运行失败：'+e.message;});
const host=new PortableHost(BUNDLE,update,{
  copy: text=>navigator.clipboard.writeText(text).then(()=>feedback('已复制')).catch(()=>{const area=make('textarea');area.value=text;area.rows=5;dialog(area);area.select();}),
  issueNewTurn: prompt=>{const box=make('div');box.append(make('p','此按钮需要 ChatGPT 生成下一条回答。请在原对话中发送以下指令：'));const area=make('textarea');area.value=prompt;area.rows=5;const a=make('a','打开原 ChatGPT 对话');a.href=safeUrl(BUNDLE.conversationUrl);a.target='_blank';a.rel='noopener';box.append(area,a);dialog(box);},
});
update(host);
