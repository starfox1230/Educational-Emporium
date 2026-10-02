/* Saved lineups and a pointer/keyboard editor; existing quiz settings remain compatible. */
(() => {
  'use strict';
  const PRESETS_KEY = 'sightWordsMiniGameLineups';
  const ACTIVE_KEY = 'sightWordsActiveMiniGameLineup';
  const node = (tag, className, text) => {
    const e = document.createElement(tag);
    if(className) e.className = className;
    if(text !== undefined) e.textContent = text;
    return e;
  };

  window.createSightWordsLineupEditor = function(hooks) {
    const {library,host} = hooks;
    const ids = new Set(library.map(g => g.id));
    const sanitize = order => Array.isArray(order) ? order.filter(id => ids.has(id)) : [];
    let presets = [];
    try {
      const saved = JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]');
      if(Array.isArray(saved)) presets = saved.filter(p => p && typeof p.id==='string' && typeof p.name==='string' && Array.isArray(p.order))
        .map(p => ({id:p.id,name:p.name,order:sanitize(p.order),interval:Number.isInteger(p.interval)&&p.interval>0?p.interval:5}));
    } catch { /* Keep the current lineup usable if saved presets are malformed. */ }
    let selectedId = localStorage.getItem(ACTIVE_KEY) || '';
    if(!presets.some(p=>p.id===selectedId)) selectedId='';
    let tab='lineup', query='', category='all';
    const history=[];
    let drag=null;
    let dropAnimation=null;
    const disposers=[];
    function listen(e,type,fn) { e.addEventListener(type,fn); disposers.push(()=>e.removeEventListener(type,fn)); }
    function button(label,fn,className='lineup-button') {
      const b=node('button',className,label); b.type='button'; b.addEventListener('click',fn); return b;
    }
    function savePresets() {
      localStorage.setItem(PRESETS_KEY,JSON.stringify(presets));
      localStorage.setItem(ACTIVE_KEY,selectedId);
    }
    function remember() {
      history.push({order:[...hooks.getOrder()],interval:hooks.getInterval(),selectedId,presets:JSON.parse(JSON.stringify(presets))});
      if(history.length>30) history.shift();
    }
    function change(order,message,record=true,focusIndex=null) {
      if(record) remember();
      hooks.setOrder(sanitize(order));
      const selected=presets.find(p=>p.id===selectedId);
      if(selected) { selected.order=[...hooks.getOrder()]; selected.interval=hooks.getInterval(); }
      savePresets(); render(); announce(message);
      if(focusIndex !== null) {
        const card=content.querySelector(`[data-index="${focusIndex}"]`);
        card?.querySelector('.lineup-drag-handle')?.focus({preventScroll:true});
        card?.scrollIntoView({block:'nearest'});
      }
    }
    function announce(message) { status.textContent=message; }

    const tools=node('div','lineup-tools');
    const presetsLabel=node('label','lineup-saved-label');
    const select=node('select','lineup-saved-select'); select.setAttribute('aria-label','Saved lineup');
    presetsLabel.append(select);
    const name=node('input','lineup-name'); name.type='text';name.maxLength=60;name.placeholder='Name your lineup';name.setAttribute('aria-label','Lineup name');
    const save=button('Save lineup',()=> {
      const title=name.value.trim();
      if(!title) { announce('Give your lineup a name first.'); name.focus(); return; }
      remember();
      const selected=presets.find(p=>p.id===selectedId);
      if(selected) { selected.name=title; selected.order=[...hooks.getOrder()]; selected.interval=hooks.getInterval(); }
      else {
        const preset={id:`lineup-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,name:title,order:[...hooks.getOrder()],interval:hooks.getInterval()};
        presets.push(preset);selectedId=preset.id;
      }
      savePresets(); render(); announce(`Saved ${title}. Changes to this lineup now save automatically.`);
    });
    const copy=button('Save a copy',()=> {
      const title=name.value.trim();
      if(!title) { announce('Give the copy a name first.');name.focus();return; }
      remember();selectedId='';
      const preset={id:`lineup-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,name:title,order:[...hooks.getOrder()],interval:hooks.getInterval()};
      presets.push(preset);selectedId=preset.id;savePresets();render();announce(`Saved a separate copy: ${title}.`);
    });
    const fresh=button('New lineup',()=> { remember();selectedId='';name.value='';change([],'Start fresh! Add your favorites below.',false);tab='library';render();search.focus(); });
    fresh.title='Start a new empty lineup';
    const remove=button('Delete saved lineup',()=> {
      if(!selectedId) return;
      remember();presets=presets.filter(p=>p.id!==selectedId);selectedId='';
      savePresets();render();announce('Saved lineup deleted. Your current games are still here; Undo restores the saved lineup.');
    });
    const actions=node('div','lineup-save-actions');actions.append(save,copy,remove);
    const manage=node('details','lineup-manage');manage.append(node('summary','','Saved setups & settings'),name,actions);
    manage.id='lineup-save-menu';
    tools.append(presetsLabel,fresh);
    const tabs=node('div','lineup-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Lineup editor');
    const lineupTab=button('My lineup',()=> {tab='lineup';render();},'lineup-tab');
    const libraryTab=button('Browse games',()=> {tab='library';render();},'lineup-tab');
    for(const [b,id] of [[lineupTab,'lineup'],[libraryTab,'library']]) {
      b.id=`lineup-tab-${id}`;b.setAttribute('role','tab');b.setAttribute('aria-controls','lineup-panel');
      b.addEventListener('keydown',e=> { if(e.key==='ArrowLeft'||e.key==='ArrowRight') {e.preventDefault();tab=id==='lineup'?'library':'lineup';render();(tab==='lineup'?lineupTab:libraryTab).focus();} });
    }
    tabs.append(lineupTab,libraryTab);
    const filters=node('div','lineup-filters');
    const search=node('input','lineup-search');search.type='search';search.placeholder='Search';search.setAttribute('aria-label','Search mini-games');
    const categories=node('select','lineup-category');categories.setAttribute('aria-label','Filter games');
    for(const [value,label] of [['all','All games'],['new','20 new games'],...Array.from(new Set(library.map(g=>g.category||'Action'))).sort().map(c=>[c,c])]) {
      const o=node('option','',label);o.value=value;categories.append(o);
    }
    filters.append(search,categories);
    const toolbar=node('div','lineup-toolbar');
    const undo=button('↶ Undo',()=> {
      const snapshot=history.pop();if(!snapshot) return;
      presets=snapshot.presets;selectedId=snapshot.selectedId;
      hooks.setInterval(snapshot.interval);hooks.setOrder(snapshot.order);savePresets();render();announce('Last change undone.');
    });
    const shuffle=button('Shuffle order',()=> {
      const order=[...hooks.getOrder()];
      for(let i=order.length-1;i>0;i--) {const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
      change(order,'Lineup shuffled.');
    });
    const clear=button('Clear lineup',()=>change([],'Lineup cleared. Undo brings it back.'));
    toolbar.append(node('span','lineup-help','Drag the grip to reorder'),undo);
    actions.append(shuffle,clear);
    if(hooks.intervalControl) manage.append(hooks.intervalControl);
    if(hooks.allGamesButton) actions.append(hooks.allGamesButton);
    const status=node('p','lineup-status','Changes save automatically on this device.');status.setAttribute('role','status');
    const content=node('div','lineup-content');content.id='lineup-panel';content.setAttribute('role','tabpanel');
    host.replaceChildren(tools,tabs,filters,toolbar,status,content);

    select.addEventListener('change',()=> {
      remember();selectedId=select.value;
      const preset=presets.find(p=>p.id===selectedId);
      if(preset) { hooks.setInterval(preset.interval);hooks.setOrder([...preset.order]); }
      savePresets();render();announce(preset?`Loaded ${preset.name}.`:'Editing your current lineup.');
    });
    search.addEventListener('input',()=> {query=search.value.toLowerCase().trim();renderContent();});
    categories.addEventListener('change',()=> {category=categories.value;renderContent();});
    function move(from,to) {
      const order=[...hooks.getOrder()];
      if(from<0 || from>=order.length || to<0 || to>=order.length || from===to) return;
      const [entry]=order.splice(from,1);order.splice(to,0,entry);
      change(order,`Moved ${library.find(g=>g.id===entry).label} to position ${to+1}.`,true,to);
    }
    function render() {
      const position=content.scrollTop;
      select.replaceChildren();
      const current=node('option','','Current lineup');current.value='';select.append(current);
      presets.forEach(p=> {const o=node('option','',p.name);o.value=p.id;select.append(o);});select.value=selectedId;
      const selected=presets.find(p=>p.id===selectedId);
      if(selected) name.value=selected.name;
      else if(document.activeElement!==name) name.value='';
      save.textContent=selected?'Rename / save':'Save lineup';remove.hidden=!selected;
      lineupTab.textContent=`My lineup (${hooks.getOrder().length})`;libraryTab.textContent=`Browse games (${library.length})`;
      lineupTab.setAttribute('aria-selected',String(tab==='lineup'));libraryTab.setAttribute('aria-selected',String(tab==='library'));
      lineupTab.tabIndex=tab==='lineup'?0:-1;libraryTab.tabIndex=tab==='library'?0:-1;
      filters.hidden=tab!=='library';
      toolbar.firstElementChild.textContent=tab==='lineup'?'Drag the grip to reorder':'Tap + to add a game';
      shuffle.disabled=hooks.getOrder().length<2;clear.disabled=!hooks.getOrder().length;undo.disabled=!history.length;
      content.setAttribute('aria-labelledby',tab==='lineup'?lineupTab.id:libraryTab.id);
      renderContent();content.scrollTop=position;
    }
    function renderContent() {
      content.replaceChildren();
      content.append(manage);
      const order=hooks.getOrder();
      if(tab==='library') {
        const visible=library.filter(g=> (category==='all'||category==='new'&&g.isNew||(g.category||'Action')===category) && `${g.label} ${g.description||''}`.toLowerCase().includes(query));
        if(!visible.length) content.append(node('p','lineup-empty','No games match. Try another search or filter.'));
        visible.forEach(g=> {
          const card=node('article','lineup-library-card');card.dataset.gameId=g.id;
          const text=node('div','lineup-library-text');
          text.append(node('h4','',`${g.emoji||'🎮'} ${g.label}`));
          card.title=g.description||g.label;
          const count=order.filter(id=>id===g.id).length;
          if(count) text.append(node('span','lineup-count',`×${count}`));
          const actions=node('div','lineup-card-actions');
          const preview=button('▷',()=>hooks.preview(g),'lineup-button lineup-try');
          preview.setAttribute('aria-label',`Try ${g.label}`);
          const add=button('+',()=>change([...hooks.getOrder(),g.id],`Added ${g.label}.`));
          add.setAttribute('aria-label',`Add ${g.label}`);
          actions.append(preview,add);
          card.append(text,actions);content.append(card);
        });
      } else {
        if(!order.length) {
          const empty=node('div','lineup-empty');empty.append(node('p','','Your lineup is empty.'),button('＋ Browse games',()=> {tab='library';render();}));content.append(empty);
        }
        const list=node('div','lineup-sort-list');
        list.setAttribute('role','list');list.setAttribute('aria-label','Game order');
        content.append(list);
        order.forEach((id,index)=> {
          const g=library.find(game=>game.id===id);
          const row=node('article','lineup-order-card');row.dataset.index=index;
          row.setAttribute('role','listitem');
          const handle=button('',()=>{},'lineup-drag-handle');
          handle.setAttribute('aria-label',`Move ${g.label}, position ${index+1}. Drag or use arrow keys.`);
          handle.append(node('span','lineup-grip','⠿'));
          handle.addEventListener('pointerdown',e=>beginDrag(e,row,handle,index,list));
          handle.addEventListener('lostpointercapture',e=>endDrag(e,true));
          handle.addEventListener('keydown',e=> {
            if(e.key==='ArrowUp'||e.key==='ArrowDown') {e.preventDefault();move(index,index+(e.key==='ArrowUp'?-1:1));}
          });
          const remove=button('×',()=>change(hooks.getOrder().filter((_,i)=>i!==index),`Removed ${g.label}.`),'lineup-row-remove');
          remove.setAttribute('aria-label',`Remove ${g.label}, position ${index+1}`);
          row.append(handle,node('span','lineup-position',`${index+1}`),node('span','lineup-game-name',`${g.emoji||'🎮'} ${g.label}`),remove);list.append(row);
        });
      }
    }

    function clearDropAnimation() {
      if(!dropAnimation) return;
      dropAnimation.animation.cancel();
      dropAnimation.ghost.remove();
      dropAnimation=null;
    }
    function beginDrag(event,row,handle,index,list) {
      if(event.button!==0 || drag) return;
      event.preventDefault();
      clearDropAnimation();
      const rect=row.getBoundingClientRect();
      const ghost=row.cloneNode(true);
      ghost.classList.add('lineup-drag-ghost');
      ghost.setAttribute('aria-hidden','true');
      ghost.style.width=`${rect.width}px`;
      ghost.style.left=`${rect.left}px`;
      ghost.style.top=`${rect.top}px`;
      ghost.querySelectorAll('button').forEach(b=>b.tabIndex=-1);
      const slot=node('div','lineup-drop-slot');
      slot.style.height=`${rect.height}px`;
      slot.setAttribute('aria-hidden','true');
      row.before(slot);
      document.body.append(ghost);
      handle.setPointerCapture(event.pointerId);
      row.hidden=true;
      drag={from:index,to:index,pointer:event.pointerId,handle,row,list,ghost,slot,
        x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,rect,frame:0,lastTime:0};
      host.classList.add('is-sorting');
      announce(`Moving ${library.find(g=>g.id===hooks.getOrder()[index]).label}.`);
      drag.frame=requestAnimationFrame(dragFrame);
    }
    function updateSlot() {
      if(!drag) return;
      const {list,slot,row}=drag;
      const rows=[...list.querySelectorAll('.lineup-order-card')].filter(r=>r!==row);
      const contentRect=content.getBoundingClientRect();
      const pointerY=Math.max(contentRect.top,Math.min(contentRect.bottom,drag.y));
      // Use layout positions so an in-flight animation does not change the drop target.
      const to=rows.filter(r=>contentRect.top+r.offsetTop+r.offsetHeight/2-content.scrollTop<pointerY).length;
      drag.to=to;
      const next=rows[to]||null;
      if(slot.nextElementSibling===next) return;
      const before=new Map(rows.map(r=>[r,r.getBoundingClientRect().top]));
      rows.forEach(r=>r.getAnimations().forEach(a=>a.cancel()));
      list.insertBefore(slot,next);
      if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        rows.forEach(r=> {
          const delta=before.get(r)-r.getBoundingClientRect().top;
          if(delta) r.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:160,easing:'cubic-bezier(.2,.8,.2,1)'});
        });
      }
    }
    function dragFrame(time) {
      if(!drag) return;
      const dt=drag.lastTime?Math.min(40,time-drag.lastTime):16;
      drag.lastTime=time;
      const rect=content.getBoundingClientRect();
      const edge=Math.min(64,rect.height/3);
      const top=Math.max(0,Math.min(1,(rect.top+edge-drag.y)/edge));
      const bottom=Math.max(0,Math.min(1,(drag.y-(rect.bottom-edge))/edge));
      content.scrollTop+=(bottom-top)*650*dt/1000;
      drag.ghost.style.transform=`translate3d(${Math.max(-24,Math.min(24,drag.x-drag.startX))}px,${drag.y-drag.startY}px,0)`;
      updateSlot();
      drag.frame=requestAnimationFrame(dragFrame);
    }
    listen(document,'pointermove',e=> {
      if(!drag || e.pointerId!==drag.pointer) return;
      e.preventDefault();drag.x=e.clientX;drag.y=e.clientY;
    });
    function endDrag(event,cancel=false) {
      if(!drag || event.pointerId!==drag.pointer) return;
      // Include the final finger position even if pointerup preceded the next frame.
      if(!cancel && Number.isFinite(event.clientY)) {drag.x=event.clientX;drag.y=event.clientY;updateSlot();}
      const current=drag;
      drag=null;
      cancelAnimationFrame(current.frame);
      const ghostRect=current.ghost.getBoundingClientRect();
      current.row.hidden=false;current.slot.remove();host.classList.remove('is-sorting');
      if(current.handle.hasPointerCapture(current.pointer)) current.handle.releasePointerCapture(current.pointer);
      if(cancel || current.from===current.to) {
        current.ghost.remove();render();
        if(cancel) announce('Move cancelled.');
        return;
      }
      move(current.from,current.to);
      const target=content.querySelector(`[data-index="${current.to}"]`);
      const rect=target.getBoundingClientRect();
      // Settle the lifted row into the visible gap after committing the order.
      current.ghost.style.transform='';current.ghost.style.left=`${ghostRect.left}px`;current.ghost.style.top=`${ghostRect.top}px`;
      const animation=current.ghost.animate([
        {transform:'translate(0,0)',opacity:1},
        {transform:`translate(${rect.left-ghostRect.left}px,${rect.top-ghostRect.top}px)`,opacity:0}
      ],{duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:140,easing:'ease-out'});
      const pending={ghost:current.ghost,animation};dropAnimation=pending;
      animation.finished.then(()=> {pending.ghost.remove();if(dropAnimation===pending)dropAnimation=null;}).catch(()=>{});
    }
    listen(document,'pointerup',e=>endDrag(e));
    listen(document,'pointercancel',e=>endDrag(e,true));
    listen(window,'blur',()=> {if(drag)endDrag({pointerId:drag.pointer},true);clearDropAnimation();});
    listen(document,'visibilitychange',()=> {if(document.hidden&&drag)endDrag({pointerId:drag.pointer},true);});
    render();
    return {
      render,
      open() {tab='lineup';manage.open=false;render();content.scrollTop=0;},
      addAll() { change(library.map(g=>g.id),'All 32 games added. Undo restores your previous lineup.'); },
      syncInterval() { const selected=presets.find(p=>p.id===selectedId);if(selected){selected.interval=hooks.getInterval();savePresets();} },
      cancelDrag() {if(drag) endDrag({pointerId:drag.pointer},true);clearDropAnimation();},
      destroy() {this.cancelDrag();disposers.forEach(remove=>remove());},
    };
  };
})();
