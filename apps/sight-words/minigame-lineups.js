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
    const presetsLabel=node('label','lineup-saved-label','Saved lineup');
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
    const manage=node('details','lineup-manage');manage.append(node('summary','','Save or manage lineups'),name,actions);
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
    toolbar.append(undo,shuffle,clear);
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
      const current=node('option','','Current lineup (unsaved)');current.value='';select.append(current);
      presets.forEach(p=> {const o=node('option','',p.name);o.value=p.id;select.append(o);});select.value=selectedId;
      const selected=presets.find(p=>p.id===selectedId);
      if(selected) name.value=selected.name;
      else if(document.activeElement!==name) name.value='';
      save.textContent=selected?'Rename / save':'Save lineup';remove.hidden=!selected;
      lineupTab.textContent=`My lineup (${hooks.getOrder().length})`;libraryTab.textContent=`Browse games (${library.length})`;
      lineupTab.setAttribute('aria-selected',String(tab==='lineup'));libraryTab.setAttribute('aria-selected',String(tab==='library'));
      lineupTab.tabIndex=tab==='lineup'?0:-1;libraryTab.tabIndex=tab==='library'?0:-1;
      filters.hidden=tab!=='library';shuffle.hidden=clear.hidden=tab!=='lineup';
      if(tab==='library') filters.append(undo);
      else toolbar.prepend(undo);
      toolbar.hidden=tab==='library';
      shuffle.disabled=hooks.getOrder().length<2;clear.disabled=!hooks.getOrder().length;undo.disabled=!history.length;
      content.setAttribute('aria-labelledby',tab==='lineup'?lineupTab.id:libraryTab.id);
      renderContent();content.scrollTop=position;
    }
    function renderContent() {
      content.replaceChildren();
      content.append(manage);
      const order=hooks.getOrder();
      if(tab==='library') {
        const quick=node('div','lineup-starters');quick.append(node('p','','Quick starters — replace your lineup with a ready-made mix:'));
        const starters=[
          ['Animal adventures',['penguinSlide','duckPond','beeBouquet','frogHop','catRescue']],
          ['Think & create',['monsterMatch','musicMaker','treasureTrail','gardenGrow','robotBuilder','shapeSorter']],
          ['Space & treasure',['rocketLaunch','meteorShield','pirateTreasure','treasureTrail','dinoDig']],
        ];
        starters.forEach(([label,list])=>quick.append(button(label,()=> {change(list,`${label} lineup ready. Undo restores your previous mix.`);tab='lineup';render();})));
        const quickSection=node('details','lineup-manage lineup-quick');
        quickSection.append(node('summary','','Quick-start lineups'),quick);
        content.append(quickSection);
        const visible=library.filter(g=> (category==='all'||category==='new'&&g.isNew||(g.category||'Action')===category) && `${g.label} ${g.description||''}`.toLowerCase().includes(query));
        if(!visible.length) content.append(node('p','lineup-empty','No games match. Try another search or filter.'));
        visible.forEach(g=> {
          const card=node('article','lineup-library-card');card.dataset.gameId=g.id;
          const text=node('div','lineup-library-text');
          text.append(node('h4','',`${g.emoji||'🎮'} ${g.label}${g.isNew?' · NEW':''}`),node('p','',g.description||'A quick action break. Try it to see how it plays!'));
          const count=order.filter(id=>id===g.id).length;
          const actions=node('div','lineup-card-actions');
          actions.append(button(count?`Add again (${count})`:'＋ Add',()=>change([...hooks.getOrder(),g.id],`Added ${g.label}.`)),button('Try it',()=>hooks.preview(g),'lineup-button lineup-try'));
          card.append(text,actions);content.append(card);
        });
      } else {
        content.append(node('p','lineup-help','Drag the grip, use arrows, or pick a position. Games play in this order and repeat.'));
        if(!order.length) {
          const empty=node('div','lineup-empty');empty.append(node('p','','Your lineup is empty.'),button('＋ Browse games',()=> {tab='library';render();}));content.append(empty);
        }
        order.forEach((id,index)=> {
          const g=library.find(game=>game.id===id);
          const card=node('article','lineup-order-card');card.dataset.index=index;
          const header=node('div','lineup-order-header');
          const handle=button('⠿',()=>{},'lineup-drag-handle');handle.setAttribute('aria-label',`Move ${g.label}, position ${index+1}. Use arrow keys or drag.`);
          handle.addEventListener('pointerdown',e=> {
            if(e.button!==0) return;
            e.preventDefault();handle.setPointerCapture(e.pointerId);
            drag={from:index,to:index,pointer:e.pointerId,handle};card.classList.add('is-moving');announce(`Moving ${g.label}. Drag to a new position.`);
          });
          handle.addEventListener('keydown',e=> {if(e.key==='ArrowUp'||e.key==='ArrowDown') {e.preventDefault();move(index,index+(e.key==='ArrowUp'?-1:1));}});
          header.append(handle,node('span','lineup-position',`${index+1}`),node('h4','',`${g.emoji||'🎮'} ${g.label}`));
          const actions=node('div','lineup-card-actions');
          const up=button('↑ Up',()=>move(index,index-1));up.disabled=index===0;
          const down=button('↓ Down',()=>move(index,index+1));down.disabled=index===order.length-1;
          const position=node('select','lineup-position-select');position.setAttribute('aria-label',`Position of ${g.label}, copy ${index+1}`);
          order.forEach((_,i)=> {const o=node('option','',`Move to #${i+1}`);o.value=i;position.append(o);});position.value=index;
          position.addEventListener('change',()=>move(index,Number(position.value)));
          actions.append(up,down,position,button('＋ Copy',()=> {const next=[...hooks.getOrder()];next.splice(index+1,0,id);change(next,`Added another ${g.label}.`,true,index+1);}),button('Remove',()=>change(hooks.getOrder().filter((_,i)=>i!==index),`Removed ${g.label}.`,true,Math.min(index,order.length-2))));
          card.append(header,actions);content.append(card);
        });
      }
    }
    listen(document,'pointermove',e=> {
      if(!drag || e.pointerId!==drag.pointer) return;
      const rect=content.getBoundingClientRect();
      if(e.clientY<rect.top+40) content.scrollTop-=18;
      if(e.clientY>rect.bottom-40) content.scrollTop+=18;
      const cards=[...content.querySelectorAll('.lineup-order-card')];
      const nearest=cards.reduce((best,card)=> {
        const r=card.getBoundingClientRect(),distance=Math.abs(e.clientY-(r.top+r.height/2));
        return !best||distance<best.distance?{card,distance}:best;
      },null);
      if(nearest) {drag.to=Number(nearest.card.dataset.index);cards.forEach(card=>card.classList.toggle('is-drop-target',card===nearest.card));}
    });
    function endDrag(e,cancel=false) {
      if(!drag || e.pointerId!==drag.pointer) return;
      const {from,to,handle,pointer}=drag;drag=null;
      if(handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer);
      content.querySelectorAll('.is-moving,.is-drop-target').forEach(c=>c.classList.remove('is-moving','is-drop-target'));
      if(!cancel) move(from,to);
    }
    listen(document,'pointerup',e=>endDrag(e));listen(document,'pointercancel',e=>endDrag(e,true));
    render();
    return {
      render,
      addAll() { change(library.map(g=>g.id),'All 32 games added. Undo restores your previous lineup.'); },
      syncInterval() { const selected=presets.find(p=>p.id===selectedId);if(selected){selected.interval=hooks.getInterval();savePresets();} },
      cancelDrag() {if(drag) endDrag({pointerId:drag.pointer},true);},
      destroy() {this.cancelDrag();disposers.forEach(remove=>remove());},
    };
  };
})();
