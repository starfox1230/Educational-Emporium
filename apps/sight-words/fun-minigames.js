/* Short, touch-friendly rewards. Every session owns and cancels its timers/listeners. */
(() => {
  'use strict';
  const pick = items => items[Math.floor(Math.random() * items.length)];
  const shuffle = items => {
    const result = [...items];
    for (let i=result.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]]; }
    return result;
  };
  const colors = ['#ef476f', '#ffd166', '#06d6a0', '#4dabf7', '#b197fc'];
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  class Session {
    constructor(game, container, complete, config) {
      this.game = game;
      this.container = container;
      this.complete = complete;
      this.config = config;
      this.active = true;
      this.timers = new Set();
      this.listeners = [];
      this.score = 0;
      container.replaceChildren();
      this.root = el('section', 'fun-game');
      this.root.dataset.gameId = config.id;
      this.root.style.setProperty('--game-accent', config.color || '#06d6a0');
      const header = el('header', 'fun-game-header');
      header.append(el('h2', '', `${config.emoji} ${config.label}`));
      this.scoreEl = el('span', 'fun-score', '0 points');
      header.append(this.scoreEl, this.button('Done', () => this.finish(), 'fun-done'));
      this.progress = el('progress', 'fun-progress');
      this.progress.max = game.duration;
      this.progress.value = game.duration;
      this.progress.setAttribute('aria-label', 'Time remaining');
      this.prompt = el('p', 'fun-prompt', config.description);
      this.status = el('p', 'fun-status', 'Ready, set, play!');
      this.status.setAttribute('aria-live', 'polite');
      this.arena = el('div', 'fun-arena');
      this.root.append(header, this.progress, this.prompt, this.status, this.arena);
      container.append(this.root);
      if (typeof window.speak === 'function') window.speak(config.description);
      this.started = performance.now();
      this.every(100, () => {
        this.progress.value = Math.max(0, game.duration - (performance.now() - this.started));
        if (!this.progress.value) this.finish();
      });
      this.later(game.duration, () => this.finish());
    }
    on(node, event, fn) {
      const guarded = e => { if (this.active) fn(e); };
      node.addEventListener(event, guarded);
      this.listeners.push(() => node.removeEventListener(event, guarded));
    }
    button(text, fn, cls = 'fun-tile') {
      const b = el('button', cls, text);
      b.type = 'button';
      this.on(b, 'click', fn);
      return b;
    }
    later(ms, fn) {
      const id = setTimeout(() => {
        this.timers.delete(id);
        if (this.active) fn();
      }, ms);
      this.timers.add(id);
      return id;
    }
    every(ms, fn) {
      const id = setInterval(() => { if (this.active) fn(); }, ms);
      this.timers.add(id);
      return id;
    }
    award(points = 1, message = 'Nice work! ✨') {
      this.score += points;
      this.game.score = this.score;
      this.scoreEl.textContent = `${this.score} points`;
      this.status.textContent = message;
      if (typeof window.playBell === 'function') window.playBell();
    }
    hint(message = 'Try again — you can do it!') { this.status.textContent = message; }
    stop() {
      this.active = false;
      this.timers.forEach(id => { clearTimeout(id); clearInterval(id); });
      this.timers.clear();
      this.listeners.splice(0).forEach(remove => remove());
    }
    finish() {
      if (!this.active) return;
      const callback = this.complete;
      this.complete = null;
      this.stop();
      if (callback) callback(this.score);
    }
    grid(columns = 3) {
      this.arena.replaceChildren();
      const grid = el('div', 'fun-grid');
      grid.style.setProperty('--columns', columns);
      this.arena.append(grid);
      return grid;
    }
  }

  // Matching a changing order: color, ingredient, shape, topping, or animal.
  function targetGame(s, c) {
    const grid = s.grid(c.items.length > 4 ? 3 : 2);
    const buttons = c.items.map(item => {
      const b = s.button(item, () => {
        if (item === target) {
          s.award(1, c.cheer || 'Perfect match! 🌟');
          next();
        } else s.hint(`Look for ${target}!`);
      });
      grid.append(b);
      return b;
    });
    let target;
    function next() {
      target = pick(c.items.filter(item => item !== target));
      s.status.textContent = `${c.request || 'Find'} ${target}`;
      buttons.forEach((b, i) => b.style.backgroundColor = c.paint ? colors[i] : '');
    }
    next();
  }

  function recipeGame(s, c) {
    const order = el('div', 'fun-recipe');
    const plate = el('div', 'fun-plate', c.emoji);
    const grid = s.grid(2);
    s.arena.prepend(order, plate);
    let recipe = [], step = 0;
    function nextOrder() {
      recipe = Array.from({length: 3}, () => pick(c.items)); step = 0;
      plate.textContent = c.emoji;
      order.textContent = recipe.join(' → ');
      s.status.textContent = `${c.request} ${recipe[step]}`;
    }
    c.items.forEach(item => grid.append(s.button(item, () => {
      if (item !== recipe[step]) return s.hint(`Next ingredient: ${recipe[step]}`);
      plate.textContent += ` ${item.split(' ')[0]}`;
      s.award(1, 'Yummy!');
      if (++step === recipe.length) { s.award(3, c.cheer); nextOrder(); }
      else s.status.textContent = `${c.request} ${recipe[step]}`;
    })));
    nextOrder();
  }

  function digGame(s) {
    let remaining = 0;
    function round() {
      const grid = s.grid();
      remaining = 3;
      const bones = shuffle([true, true, true, false, false, false, false, false, false]);
      s.status.textContent = 'Find the 3 hidden dinosaur bones!';
      bones.forEach(bone => {
        let taps = 0;
        const b = s.button('🪨', () => {
          if (!remaining) return;
          taps++;
          b.textContent = taps === 1 ? '⛏️' : bone ? '🦴' : '🌱';
          if (taps < 2) return;
          b.disabled = true;
          if (bone) { s.award(1, `Bone found! ${--remaining} to go.`); }
          if (!remaining) { s.award(3, 'A whole dinosaur! 🦕'); s.later(500, round); }
        });
        grid.append(b);
      });
    }
    round();
  }

  function rocketGame(s) {
    let fuel = 0;
    const sky = el('div', 'fun-sky');
    const rocket = el('div', 'fun-rocket', '🚀');
    const meter = el('progress', 'fun-fuel'); meter.max = 8; meter.value = 0;
    const launch = s.button('🔥 Add rocket fuel!', () => {
      if (launch.disabled) return;
      meter.value = ++fuel;
      rocket.style.bottom = `${10 + fuel * 7}%`;
      if (fuel === 8) {
        launch.disabled = true;
        s.award(5, 'Blast off! Next stop: the moon! 🌙');
        s.later(650, () => { fuel = 0; meter.value = 0; rocket.style.bottom = '10%'; launch.disabled = false; });
      }
    }, 'fun-action');
    sky.append(el('span', 'fun-moon', '🌙'), rocket);
    s.arena.append(sky, meter, launch);
  }

  function gardenGame(s) {
    const stages = ['🌱', '🌿', '🌷'];
    const grid = s.grid();
    for (let i = 0; i < 6; i++) {
      let stage = 0;
      const b = s.button('🌱 💧', () => {
        stage++;
        if (stage === 2) {
          b.textContent = '🌷'; b.disabled = true;
          s.award(2, 'Your garden is blooming! 🌷');
          s.later(700, () => { stage = 0; b.textContent = '🌱 💧'; b.disabled = false; });
        } else b.textContent = `${stages[stage]} ☀️`;
      });
      grid.append(b);
    }
    s.status.textContent = 'Tap each seed to water it, then give it sunshine.';
  }

  function fireflyGame(s) {
    const grid = s.grid();
    const buttons = [];
    let glowing = -1;
    for (let i = 0; i < 9; i++) {
      const b = s.button('🌌', () => {
        if (i !== glowing) return s.hint('Catch the glowing firefly!');
        s.award(); flash();
      });
      grid.append(b); buttons.push(b);
    }
    function flash() {
      glowing = pick(buttons.map((_, i) => i).filter(i => i !== glowing));
      buttons.forEach((b, i) => { b.textContent = i === glowing ? '✨' : '🌌'; b.classList.toggle('is-lit', i === glowing); });
    }
    flash(); s.every(1200, flash);
  }

  function sequenceGame(s, c) {
    const grid = s.grid(c.music ? 2 : 3);
    const items = c.music ? ['🔴 Do', '🟡 Re', '🔵 Mi', '🟢 Sol'] : ['🏝️', '🌴', '🐚', '🦜', '🌊', '🪵', '🦀', '⭐', '💎'];
    const buttons = [];
    let sequence = [], cursor = 0, accepting = false;
    const replay = s.button('Show me again', () => { if (accepting) show(); }, 'fun-action');
    function note(index) {
      if (c.music && typeof window.playOsc === 'function') window.playOsc({freq:[262,294,330,392][index],dur:0.18,vol:0.2});
    }
    items.forEach((item, i) => {
      const b = s.button(item, () => {
        if (!accepting) return;
        note(i);
        if (sequence[cursor] !== i) { s.hint('Watch the trail again!'); show(); return; }
        b.classList.add('is-lit'); s.later(200, () => b.classList.remove('is-lit'));
        if (++cursor === sequence.length) {
          accepting = false; s.award(sequence.length, 'You remembered it! 🎉');
          s.later(600, () => { sequence = Array.from({length:Math.min(5, sequence.length + 1)}, () => Math.floor(Math.random()*items.length)); show(); });
        }
      });
      buttons.push(b); grid.append(b);
    });
    s.arena.append(replay);
    function show() {
      accepting = false; cursor = 0; replay.disabled = true;
      buttons.forEach(b => b.classList.remove('is-lit'));
      s.status.textContent = 'Watch first…';
      sequence.forEach((index, step) => {
        s.later(step*650, () => { buttons[index].classList.add('is-lit'); note(index); });
        s.later(step*650+430, () => buttons[index].classList.remove('is-lit'));
      });
      s.later(sequence.length*650, () => { accepting = true; replay.disabled = false; s.status.textContent = 'Your turn! Tap the same order.'; });
    }
    sequence = [Math.floor(Math.random()*items.length), Math.floor(Math.random()*items.length)]; show();
  }

  function countingGame(s) {
    function round() {
      const grid = s.grid(); let next = 1;
      s.status.textContent = 'Pop 1, then 2, all the way to 6!';
      shuffle([1,2,3,4,5,6]).forEach(number => {
        const b = s.button(`${number} 🫧`, () => {
          if (number !== next) return s.hint(`Find ${next} next!`);
          b.disabled = true; b.textContent = '✨'; next++; s.award();
          if (next === 7) s.later(450, round);
          else s.status.textContent = `Find ${next} next!`;
        });
        grid.append(b);
      });
    }
    round();
  }

  function beeGame(s) {
    let bee = 0;
    const grid = s.grid(); const buttons = [];
    let goal = 4;
    for (let i = 0; i < 9; i++) {
      const b = s.button(i === 0 ? '🐝' : i === goal ? '🌻' : '🌼', () => {
        const distance = Math.abs(i%3-bee%3) + Math.abs(Math.floor(i/3)-Math.floor(bee/3));
        if (distance !== 1) return s.hint('Fly to a flower next to the bee.');
        bee = i;
        if (bee === goal) { s.award(3, 'Sweet nectar! 🍯'); goal = pick(buttons.map((_,j)=>j).filter(j=>j!==bee)); }
        buttons.forEach((b,j) => { b.textContent = j===bee?'🐝':j===goal?'🌻':'🌼'; });
      });
      grid.append(b); buttons.push(b);
    }
    s.status.textContent = 'Move one flower at a time to reach the sunflower.';
  }

  function meteorGame(s) {
    const field = el('div', 'fun-field'); s.arena.append(field);
    function spawn() {
      if (field.childElementCount > 7) return;
      const good = Math.random() < 0.25;
      const b = s.button(good ? '🛰️' : '☄️', () => {
        b.remove();
        if (good) s.hint('Keep the friendly satellites safe!');
        else s.award(1, 'Meteor stopped! 🌍');
      }, 'fun-falling');
      b.style.left = `${Math.random()*78}%`;
      field.append(b);
      let y = -12;
      const timer = s.every(70, () => {
        if (!b.isConnected) { clearInterval(timer); s.timers.delete(timer); return; }
        y += 2.8; b.style.top = `${y}%`;
        if (y > 92) { b.remove(); clearInterval(timer); s.timers.delete(timer); }
      });
    }
    spawn(); s.every(650, spawn);
  }

  function duckGame(s) {
    const grid = s.grid(); const hungry = new Map(); const buttons = [];
    for (let i=0;i<9;i++) {
      const b = s.button('🌊', () => {
        if (!hungry.has(i)) return;
        hungry.delete(i); b.textContent = '💛'; s.award(1, 'One happy duck!');
        s.later(300, () => { if (!hungry.has(i)) b.textContent='🌊'; });
      }); buttons.push(b); grid.append(b);
    }
    function spawn() {
      const free=buttons.map((_,i)=>i).filter(i=>!hungry.has(i));
      if (!free.length) return;
      const i=pick(free), token={}; hungry.set(i,token); buttons[i].textContent='🦆';
      s.later(1500, () => { if(hungry.get(i)===token) {hungry.delete(i);buttons[i].textContent='🌊';} });
    }
    spawn(); s.every(600,spawn);
  }

  function memoryGame(s) {
    function round() {
      const grid=s.grid(4); const cards=shuffle(['👾','🤖','👻','👽','👾','🤖','👻','👽']);
      let first=null, locked=false, matches=0;
      cards.forEach((face,i)=> {
        const b=s.button('❓',()=> {
          if(locked || b.disabled || first?.i===i) return;
          b.textContent=face;
          if(!first) { first={b,face,i}; return; }
          if(first.face===face) {
            first.b.disabled=b.disabled=true; first=null;
            s.award(2,'A matching monster pair!');
            if(++matches===4) s.later(600,round);
          } else {
            locked=true; const previous=first; first=null;
            s.later(650,()=> { previous.b.textContent=b.textContent='❓'; locked=false; });
          }
        }); grid.append(b);
      });
    }
    round();
  }

  function timingGame(s) {
    let position=0, direction=1, stacked=0;
    const scene=el('div','fun-stack-scene');
    const tower=el('div','fun-tower','⛄'); scene.append(tower);
    const track=el('div','fun-timing-track');
    const zone=el('div','fun-timing-zone');
    const cursor=el('div','fun-timing-cursor','❄️'); track.append(zone,cursor);
    const b=s.button('❄️ Stack a snowball!',()=> {
      if(position>=30 && position<=70) {
        s.award(2,'Perfect snowball!'); stacked++; tower.textContent='⛄'+'⚪'.repeat(Math.min(stacked,5));
        if(stacked===5) { stacked=0; s.award(5,'A giant snow friend!'); }
      } else s.hint('Tap when the snowflake is in the green zone!');
    },'fun-action');
    s.arena.append(scene,track,b);
    s.every(35,()=> { position+=direction*2.4; if(position>=96||position<=0) direction*=-1; cursor.style.left=`${position}%`; });
  }

  function laneGame(s,c) {
    let lane=1, turn=0;
    const track=el('div','fun-lanes'); const player=el('div','fun-lane-player',c.player);
    track.append(player);
    const controls=el('div','fun-steering');
    function move(delta) { lane=Math.max(0,Math.min(2,lane+delta)); player.style.left=`${lane*33.333+16.666}%`; }
    controls.append(s.button('⬅️ Left',()=>move(-1),'fun-action'),s.button('Right ➡️',()=>move(1),'fun-action'));
    s.arena.append(track,controls); move(0);
    s.on(document,'keydown',e=> { if(e.key==='ArrowLeft'||e.key==='ArrowRight') { e.preventDefault(); move(e.key==='ArrowLeft'?-1:1); } });
    function spawn() {
      const good=turn++%3!==2; const itemLane=Math.floor(Math.random()*3);
      const item=el('span','fun-lane-item',good?c.prize:c.hazard);
      item.style.left=`${itemLane*33.333+16.666}%`; track.append(item);
      let y=0;
      const timer=s.every(70,()=> {
        y+=3; item.style.top=`${y}%`;
        if(y>=76) {
          if(itemLane===lane) { if(good) s.award(2,c.cheer); else s.hint(c.warning); }
          item.remove(); clearInterval(timer); s.timers.delete(timer);
        }
      });
    }
    spawn(); s.every(900,spawn);
  }

  function frogGame(s) {
    const grid=s.grid(); const buttons=[]; let frog=6, next=4;
    for(let i=0;i<9;i++) {
      const b=s.button('',()=> {
        if(i!==next) return s.hint('Hop to the sparkling lily pad!');
        frog=i; next=pick(buttons.map((_,j)=>j).filter(j=>j!==frog)); s.award(1,'Ribbit! 🐸'); render();
      }); buttons.push(b); grid.append(b);
    }
    function render() { buttons.forEach((b,i)=>b.textContent=i===frog?'🐸':i===next?'✨🪷':'🪷'); }
    render();
  }

  function sorterGame(s) {
    const shapes=['🔴','🟨','🔺']; let shape=pick(shapes), dragging=false, origin=null;
    const piece=el('button','fun-sort-piece',shape); piece.type='button'; piece.setAttribute('aria-label','Shape to sort');
    const bins=el('div','fun-grid'); bins.style.setProperty('--columns',3);
    function sort(index) {
      if(shapes[index]!==shape) { s.hint('Try the bin with the same shape!'); return; }
      s.award(2,'Sorted! 🌟'); shape=pick(shapes); piece.textContent=shape;
    }
    shapes.forEach((item,i)=> {
      const bin=s.button(`${item} ⤵️`,()=>sort(i)); bin.dataset.bin=i; bins.append(bin);
    });
    s.arena.append(piece,bins);
    s.on(piece,'pointerdown',e=> { dragging=true; origin=piece.getBoundingClientRect(); piece.setPointerCapture(e.pointerId); piece.classList.add('is-dragging'); });
    s.on(piece,'pointermove',e=> {
      if(!dragging) return;
      piece.style.transform=`translate(${e.clientX-(origin.left+origin.width/2)}px, ${e.clientY-(origin.top+origin.height/2)}px)`;
    });
    function release(e) {
      if(!dragging) return;
      dragging=false; piece.style.transform=''; piece.classList.remove('is-dragging');
      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-bin]');
      if(target && s.arena.contains(target)) sort(Number(target.dataset.bin));
    }
    s.on(piece,'pointerup',release);
    s.on(piece,'pointercancel',()=> { dragging=false;piece.style.transform='';piece.classList.remove('is-dragging'); });
    s.status.textContent='Drag the shape into its bin, or tap the matching bin.';
  }

  const definitions = [
    {id:'rainbowPainter',label:'Rainbow Painter',emoji:'🌈',category:'Creative',description:'Tap the color the rainbow asks for!',run:targetGame,items:['🔴 Red','🟡 Yellow','🟢 Green','🔵 Blue','🟣 Purple'],paint:true,request:'Paint with'},
    {id:'dinoDig',label:'Dino Dig',emoji:'🦕',category:'Discovery',description:'Tap rocks twice to uncover hidden dinosaur bones.',run:digGame},
    {id:'rocketLaunch',label:'Rocket Launch',emoji:'🚀',category:'Action',description:'Tap to fuel your rocket and blast off to the moon!',run:rocketGame},
    {id:'cookieChef',label:'Cookie Chef',emoji:'🍪',category:'Creative',description:'Follow the recipe to mix and bake batches of cookies.',run:recipeGame,items:['🥚 Egg','🥛 Milk','🌾 Flour','🍫 Chocolate'],request:'Add',cheer:'Fresh cookies from the oven! 🍪'},
    {id:'penguinSlide',label:'Penguin Slide',emoji:'🐧',category:'Action',description:'Steer left and right. Catch fish and dodge ice!',run:laneGame,player:'🐧',prize:'🐟',hazard:'🧊',cheer:'Fish for your penguin!',warning:'Oops, ice! Slide into a clear lane.'},
    {id:'gardenGrow',label:'Garden Grow',emoji:'🌷',category:'Creative',description:'Water seeds and add sunshine to grow a flower garden.',run:gardenGame},
    {id:'fireflyFinder',label:'Firefly Finder',emoji:'✨',category:'Action',description:'Catch the glowing fireflies before they move!',run:fireflyGame},
    {id:'treasureTrail',label:'Treasure Trail',emoji:'🏝️',category:'Memory',description:'Watch the sparkling trail, then tap it in the same order.',run:sequenceGame},
    {id:'robotBuilder',label:'Robot Builder',emoji:'🤖',category:'Creative',description:'Find the part your robot needs to build a new friend.',run:targetGame,items:['⚙️ Gear','🔋 Battery','🦾 Arm','👁️ Eye'],request:'Robot needs'},
    {id:'pizzaParty',label:'Pizza Party',emoji:'🍕',category:'Creative',description:'Add toppings in order to serve each pizza.',run:recipeGame,items:['🍅 Tomato','🧀 Cheese','🍄 Mushroom','🫑 Pepper'],request:'Next topping:',cheer:'Pizza served! 🍕'},
    {id:'bubbleCount',label:'Bubble Count',emoji:'🫧',category:'Discovery',description:'Pop the numbered bubbles in order from 1 to 6.',run:countingGame},
    {id:'beeBouquet',label:'Bee Bouquet',emoji:'🐝',category:'Discovery',description:'Help the bee fly from flower to flower to reach the sunflower.',run:beeGame},
    {id:'meteorShield',label:'Meteor Shield',emoji:'☄️',category:'Action',description:'Tap falling meteors to protect Earth. Leave satellites alone!',run:meteorGame},
    {id:'duckPond',label:'Duck Pond',emoji:'🦆',category:'Action',description:'Tap hungry ducks to feed them before they swim away.',run:duckGame},
    {id:'monsterMatch',label:'Monster Match',emoji:'👾',category:'Memory',description:'Flip cards and find the matching friendly monsters.',run:memoryGame},
    {id:'musicMaker',label:'Music Maker',emoji:'🎵',category:'Memory',description:'Listen and watch, then play the notes in the same order.',run:sequenceGame,music:true},
    {id:'snowballStack',label:'Snowball Stack',emoji:'⛄',category:'Action',description:'Tap when the snowflake enters the green zone to stack snowballs.',run:timingGame},
    {id:'pirateTreasure',label:'Pirate Treasure',emoji:'🏴‍☠️',category:'Action',description:'Steer your ship to treasure chests and sail around the rocks.',run:laneGame,player:'⛵',prize:'💰',hazard:'🪨',cheer:'Treasure aboard!',warning:'Rock ahead! Sail into another lane.'},
    {id:'frogHop',label:'Frog Hop',emoji:'🐸',category:'Action',description:'Hop your frog onto the sparkling lily pads.',run:frogGame},
    {id:'shapeSorter',label:'Shape Sorter',emoji:'🔺',category:'Discovery',description:'Drag each shape into the matching bin, or tap its bin.',run:sorterGame},
  ];

  window.SIGHT_WORDS_EXTRA_GAMES = definitions.map(config => {
    const game = {
      name:config.label, duration:20000, score:0, session:null,
      start(container,onComplete) {
        this.destroy(); this.score=0;
        this.session=new Session(this,container,onComplete,config);
        config.run(this.session,config);
      },
      endGame() { this.session?.finish(); },
      destroy() {
        if(!this.session) return;
        this.session.stop(); this.session.root.remove(); this.session=null;
      },
    };
    return {id:config.id,label:config.label,emoji:config.emoji,description:config.description,category:config.category,isNew:true,game};
  });
})();
