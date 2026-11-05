(function(root){
  'use strict';
  const labels={'match-result':'Handle match result','ocr-input':'Read text into textbox','click-point':'Click coordinate',click:'Click image / saved point','click-setting':'Click selected setting option',move:'Move mouse',walk:'Walk',scroll:'Scroll',wait:'Wait for images',delay:'Delay',press:'Press a key',key:'Hold a key',call:'Run another sequence',repeat:'Repeat steps','for-setting':'For each selected item',if:'If conditions match',retry:'Retry sequence until conditions match',until:'Repeat until conditions match',stop:'Stop macro',camera:'Set bird’s-eye camera',placements:'Run placement setup',outcome:'Wait for match result','click-wait':'Click and wait for screen','scroll-option':'Scroll to selected option',dismiss:'Click through screens','setting-call':'Run sequence from setting'};
  const actions=Object.keys(labels);
  const condition=target=>({operator:'all',checks:[{target,state:'present'}]});
  function step(action,definition,id){
    const target=Object.keys(definition.targets)[0]||'',image=Object.keys(definition.targets).find(id=>definition.targets[id].kind==='pattern')||'',workflow=Object.keys(definition.workflows)[0]||'';
    const s={id,action};
    if(action==='click-wait'||action==='dismiss')return {...s,target,ready:image,button:'Left',timeoutMs:10000,intervalMs:500,...(action==='click-wait'?{attempts:3}:{})};
    if(action==='scroll-option')return {...s,setting:Object.keys(definition.settings||{}).find(k=>definition.settings[k].type==='select')||'',x:400,y:300,direction:'Down',maxScrolls:40,timeoutMs:30000,intervalMs:300};
    if(action==='setting-call'){const setting=Object.keys(definition.settings||{}).find(k=>definition.settings[k].type==='select')||'';return {...s,setting,routes:Object.fromEntries((definition.settings?.[setting]?.options||[]).map(o=>[o.value,'']))};}
    if(action==='match-result'){const find=pattern=>Object.keys(definition.targets).find(k=>pattern.test(definition.targets[k].name))||'';return {...s,victory:find(/victory/i),defeat:find(/defeat/i),dismiss:find(/end.screen.*next/i),lobby:find(/return.*lobby/i),replay:find(/replay|retry/i),next:find(/next.*level|next.*stage/i),lobbyReady:find(/areas.*icon|lobby.*ready/i),matchReady:find(/match.*load|stage.*ready/i),victoryAction:'lobby',defeatAction:'lobby',victorySetting:'',defeatSetting:'',timeoutMs:1800000,menuTimeoutMs:30000,transitionTimeoutMs:60000,intervalMs:700};}
    if(action==='outcome')return {...s,victory:Object.keys(definition.targets).find(k=>/victory/i.test(definition.targets[k].name))||image,defeat:Object.keys(definition.targets).find(k=>/defeat/i.test(definition.targets[k].name))||image,timeoutMs:1800000,thenSteps:[],elseSteps:[]};
    if(action==='ocr-input')return {...s,readX:0,readY:0,width:200,height:50,x:0,y:0,filter:'digits',stripSpaces:1,clear:1,minLength:2,maxLength:32,missing:'error'};
    if(action==='stop')return s;
    if(action==='camera')return {...s,zoomIn:20,zoomOut:20,tilt:299};
    if(action==='placements')return {...s,route:'selected',fallback:'shared',setting:''};
    if(action==='click-point')Object.assign(s,{x:0,y:0,button:'Left'});
    else if(action==='move')Object.assign(s,{x:0,y:0});
    else if(action==='walk')Object.assign(s,{keys:['W'],sprint:0,sprintKey:'Shift',durationMs:1000});
    else if(action==='scroll')Object.assign(s,{direction:'Down',ticks:1,count:20,intervalMs:100});
    else if(action==='click')Object.assign(s,{target,button:'Left',timeoutMs:0,missing:'error'});
    else if(action==='click-setting')Object.assign(s,{setting:Object.keys(definition.settings||{}).find(id=>['select','priority','multiselect'].includes(definition.settings[id].type))||'',button:'Left',timeoutMs:0,missing:'error'});
    else if(action==='wait')Object.assign(s,{condition:condition(image),timeoutMs:30000,missing:'error'});
    else if(action==='delay')s.durationMs=500;
    else if(action==='key')Object.assign(s,{key:'W',durationMs:500});
    else if(action==='press')Object.assign(s,{key:'Space',count:1,intervalMs:100});
    else if(action==='call')s.workflow=workflow;
    else if(action==='repeat')Object.assign(s,{steps:[],count:2});
    else if(action==='for-setting')Object.assign(s,{setting:Object.keys(definition.settings||{}).find(id=>['priority','multiselect'].includes(definition.settings[id].type))||'',steps:[]});
    else if(action==='if')Object.assign(s,{condition:condition(image),thenSteps:[],elseSteps:[]});
    else if(action==='retry')Object.assign(s,{condition:condition(image),steps:[],attempts:3,timeoutMs:5000,intervalMs:500,failure:'error'});
    else if(action==='until')Object.assign(s,{condition:condition(image),steps:[],timeoutMs:1800000,intervalMs:1000,failure:'error'});
    else throw Error('Unknown action.');
    return s;
  }
  function normalize(raw){
    const d=structuredClone(raw);
    if(d.playback?.managedUpgrade)for(const field of ['pathColor','pathTolerance','pathRadius','pathClearance','pathAttempts','placementConfirmMs'])delete d.playback.managedUpgrade[field];
    d.settings=d.settings||{};d.entry=d.entry||(d.workflows['enter-map']?'enter-map':Object.keys(d.workflows)[0]);d.runMode=d.runMode||'once';
    function visit(steps){for(const s of steps){
      if(s.action==='repeat'&&s.workflow){s.steps=[{id:'run-sequence',action:'call',workflow:s.workflow}];delete s.workflow;}
      if(s.action==='if'&&!s.condition&&d.targets[s.target]?.kind==='pattern'){
        s.condition=condition(s.target);s.thenSteps=s.then?[{id:'then-sequence',action:'call',workflow:s.then}]:[];s.elseSteps=s.otherwise?[{id:'else-sequence',action:'call',workflow:s.otherwise}]:[];delete s.target;delete s.then;delete s.otherwise;
      }
      for(const field of ['steps','thenSteps','elseSteps'])if(s[field])visit(s[field]);
    }}
    for(const flow of Object.values(d.workflows))visit(flow.steps);return d;
  }
  class FrameworkEditor{
    constructor({request,toast,capture,select,point,changed,catalogChanged}){
      Object.assign(this,{request,toast,capture,select,point,changed,catalogChanged,definition:null,saved:'',revision:0,flow:'',target:'',busy:false,package:'',openSteps:new Set(),groupActions:new Map()});
      this.$=id=>document.getElementById(id);this.escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      this.$('framework-reload').addEventListener('click',()=>{if(this.dirty()){toast('Save or discard the draft before reloading.',true);return;}this.open(true);});
      this.$('framework-discard').addEventListener('click',()=>{if(!this.saved)return;this.$('framework-target-search').value='';this.definition=JSON.parse(this.saved);this.render();this.change();});
      this.$('framework-save').addEventListener('click',()=>this.save());
      this.settingsEditor=new root.FlowSettingsEditor({definition:()=>this.definition,point,toast,changed:()=>{this.renderChoices();this.renderFlow();this.change();}});
      this.$('framework-package').addEventListener('change',e=>{if(this.dirty()){e.target.value=this.package;toast('Save or discard the draft before switching macros.',true);return;}this.open(true,e.target.value);});
      this.$('framework-icon').addEventListener('click',()=>{if(!this.definition)return;const selected=this.definition.icon||'pantheon';this.$('macro-icon-grid').innerHTML=Object.entries(root.PantheonHub.macroIcons).map(([id,v])=>`<button type="button" class="macro-icon-option" data-macro-icon="${id}" aria-pressed="${id===selected||(!root.PantheonHub.macroIcons[selected]&&id==='pantheon')}"><img src="${v.image}" alt=""><span>${this.escape(v.name)}</span></button>`).join('');this.$('macro-icon-dialog').showModal();this.$('macro-icon-grid').querySelector('[aria-pressed=true]').focus();});
      this.$('macro-icon-close').addEventListener('click',()=>this.$('macro-icon-dialog').close());
      this.$('macro-icon-dialog').addEventListener('click',e=>{const dialog=this.$('macro-icon-dialog');if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();return;}const button=e.target.closest('[data-macro-icon]');if(!button)return;this.definition.icon=button.dataset.macroIcon;this.renderIcon();this.change();dialog.close();});
      this.$('framework-new-macro').addEventListener('click',async()=>{if(this.dirty()){toast('Save or discard the draft before creating a macro.',true);return;}try{const data=await request('frameworkNew');await this.open(true,data.package);await catalogChanged?.();}catch(e){toast(e.message,true);}});
      this.$('framework-export-macro').addEventListener('click',()=>{if(this.definition)this.$('macro-export-dialog').showModal();});
      this.$('macro-export-close').addEventListener('click',()=>this.$('macro-export-dialog').close());
      this.$('macro-export-dialog').addEventListener('click',async e=>{const dialog=this.$('macro-export-dialog'),button=e.target.closest('[data-export-format]');if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();return;}if(!button||this.exporting)return;this.exporting=true;const buttons=[...dialog.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{const result=await request('macroExport',{id:this.package,definition:this.definition,format:button.dataset.exportFormat});if(result.cancelled)return;dialog.close();toast(button.dataset.exportFormat==='json'?'Macro JSON file saved.':'Macro configuration copied.');}catch(err){toast(err.message,true);}finally{this.exporting=false;buttons.forEach(b=>b.disabled=false);}});
      for(const [id,field]of [['framework-macro-name','name'],['framework-game-id','game'],['framework-entry','entry'],['framework-run-mode','runMode']])this.$(id).addEventListener('change',e=>{let value=e.target.value;if(field==='game'){value=value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'roblox-td';if(!/^[a-z]/.test(value))value=('game-'+value).slice(0,48);e.target.value=value;}this.definition[field]=value;this.change();});
      this.bindLibrary();
      this.$('framework-new-action').innerHTML=this.actionOptions('click-point');
      this.$('framework-add-step').addEventListener('click',()=>this.addStep('',this.$('framework-new-action').value));
      this.$('framework-add-flow').addEventListener('click',()=>{if(Object.keys(this.definition.workflows).length>=32){this.toast('A macro supports up to 32 sequences.',true);return;}this.flow=this.id('sequence',Object.keys(this.definition.workflows));this.definition.workflows[this.flow]={name:'New sequence',steps:[]};this.render();this.change();this.focusLibraryItem('workflows');});
      this.$('framework-add-target').addEventListener('click',()=>{if(Object.keys(this.definition.targets).length>=128){this.toast('A macro supports up to 128 targets.',true);return;}this.$('framework-target-search').value='';this.target=this.id('image',Object.keys(this.definition.targets));this.definition.targets[this.target]={name:'New image',kind:'pattern',pattern:'',x:0,y:0,width:800,height:600,error1:0,error0:0,offsetX:0,offsetY:0};this.render();this.change();});
      this.$('framework-capture-target').addEventListener('click',async()=>{const id=this.target,result=await select();if(!result||result.cancelled)return;const c=capture(),t=this.definition.targets[id];Object.assign(t,{x:0,y:0,width:800,height:600,kind:'pattern',pattern:c.pattern});this.renderChoices();this.renderTarget();this.renderFlow();this.change();});
      this.$('framework-target-fields').addEventListener('input',e=>{if(e.target.dataset.targetField!=='name')return;this.definition.targets[this.target].name=e.target.value;this.renderChoices();this.change();});
      this.$('framework-target-fields').addEventListener('change',event=>{
        const input=event.target, field=input.dataset.targetField;
        if (!field || field==='name') return;
        const target=this.definition.targets[this.target];
        target[field]=input.type==='number'?Number(input.value):input.value;
        if (field==='kind') {
          if (target.kind==='point') Object.assign(target,{pattern:'',width:1,height:1,offsetX:0,offsetY:0});
          this.renderTarget();
        }
        if (field==='pattern') {
          target.pattern=input.value.trim();
          input.value=target.pattern;
          this.paintPreviews(this.$('framework-target-fields'));
        }
        this.renderChoices();
        if (field==='kind' || field==='pattern') this.renderFlow();
        this.change();
      });
      this.$('framework-use-capture').addEventListener('click',()=>{const c=capture();if(!c.pattern){toast('Select a region in Roblox first.',true);return;}Object.assign(this.definition.targets[this.target],{x:0,y:0,width:800,height:600,kind:'pattern',pattern:c.pattern});this.renderChoices();this.renderTarget();this.renderFlow();this.change();});
      this.$('framework-use-point').addEventListener('click',()=>{const c=capture();if(!c.pattern){toast('Select a region in Roblox first.',true);return;}const r=c.region;Object.assign(this.definition.targets[this.target],{kind:'point',pattern:'',x:r.x+Math.floor(r.width/2),y:r.y+Math.floor(r.height/2),width:1,height:1,offsetX:0,offsetY:0});this.renderChoices();this.renderTarget();this.renderFlow();this.change();});
      this.$('framework-capture-bounds').addEventListener('click',()=>{const c=capture(),t=this.definition.targets[this.target];if(!c.pattern||!c.region||!t||t.kind!=='pattern'){toast('Select a region in Roblox and choose an image target first.',true);return;}Object.assign(t,{...c.region});this.renderTarget();this.change();});
      this.$('framework-test-target').addEventListener('click',async()=>{const t=this.definition.targets[this.target];if(!t||t.kind!=='pattern'||!t.pattern){toast('Choose a captured image target first.',true);return;}try{const result=await request('developerTest',{pattern:t.pattern,tolerance:Math.max(t.error0,t.error1),region:{x:t.x,y:t.y,width:t.width,height:t.height}});toast(result.matches.length+' matches in this target’s search area.');}catch(e){toast(e.message,true);}});
      this.$('framework-full-client').addEventListener('click',()=>{Object.assign(this.definition.targets[this.target],{x:0,y:0,width:800,height:600});this.renderTarget();this.change();});
      this.$('macro-copy-source').addEventListener('change',()=>this.loadCopySource());
      this.$('macro-copy-cancel').addEventListener('click',()=>this.$('macro-copy-dialog').close());
      this.$('macro-copy-apply').addEventListener('click',()=>this.applyCopy());
      this.$('framework-steps').addEventListener('change',e=>this.editStep(e));
      this.$('framework-steps').addEventListener('click',e=>this.command(e));
      this.$('framework-steps').addEventListener('toggle',e=>{const key=e.target.dataset.foldKey;if(key&&e.target.isConnected){e.target.open?this.openSteps.add(key):this.openSteps.delete(key);e.target.querySelector('[data-step-command=fold]').setAttribute('aria-expanded',String(e.target.open));}},true);
      PantheonSort.bind(this.$('framework-steps'),{handle:'.sequence-grip',item:'.framework-step',list:'.flow-step-list',onDrop:(parent,rows)=>{const list=this.resolve(parent.dataset.listPath),byIndex=[...list];list.splice(0,list.length,...rows.map(row=>byIndex[Number(row.dataset.flowStep)]));this.renderFlow();this.change();}});

    }
    bindLibrary() {
      const menu=this.$('editor-item-menu');
      const selectItem=(kind,event)=>{
        const button=event.target.closest('[data-library-item]');
        if (!button) return;
        this.selectLibraryItem(kind,button.dataset.libraryItem);
      };
      for (const [kind,id] of [['workflows','framework-sequence-tabs'],['targets','framework-target-list']]) {
        const list=this.$(id);
        list.addEventListener('click',event=>selectItem(kind,event));
        list.addEventListener('dblclick',event=>{
          const button=event.target.closest('[data-library-item]');
          if (button) this.renameLibraryItem(kind,button.dataset.libraryItem);
        });
        list.addEventListener('contextmenu',event=>{
          const button=event.target.closest('[data-library-item]');
          if (!button) return;
          event.preventDefault();
          const bounds=button.getBoundingClientRect();
          this.showLibraryMenu(kind,button.dataset.libraryItem,event.clientX||bounds.left,event.clientY||bounds.bottom);
        });
      }
      this.$('framework-sequence-tabs').addEventListener('keydown',event=>{
        const buttons=[...this.$('framework-sequence-tabs').querySelectorAll('[role=tab]')];
        const index=buttons.indexOf(event.target);
        if (index<0) return;
        const next={ArrowLeft:(index+buttons.length-1)%buttons.length,ArrowRight:(index+1)%buttons.length,Home:0,End:buttons.length-1}[event.key];
        if (next===undefined) return;
        event.preventDefault();
        this.selectLibraryItem('workflows',buttons[next].dataset.libraryItem);
      });
      this.$('framework-target-search').addEventListener('input',()=>this.renderTargetList());
      this.$('framework-sequence-tabs').addEventListener('wheel',event=>{
        const tabs=event.currentTarget;
        if (!event.deltaX && tabs.scrollWidth>tabs.clientWidth) {
          event.preventDefault();
          tabs.scrollLeft+=event.deltaY;
        }
      },{passive:false});
      menu.addEventListener('keydown',event=>{
        const options=[...menu.querySelectorAll('button')],index=options.indexOf(event.target);
        if (index<0) return;
        const next={ArrowDown:(index+1)%options.length,ArrowUp:(index+options.length-1)%options.length,Home:0,End:options.length-1}[event.key];
        if (next===undefined) return;
        event.preventDefault();
        options[next].focus();
      });
      this.$('framework-content').addEventListener('click',event=>{
        const more=event.target.closest('[data-library-menu]');
        const paste=event.target.closest('[data-paste-step]');
        if (more) {
          const kind=more.dataset.libraryMenu, bounds=more.getBoundingClientRect();
          this.showLibraryMenu(kind,kind==='workflows'?this.flow:this.target,bounds.left,bounds.bottom+4);
        }
        if (paste) this.pasteLibraryItem('step',paste.dataset.pasteStep);
      });
      this.$('framework-steps').addEventListener('contextmenu',event=>{
        const card=event.target.closest('[data-step-path]');
        if (!card || event.target.closest('input,textarea,select,[contenteditable]')) return;
        event.preventDefault();
        const bounds=card.getBoundingClientRect();
        this.selectStep(card);
        this.showLibraryMenu('step',card.dataset.stepPath,event.clientX||bounds.left,event.clientY||bounds.top);
      });
      document.addEventListener('pointerdown',event=>{
        if (!this.selectedStep || event.target.closest('#editor-item-menu')) return;
        if (event.target.closest('[data-fold-key]')?.dataset.foldKey!==this.selectedStep) this.clearStepSelection();
      },true);
      menu.addEventListener('click',event=>{
        const option=event.target.closest('[data-editor-action]');
        if (!option) return;
        const {kind,id}=this.menuItem;
        menu.hidePopover();
        switch(option.dataset.editorAction) {
          case 'rename': this.renameLibraryItem(kind,id); break;
          case 'copy':
            this.copyLibraryItem(kind,id);
            if (kind==='step') this.$('framework-steps').querySelector('[data-step-selected] > summary')?.focus({preventScroll:true});
            break;
          case 'paste': this.pasteLibraryItem(kind,kind==='step'?id.split('.').slice(0,-1).join('.'):undefined,kind==='step'?this.location(id).index:undefined); break;
          case 'import': this.openCopy(kind,kind==='step'&&id?id.split('.').slice(0,-1).join('.'):'',kind==='step'&&id?this.location(id).index:undefined); break;
          case 'import-step': this.openCopy('step',''); break;
          case 'delete': this.deleteFlow(id); this.focusLibraryItem('workflows'); break;
        }
      });
      this.$('editor-rename-cancel').addEventListener('click',()=>this.$('editor-rename-dialog').close());
      this.$('editor-rename-form').addEventListener('submit',event=>{
        event.preventDefault();
        const {kind,id}=this.renameItem;
        const input=this.$('editor-rename-input');
        const name=input.value.trim();
        if (!name) { input.value=''; input.reportValidity(); return; }
        this.definition[kind][id].name=name;
        this.$('editor-rename-dialog').close();
        this.renderChoices();
        if (kind==='targets' && id===this.target) this.renderTarget();
        this.change();
        this.focusLibraryItem(kind,id);
      });
      document.addEventListener('keydown',event=>this.libraryShortcut(event));
    }

    selectLibraryItem(kind,id) {
      if (kind==='workflows' && this.flow!==id) {
        this.flow=id;
        this.selectedStep=null;
        for (const tab of this.$('framework-sequence-tabs').querySelectorAll('[role=tab]')) {
          const active=tab.dataset.libraryItem===id;
          tab.setAttribute('aria-selected',String(active));
          tab.tabIndex=active?0:-1;
        }
        this.$('framework-sequence-body').setAttribute('aria-labelledby','sequence-tab-'+id);
        this.renderFlow();
      } else if (kind==='targets' && this.target!==id) {
        this.target=id;
        for (const button of this.$('framework-target-list').querySelectorAll('[data-library-item]'))
          button.setAttribute('aria-pressed',String(button.dataset.libraryItem===id));
        this.renderTarget();
      }
      this.focusLibraryItem(kind);
    }

    focusLibraryItem(kind,id=kind==='workflows'?this.flow:this.target) {
      const list=this.$(kind==='workflows'?'framework-sequence-tabs':'framework-target-list');
      const button=list.querySelector('[data-library-item="'+CSS.escape(id||'')+'"]');
      button?.focus();
    }

    renameLibraryItem(kind,id) {
      const input=this.$('editor-rename-input');
      this.renameItem={kind,id};
      this.$('editor-rename-title').textContent=kind==='workflows'?'Rename sequence':'Rename target';
      input.value=this.definition[kind][id].name;
      this.$('editor-rename-dialog').showModal();
      input.select();
    }

    showLibraryMenu(kind,id,x,y) {
      if (!this.definition || this.busy) return;
      this.menuItem={kind,id};
      const menu=this.$('editor-item-menu');
      const noun={workflows:'sequence',targets:'target',step:'step'}[kind];
      const hasItem=kind==='step'?!!id:Object.hasOwn(this.definition[kind],id);
      const options=[];
      if (hasItem && kind!=='step') options.push(['rename','Rename']);
      if (hasItem) options.push(['copy','Copy '+noun]);
      if (this.libraryClipboard?.kind===kind) options.push(['paste','Paste '+noun+(kind==='step'?' below':'')]);
      options.push(['import','Copy '+noun+' from another macro']);
      if (kind==='workflows') {
        options.push(['import-step','Copy step from another macro']);
        if (hasItem) options.push(['delete','Delete sequence']);
      }
      if (menu.matches(':popover-open')) menu.hidePopover();
      menu.innerHTML=options.map(([action,label])=>`<button type="button" role="menuitem" data-editor-action="${action}">${label}</button>`).join('');
      menu.showPopover();
      menu.style.left=Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-8))+'px';
      menu.style.top=Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-8))+'px';
      menu.firstElementChild.focus({preventScroll:true});
    }

    copyLibraryItem(kind,id) {
      const value=kind==='step'?this.resolve(id):id;
      this.libraryClipboard={kind,value:structuredClone(value),source:structuredClone(this.definition),package:this.package};
      this.updatePasteButtons();
      this.toast({workflows:'Sequence copied.',targets:'Target copied.',step:'Step copied.'}[kind]);
    }

    pasteLibraryItem(kind,path='',after) {
      const copied=this.libraryClipboard;
      if (copied?.kind!==kind || this.busy) return;
      try {
        this.insertLibraryItem(kind,copied.source,copied.value,this.flow,path,{reuseReferences:copied.package===this.package,after});
      } catch (error) {
        this.toast(error.message,true);
      }
    }

    insertLibraryItem(kind,source,value,flow,path,options) {
      const result=PantheonMacroCopy.copyItem(this.definition,source,kind,value,flow,path,options);
      this.definition=result.draft;
      if (kind==='targets') {
        this.target=result.id;
        this.$('framework-target-search').value='';
      }
      if (kind==='workflows') this.flow=result.id;
      this.render();
      if (kind==='step') {
        const list=[...this.$('framework-steps').querySelectorAll('[data-list-path]')].find(node=>node.dataset.listPath===path);
        const row=[...(list?.children||[])].find(node=>node.dataset.stepPath!==undefined && this.resolve(node.dataset.stepPath).id===result.id);
        row?.querySelector('summary').focus({preventScroll:true});
      } else this.focusLibraryItem(kind);
      this.change();
    }

    libraryShortcut(event) {
      const el=event.target;
      if (!(el instanceof Element) || event.defaultPrevented || !this.definition || this.busy || el.closest('input,textarea,select,[contenteditable],dialog')) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.repeat) return;
      const key=event.key.toLowerCase();
      const menu=this.$('editor-item-menu');
      const inStepMenu=menu.contains(el) && this.menuItem?.kind==='step';
      const card=inStepMenu?this.$('framework-steps').querySelector('[data-step-selected]'):el.closest('[data-step-path]');
      const kind=card?'step':el.closest('#framework-sequence-tabs')?'workflows':el.closest('#framework-target-library')?'targets':'';
      const id=card?.dataset.stepPath||el.closest('[data-library-item]')?.dataset.libraryItem;
      if (!kind || id===undefined) return;
      if (key==='c' && !window.getSelection()?.toString()) {
        event.preventDefault();
        if (inStepMenu) menu.hidePopover();
        this.copyLibraryItem(kind,id);
        if (inStepMenu) card.querySelector('summary').focus({preventScroll:true});
      } else if (key==='v' && this.libraryClipboard?.kind===kind) {
        event.preventDefault();
        if (inStepMenu) menu.hidePopover();
        if (card) this.pasteLibraryItem(kind,id.split('.').slice(0,-1).join('.'),this.location(id).index);
        else this.pasteLibraryItem(kind);
      } else if (key==='v' && kind==='workflows' && this.libraryClipboard?.kind==='step') {
        event.preventDefault();
        this.pasteLibraryItem('step');
      }
    }

    updatePasteButtons() {
      for (const button of this.$('framework-sequences').querySelectorAll('[data-paste-step]'))
        button.disabled=this.libraryClipboard?.kind!=='step';
    }

    clearStepSelection() {
      this.selectedStep=null;
      this.$('framework-steps').querySelector('[data-step-selected]')?.removeAttribute('data-step-selected');
    }

    selectStep(card) {
      this.clearStepSelection();
      this.selectedStep=card.dataset.foldKey;
      card.setAttribute('data-step-selected','');
      card.querySelector('summary').focus({preventScroll:true});
    }

    toggleStep(card) {
      card.open=!card.open;
      card.querySelector('[data-step-command=fold]').setAttribute('aria-expanded',String(card.open));
    }

    async openCopy(kind, path, after) {
      if (!this.definition || this.busy || this.$('macro-copy-dialog').open) return;
      const session = this.copySession = {kind,path,after,flow:this.flow,package:this.package};
      const dialog = this.$('macro-copy-dialog');
      const label = {targets:'Target',workflows:'Sequence',step:'Component block'}[kind];
      this.$('macro-copy-title').textContent = 'Copy '+label.toLowerCase()+' from macro';
      this.$('macro-copy-item-label').textContent = label;
      this.$('macro-copy-source').replaceChildren();
      this.$('macro-copy-item').replaceChildren();
      this.$('macro-copy-apply').disabled = true;
      this.$('macro-copy-status').textContent = 'Loading macros…';
      dialog.showModal();
      try {
        const packages = (await this.request('frameworkCatalog')).filter(p=>p.id!==session.package);
        if (this.copySession !== session || !dialog.open) return;
        for (const p of packages) this.$('macro-copy-source').add(new Option(p.name,p.id));
        if (packages.length) await this.loadCopySource();
        else this.$('macro-copy-status').textContent = 'Add another macro to copy items from it.';
      } catch (error) {
        if (this.copySession === session) this.$('macro-copy-status').textContent = error.message;
      }
    }

    async loadCopySource() {
      const session = this.copySession;
      const id = this.$('macro-copy-source').value;
      const select = this.$('macro-copy-item');
      const apply = this.$('macro-copy-apply');
      const status = this.$('macro-copy-status');
      const load = session.load = {};
      select.replaceChildren();
      apply.disabled = true;
      status.textContent = 'Loading items…';
      try {
        const response = await this.request('frameworkLoad',id);
        if (this.copySession !== session || session.load !== load || !this.$('macro-copy-dialog').open) return;
        session.source = normalize(response.definition);
        session.items = [];
        const add = (name,value)=>{
          select.add(new Option(name,String(session.items.length)));
          session.items.push(value);
        };
        if (session.kind === 'step') {
          const visit = (steps,location)=>{
            steps.forEach((step,index)=>{
              const title = location+' › '+(index+1)+'. '+(step.name || labels[step.action]);
              add(title,step);
              for (const [field,branch] of [['steps','Steps'],['thenSteps','Then'],['elseSteps','Otherwise']]) {
                if (step[field]) visit(step[field],title+' › '+branch);
              }
            });
          };
          for (const flow of Object.values(session.source.workflows)) visit(flow.steps,flow.name);
        } else {
          for (const [key,item] of Object.entries(session.source[session.kind])) add(item.name,key);
        }
        apply.disabled = !session.items.length;
        status.textContent = session.items.length ? 'Referenced items are copied with it.' : 'There are no items of this type in the source macro.';
      } catch (error) {
        if (this.copySession === session && session.load === load) status.textContent = error.message;
      }
    }

    applyCopy() {
      const session = this.copySession;
      if (!session?.source || session.package !== this.package) return;
      const value = session.items[this.$('macro-copy-item').selectedIndex];
      if (!value) return;
      try {
        this.insertLibraryItem(session.kind,session.source,value,session.flow,session.path,{after:session.after});
        this.$('macro-copy-dialog').close();
        if (session.kind==='step') this.$('framework-steps').querySelector('[data-step-selected] > summary')?.focus({preventScroll:true});
        else this.focusLibraryItem(session.kind);
        this.toast('Copied to draft.');
      } catch (error) {
        this.$('macro-copy-status').textContent = error.message;
      }
    }

    deleteFlow(id=this.flow){
      const d=this.definition;
      if(Object.keys(d.workflows).length===1){this.toast('Keep at least one sequence.',true);return;}
      if(d.entry===id){this.toast('Choose a different starting sequence before deleting this one.',true);return;}
      const used=[];
      const visit=steps=>steps.some(s=>s.workflow===id||s.then===id||s.otherwise===id||Object.values(s.routes||{}).includes(id)||['steps','thenSteps','elseSteps'].some(f=>s[f]&&visit(s[f])));
      for(const [key,flow] of Object.entries(d.workflows))if(key!==id&&visit(flow.steps))used.push(flow.name);
      if(used.length){this.toast('Sequence is used by: '+used.join(', ')+'. Remove those references first.',true);return;}
      delete d.workflows[id];if(this.flow===id)this.flow=Object.keys(d.workflows)[0];this.render();this.change();
    }
    id(prefix,ids){let i=1;while(ids.includes(prefix+'-'+i))i++;return prefix+'-'+i;}
    dirty(){return !!this.definition&&JSON.stringify(this.definition)!==this.saved;}
    change(){const pending=this.definition?Object.values(this.definition.targets).filter(t=>t.kind==='pattern'&&!t.pattern).map(t=>t.name):[];this.$('framework-save').disabled=this.busy||!this.dirty()||!!pending.length;this.$('framework-discard').disabled=this.busy||!this.dirty();this.$('framework-export-macro').disabled=this.busy||!!pending.length;this.$('framework-state').textContent=pending.length?'Capture required: '+pending.join(', '):this.dirty()?'Unsaved sequence changes':'Saved · revision '+this.revision;this.changed?.();}
    async open(force=false,id=this.package){PantheonKeyCapture.cancel();if(this.definition&&!force)return;try{const packages=await this.request('frameworkCatalog');if(!packages.some(p=>p.id===id))id=packages[0]?.id||'';this.$('framework-package').innerHTML=this.options(Object.fromEntries(packages.map(p=>[p.id,p])),id);this.$('framework-empty').hidden=!!id;this.$('framework-content').hidden=!id;this.$('framework-editor').hidden=false;this.$('framework-export-macro').disabled=!id;if(!id){this.package='';this.definition=null;this.saved='';return;}const data=await this.request('frameworkLoad',id);if(this.package!==id)this.$('framework-target-search').value='';this.package=id;this.definition=normalize(data.definition);this.revision=data.revision;this.saved=JSON.stringify(this.definition);this.render();this.change();}catch(e){this.toast(e.message,true);}}
    async save(){if(this.busy)return;this.busy=true;this.change();try{const data=await this.request('frameworkSave',{package:this.package,definition:this.definition,revision:this.revision});this.definition=normalize(data.definition);this.revision=data.revision;this.saved=JSON.stringify(this.definition);if(this.$('framework-package').selectedOptions[0])this.$('framework-package').selectedOptions[0].textContent=this.definition.name;this.toast(data.warnings?.length?data.warnings.join(' '):'Macro definition saved.');await this.catalogChanged?.();}catch(e){this.toast(e.message,true);}finally{this.busy=false;this.change();}}
    options(values,current,empty=false){return (empty?'<option value="">Continue with next step</option>':'')+(!empty&&!Object.hasOwn(values,current)?'<option value="">Select an option</option>':'')+Object.entries(values).map(([id,v])=>`<option value="${this.escape(id)}"${id===current?' selected':''}>${this.escape(v.name)}</option>`).join('');}
    actionOptions(current){const groups={'Common flows':['click-wait','scroll-option','dismiss','setting-call','camera','placements','match-result','call'],'Mouse and keyboard':['ocr-input','click-point','click','click-setting','move','walk','scroll','press','key'],'Conditions and loops':['wait','if','until','retry','repeat','for-setting'],'Timing and control':['delay','stop'],'Advanced result handling':['outcome']};return Object.entries(groups).map(([name,items])=>`<optgroup label="${name}">${items.map(a=>`<option value="${a}"${a===current?' selected':''}>${labels[a]}</option>`).join('')}</optgroup>`).join('');}
    renderSequenceTabs() {
      const list=this.$('framework-sequence-tabs'), scroll=list.scrollLeft;
      list.innerHTML=Object.entries(this.definition.workflows).map(([id,flow])=>{
        const active=id===this.flow;
        return `<button type="button" id="sequence-tab-${this.escape(id)}" role="tab" aria-controls="framework-sequence-body" aria-selected="${active}" tabindex="${active?0:-1}" data-library-item="${this.escape(id)}" title="${this.escape(flow.name)}">${this.escape(flow.name)}</button>`;
      }).join('');
      list.scrollLeft=scroll;
      this.$('framework-sequence-body').setAttribute('aria-labelledby','sequence-tab-'+this.flow);
    }

    renderTargetList() {
      const query=this.$('framework-target-search').value.trim().toLowerCase();
      const entries=Object.entries(this.definition.targets);
      const filtered=entries.filter(([id,target])=>[id,target.name,target.kind==='point'?'saved point':'findtext image'].some(text=>text.toLowerCase().includes(query)));
      const list=this.$('framework-target-list'),scroll=list.scrollTop;
      const icon=PantheonKeyCapture.icon;
      list.innerHTML=filtered.map(([id,target])=>{
        const point=target.kind==='point';
        const detail=point?'Point · '+target.x+', '+target.y:target.pattern?'FindText image':'Image · Capture required';
        return `<button type="button" class="target-list-item" data-library-item="${this.escape(id)}" aria-pressed="${id===this.target}" title="${this.escape(target.name)}">${icon(point?'target':'image')}<span><strong>${this.escape(target.name||'Untitled target')}</strong><small>${detail}</small></span></button>`;
      }).join('') || '<p class="editor-list-empty">'+(entries.length?'No matching targets.':'No targets yet.')+'</p>';
      list.scrollTop=scroll;
    }

    renderChoices(){
      this.renderSequenceTabs();
      this.renderTargetList();
      this.$('framework-entry').innerHTML=this.options(this.definition.workflows,this.definition.entry);
      this.refreshTargetMenus();
    }
    refreshTargetMenus(){
      const d=this.definition,targets=d.targets,images=Object.fromEntries(Object.entries(targets).filter(([,t])=>t.kind==='pattern'));
      const replace=(selector,values,empty)=>{for(const el of document.querySelectorAll(selector)){const value=el.value;el.innerHTML=(empty?'<option value="">'+empty+'</option>':'')+Object.entries(values).map(([id,t])=>`<option value="${this.escape(id)}">${this.escape(t.name)}</option>`).join('');el.value=Object.hasOwn(values,value)?value:'';}};
      replace('#play-managed-upgrades select[data-managed=panel],#play-managed-upgrades select[data-managed=affordable],#play-managed-upgrades select[data-managed=max]',images,'Select a captured image');
      replace('#play-placement-feedback select[data-feedback=panel],#play-placement-feedback select[data-feedback=money],#play-placement-feedback select[data-feedback=limit],#play-placement-feedback select[data-feedback=unique]',images,'Not configured');
      replace('#framework-setting-fields select[data-option-field=target]',targets,'No click mapping');
      replace('#framework-steps select[data-step-field=target]',targets,'Select an image / point');
      replace('#framework-steps select[data-step-field=dismiss]',targets,'Not configured');
      replace('#framework-steps select[data-step-field=lobby],#framework-steps select[data-step-field=replay],#framework-steps select[data-step-field=next],#framework-steps select[data-step-field=lobbyReady],#framework-steps select[data-step-field=matchReady]',images,'Select a captured image');
      replace('#framework-steps select[data-step-field=victory],#framework-steps select[data-step-field=defeat],#framework-steps select[data-step-field=ready]',images,'Select a captured image');
      replace('#framework-steps select[data-condition-field=target]',images,'Select a captured image');
    }
    renderIcon(){const icon=root.PantheonHub.macroIcons[this.definition.icon]||root.PantheonHub.macroIcons.pantheon;this.$('framework-icon-preview').src=icon.image;this.$('framework-icon-name').textContent=icon.name;}
    render(){if(!this.definition.workflows[this.flow])this.flow=Object.keys(this.definition.workflows)[0];if(!this.definition.targets[this.target])this.target=Object.keys(this.definition.targets)[0];this.$('framework-macro-name').value=this.definition.name;this.$('framework-game-id').value=this.definition.game;this.$('framework-run-mode').value=this.definition.runMode;this.renderIcon();this.renderChoices();this.renderFlow();this.renderTarget();this.settingsEditor.render();}
    resolve(path){let value=this.definition.workflows[this.flow].steps;for(const p of path.split('.').filter(Boolean))value=value[p];return value;}
    location(path){const parts=path.split('.'),index=Number(parts.pop());return {list:this.resolve(parts.join('.')),index};}
    addStep(path,action){const list=this.resolve(path);list.push(step(action,this.definition,this.id('step',list.map(s=>s.id))));this.renderFlow();this.change();}
    editStep(e){
      const el=e.target,path=el.closest('[data-step-path]')?.dataset.stepPath;if(path===undefined)return;const s=this.resolve(path);
      if(el.dataset.settingRoute!==undefined){s.routes[el.dataset.settingRoute]=el.value;}
      else if(el.dataset.conditionField){const value=this.resolve(el.dataset.conditionPath),field=el.dataset.conditionField;if(field==='setting')Object.assign(value,this.settingCheck(el.value));else value[field]=el.dataset.conditionNumber?Math.round(Number(el.value)*(el.dataset.seconds?1000:1)):el.value;}
      else if(el.dataset.parameter){s[el.dataset.parameter]=el.value?{setting:el.value}:Number(el.dataset.parameterMin);}
      else if(el.dataset.walkKey){const k=el.dataset.walkKey,opposite={W:'S',S:'W',A:'D',D:'A'};s.keys=s.keys.filter(v=>v!==k&&(!el.checked||v!==opposite[k]));if(el.checked)s.keys.push(k);}
      else if(el.dataset.stepField){const f=el.dataset.stepField;if(f==='action'){const loc=this.location(path);loc.list[loc.index]={...step(el.value,this.definition,s.id),...(s.name?{name:s.name}:{})};}else if(f==='key'){const names={space:'Space',enter:'Enter',tab:'Tab',esc:'Escape',escape:'Escape',ctrl:'Control',control:'Control',shift:'Shift',up:'Up',down:'Down',left:'Left',right:'Right'};s[f]=/^[a-z]$/i.test(el.value)?el.value.toUpperCase():names[el.value.toLowerCase()]||el.value;}else s[f]=el.type==='checkbox'?Number(el.checked):['stripSpaces','clear'].includes(f)?Number(el.value):el.type==='number'?Math.round(Number(el.value)*(el.dataset.seconds?1000:1)):el.value;}
      else return;
      if(s.action==='setting-call'&&el.dataset.stepField==='setting')s.routes=Object.fromEntries((this.definition.settings[s.setting]?.options||[]).map(o=>[o.value,s.routes?.[o.value]||'']));
      if(el.dataset.stepField&&!['action','target','route','setting','victoryAction','defeatAction'].includes(el.dataset.stepField)){
        const card=el.closest('[data-step-path]');
        if(card&&el.dataset.stepField==='name'){card.querySelector('summary strong').textContent=s.name||labels[s.action];card.querySelector('.step-action-label').textContent=s.name?labels[s.action]:'';}
        this.change();return;
      }
      this.renderFlow();this.change();
    }
    command(e){
      const b=e.target.closest('button');
      if (!b) return;
      e.preventDefault();
      if(b.dataset.addGroupStep!==undefined){const action=b.parentElement.querySelector('select').value;this.groupActions.set(this.flow+':'+b.dataset.addGroupStep,action);this.addStep(b.dataset.addGroupStep,action);return;}
      if(b.dataset.conditionCommand){const c=this.resolve(b.dataset.conditionPath),cmd=b.dataset.conditionCommand;if(cmd==='selected-image'){const id=Object.keys(this.definition.settings).find(id=>this.definition.settings[id].type==='select');c.checks.push({selectedImage:id||'',state:'present'});}else if(cmd==='remove')c.checks.splice(Number(b.dataset.checkIndex),1);else if(cmd==='setting'){const id=Object.keys(this.definition.settings)[0];c.checks.push(this.settingCheck(id));}else{const image=Object.keys(this.definition.targets).find(id=>this.definition.targets[id].kind==='pattern')||'';c.checks.push(cmd==='group'?condition(image):{target:image,state:'present'});}this.renderFlow();this.change();return;}
      if(!b.dataset.stepCommand)return;const path=b.closest('[data-step-path]').dataset.stepPath,{list,index}=this.location(path),cmd=b.dataset.stepCommand;
      const card=b.closest('[data-step-path]');
      if (cmd==='fold') { this.toggleStep(card); return; }
      if (cmd==='copy') { this.copyLibraryItem('step',path); return; }
      if(cmd==='simplify-result'){const old=list[index],simple=step('match-result',this.definition,old.id);Object.assign(simple,{victory:old.victory,defeat:old.defeat,timeoutMs:old.timeoutMs,...(old.name?{name:old.name}:{})});const checks=[];const visit=steps=>{for(const s of steps){for(const c of s.condition?.checks||[])if(c.setting)checks.push(c.setting);for(const f of ['steps','thenSteps','elseSteps'])if(s[f])visit(s[f]);}};visit(old.thenSteps||[]);const setting=checks.find(id=>this.definition.settings[id]?.type==='select'&&this.definition.settings[id].options.every(o=>[simple.lobby,simple.replay,simple.next].filter(Boolean).includes(o.target)));if(setting){simple.victoryAction='setting';simple.victorySetting=setting;}if((old.elseSteps||[]).length)simple.defeatAction='replay';list[index]=simple;this.toast('Simple result handler created as a draft. Review its images and choices before saving.');}
      else if(cmd==='delete')list.splice(index,1);
      else if(cmd==='insert')list.splice(index+1,0,step('click-point',this.definition,this.id('step',list.map(s=>s.id))));
      else if(cmd==='ocr-region'){this.pickOcrRegion(path,b);return;}
      else if(cmd==='point'){this.pickPoint(path,b);return;}
      else{const dest=index+(cmd==='up'?-1:1);if(dest>=0&&dest<list.length)[list[index],list[dest]]=[list[dest],list[index]];}
      this.renderFlow();this.change();
    }
    async pickOcrRegion(path,button){button.disabled=true;button.textContent='Selecting text region…';try{const result=await this.select();if(!result||result.cancelled)return;const region=result.region||this.capture().region;Object.assign(this.resolve(path),{readX:region.x,readY:region.y,width:region.width,height:region.height});this.change();}finally{this.renderFlow();}}
    async pickPoint(path,button){button.disabled=true;button.textContent='Selecting coordinates…';try{const p=await this.point();if(!p||p.cancelled)return;const s=this.resolve(path);s.x=p.x;s.y=p.y;this.change();}finally{this.renderFlow();}}
    settingCheck(id){const s=this.definition.settings[id];return {setting:id,comparison:Array.isArray(s.default)?'contains':'equals',value:Array.isArray(s.default)?s.options[0]?.value||'':s.default};}
    settingConditionHTML(check,path){
      const spec=this.definition.settings[check.setting];if(!spec)return '<p>Choose a setting</p>';
      const list=Array.isArray(spec.default),operators=list?{contains:'Contains','not-contains':'Does not contain'}:{equals:'Equals','not-equals':'Does not equal',...(spec.type==='number'?{greater:'Greater than',less:'Less than'}:{})};
      let value='';const attrs=`data-condition-field="value" data-condition-path="${path}"`;
      if(spec.type==='key')value=`<input ${attrs} value="${this.escape(check.value)}" maxlength="12">`;else if(spec.type==='number')value=`<input type="number" ${attrs} data-condition-number="1" value="${check.value}" min="${spec.min}" max="${spec.max}">`;
      else{const options=spec.options||[{value:0,label:'Disabled'},{value:1,label:'Enabled'}];value=`<select ${attrs}${spec.options?'':' data-condition-number="1"'}>${options.map(o=>`<option value="${this.escape(o.value)}"${o.value===check.value?' selected':''}>${this.escape(o.label)}</option>`).join('')}</select>`;}
      return `<div class="flow-image-choice"><label>Setting<select data-condition-field="setting" data-condition-path="${path}">${this.options(Object.fromEntries(Object.entries(this.definition.settings).map(([id,s])=>[id,{name:s.label}])),check.setting)}</select></label><label>Comparison<select data-condition-field="comparison" data-condition-path="${path}">${Object.entries(operators).map(([id,label])=>`<option value="${id}"${id===check.comparison?' selected':''}>${label}</option>`).join('')}</select></label><label>Value${value}</label></div>`;
    }
    renderTarget(){
      const t=this.definition.targets[this.target];
      this.$('framework-target-tools').hidden=!t;
      for (const id of ['framework-capture-target','framework-use-capture','framework-capture-bounds','framework-full-client','framework-test-target']) this.$(id).hidden=t?.kind!=='pattern';
      if(!t){this.$('framework-target-fields').innerHTML='<p>No images or saved points</p>';this.$('framework-references').textContent='';this.$('framework-full-client').hidden=true;return;}
      const input=(f,label,min,max)=>`<label>${label}<input data-target-field="${f}" type="number" min="${min}" max="${max}" value="${t[f]}"></label>`;
      this.$('framework-target-fields').innerHTML=`<div class="framework-fields target-identity"><label>Name<input data-target-field="name" maxlength="80" value="${this.escape(t.name)}"></label><label>Type<select data-target-field="kind"><option value="point"${t.kind==='point'?' selected':''}>Saved coordinate</option><option value="pattern"${t.kind==='pattern'?' selected':''}>FindText image</option></select></label></div><div class="framework-fields target-coordinates">${input('x',t.kind==='pattern'?'Search X':'X',0,799)}${input('y',t.kind==='pattern'?'Search Y':'Y',0,599)}${t.kind==='pattern'?input('width','Search width',1,800)+input('height','Search height',1,600):''}</div>${t.kind==='pattern'?`${this.preview(this.target)}<label class="findtext-field">FindText capture<textarea class="findtext-code" data-target-field="pattern" rows="4" wrap="soft" maxlength="100000" spellcheck="false" autocapitalize="off" autocomplete="off">${this.escape(t.pattern)}</textarea></label><div class="framework-fields">${input('error1','Foreground mismatch (%)',0,20)}${input('error0','Background mismatch (%)',0,20)}${input('offsetX','Click offset X',-799,799)}${input('offsetY','Click offset Y',-599,599)}</div>`:''}`;
      const used=Object.values(this.definition.workflows).filter(f=>JSON.stringify(f.steps).includes('"'+this.target+'"')).map(f=>f.name);
      this.$('framework-references').textContent='Used by: '+(used.join(', ')||'No sequences');this.paintPreviews(this.$('framework-target-fields'));
    }
    preview(target){return `<div class="flow-image-preview" data-pattern-target="${this.escape(target)}"><canvas aria-label="FindText image preview"></canvas><small></small></div>`;}
    paintPreviews(host){for(const box of host.querySelectorAll('[data-pattern-target]')){
      const canvas=box.querySelector('canvas'),label=box.querySelector('small'),t=this.definition.targets[box.dataset.patternTarget];
      try{const variants=root.PantheonDeveloper.decodePattern(t?.pattern),p=variants[0];canvas.hidden=false;canvas.width=p.width;canvas.height=p.height;const ctx=canvas.getContext('2d'),image=ctx.createImageData(p.width,p.height);for(let i=0;i<p.bits.length;i++){const v=p.bits[i]==='1'?0:255;image.data.set([v,v,v,255],i*4);}ctx.putImageData(image,0,0);label.textContent=`${p.width} × ${p.height}${variants.length>1?' · '+variants.length+' variants':''}`;}catch{canvas.hidden=true;label.textContent='Capture an image';}
    }}
    selectedImageHTML(check,path){const settings=Object.fromEntries(Object.entries(this.definition.settings).filter(([,s])=>s.type==='select').map(([id,s])=>[id,{name:s.label}]));return `<div class="flow-image-choice"><label>Selected option image<select data-condition-field="selectedImage" data-condition-path="${path}">${this.options(settings,check.selectedImage)}</select></label><label>Check<select data-condition-field="state" data-condition-path="${path}"><option value="present"${check.state==='present'?' selected':''}>Is detected</option><option value="absent"${check.state==='absent'?' selected':''}>Is not detected</option></select></label></div>`;}
    conditionHTML(c,path,depth=0){
      const images=Object.fromEntries(Object.entries(this.definition.targets).filter(([,t])=>t.kind==='pattern'));
      return `<div class="flow-condition"><label>Match<select data-condition-field="operator" data-condition-path="${path}"><option value="all"${c.operator==='all'?' selected':''}>All conditions (AND)</option><option value="any"${c.operator==='any'?' selected':''}>Any condition (OR)</option></select></label>${c.checks.map((check,i)=>{
        const p=path+'.checks.'+i;
        return `<div class="flow-image-check">${check.operator?this.conditionHTML(check,p,depth+1):check.selectedImage!==undefined?this.selectedImageHTML(check,p):check.setting?this.settingConditionHTML(check,p):`<div class="flow-image-choice"><label>Image<select data-condition-field="target" data-condition-path="${p}">${this.options(images,check.target)}</select></label><label>Check<select data-condition-field="state" data-condition-path="${p}"><option value="present"${check.state==='present'?' selected':''}>Is detected</option><option value="absent"${check.state==='absent'?' selected':''}>Is not detected</option></select></label></div>${this.preview(check.target)}`}<button class="button" data-condition-command="remove" data-condition-path="${path}" data-check-index="${i}"${c.checks.length===1?' disabled':''}>Remove condition</button></div>`;
      }).join('')}<div class="developer-toolbar"><button class="button" data-condition-command="selected-image" data-condition-path="${path}"${c.checks.length>=8||!Object.values(this.definition.settings).some(s=>s.type==='select')?' disabled':''}>Add selected option image</button><button class="button" data-condition-command="image" data-condition-path="${path}"${c.checks.length>=8?' disabled':''}>Add image</button><button class="button" data-condition-command="setting" data-condition-path="${path}"${c.checks.length>=8||!Object.keys(this.definition.settings).length?' disabled':''}>Add setting / flag</button>${depth<3?`<button class="button" data-condition-command="group" data-condition-path="${path}"${c.checks.length>=8?' disabled':''}>Add AND / OR group</button>`:''}</div></div>`;
    }
    foldKey(path){let prefix='',ids=[];for(const part of path.split('.')){prefix+=(prefix?'.':'')+part;ids.push(/^\d+$/.test(part)?this.resolve(prefix).id:part);}return this.package+':'+this.flow+':'+ids.join('/');}
    groupHTML(steps,path,label){return `<section class="flow-step-group"><h4>${label}</h4>${this.stepsHTML(steps,path)}<div class="developer-toolbar"><select aria-label="Action to add">${this.actionOptions(this.groupActions.get(this.flow+':'+path)||'click-point')}</select><button class="button" data-add-group-step="${path}">Add step</button><button type="button" class="button" data-paste-step="${path}">Paste step</button></div></section>`;}
    stepsHTML(steps,parent=''){
      return `<div class="flow-step-list" data-list-path="${parent}">`+steps.map((s,i)=>{
        const path=(parent?parent+'.':'')+i;
        const select=(f,title,values,empty=false)=>`<label>${title}<select data-step-field="${f}">${this.options(values,s[f],empty)}</select></label>`;
        const number=(f,title,min=0,max=60000)=>{const time=f.endsWith('Ms');title=title.replace(/\(ms\)/g,'(seconds)');const settings=Object.entries(this.definition.settings).filter(([,spec])=>spec.type==='number'?spec.min>=min&&spec.max<=max:['toggle','checkbox'].includes(spec.type)&&min===0&&max===1),ref=s[f]&&typeof s[f]==='object';return `<label>${title}${settings.length?`<select data-parameter="${f}" data-parameter-min="${min}"><option value="">Fixed value</option>${settings.map(([id,spec])=>`<option value="${this.escape(id)}"${ref&&s[f].setting===id?' selected':''}>Setting: ${this.escape(spec.label)}</option>`).join('')}</select>`:''}${ref?'':`<input type="number" data-step-field="${f}" min="${time?min/1000:min}" max="${time?max/1000:max}" step="${time?0.001:1}" ${time?'data-seconds="1"':''} value="${time?s[f]/1000:s[f]}">`}</label>`;};
        const choices=(f,title,values)=>`<label>${title}<select data-step-field="${f}">${Object.entries(values).map(([value,text])=>`<option value="${value}"${String(s[f])===value?' selected':''}>${text}</option>`).join('')}</select></label>`;
        let fields='',blocks='';
        if(s.action==='ocr-input')fields=number('readX','Text region X',0,799)+number('readY','Text region Y',0,599)+number('width','Text region width',1,800)+number('height','Text region height',1,600)+'<button class="button primary" data-step-command="ocr-region">Select text region in Roblox</button>'+number('x','Textbox X',0,799)+number('y','Textbox Y',0,599)+'<button class="button" data-step-command="point">Select textbox position in Roblox</button>'+choices('filter','Read as',{digits:'Digits only',alphanumeric:'Letters and digits',text:'Plain text'})+choices('stripSpaces','Remove spaces',{'0':'No','1':'Yes'})+choices('clear','Replace existing text',{'0':'No','1':'Yes'})+number('minLength','Minimum text length',1,128)+number('maxLength','Maximum text length',1,128)+choices('missing','If text is empty or invalid',{error:'Stop with error',skip:'Continue without typing'});
        if(s.action==='camera')fields=number('zoomIn','Zoom in ticks',1,50)+number('zoomOut','Zoom out ticks',1,50)+number('tilt','Look down movement',30,299);
        if(s.action==='placements')fields=select('route','Placement map',{selected:{name:"Player’s selected setup"},shared:{name:'Shared setup'},setting:{name:'Map from dropdown setting'},...(this.definition.maps||{})})+choices('fallback','If map has no placements',{shared:'Use Shared setup',error:'Stop with error'})+(s.route==='setting'?select('setting','Stage / map dropdown',Object.fromEntries(Object.entries(this.definition.settings).filter(([,v])=>v.type==='select').map(([id,v])=>[id,{name:v.label}]))):'');
        if(s.action==='click-point'||s.action==='move')fields=number('x','X',0,799)+number('y','Y',0,599)+(s.action==='click-point'?choices('button','Mouse button',{Left:'Left click',Right:'Right click'}):'')+'<button class="button primary" data-step-command="point">Select coordinates</button>';
        if(s.action==='click-setting'){const settings=Object.fromEntries(Object.entries(this.definition.settings).filter(([,s])=>['select','priority','multiselect'].includes(s.type)).map(([id,s])=>[id,{name:s.label}]));fields=select('setting','Use selected option from',settings)+number('timeoutMs','Wait up to (ms)')+choices('button','Mouse button',{Left:'Left click',Right:'Right click'})+choices('missing','If not detected',{error:'Stop with error',skip:'Continue to next step'});}
        if(s.action==='click'||(s.action==='wait'&&!s.condition))fields=select('target','Image / saved point',this.definition.targets)+number('timeoutMs','Wait up to (ms)',s.action==='wait'?100:0,s.action==='wait'?3600000:60000)+choices('missing','If not detected',{error:'Stop with error',skip:'Continue to next step'})+(s.action==='click'?choices('button','Mouse button',{Left:'Left click',Right:'Right click'}):'');
        if(s.action==='delay'||s.action==='key'||s.action==='walk')fields+=number('durationMs',s.action==='walk'?'Walk for (ms)':'Duration (ms)',s.action==='delay'?0:30,s.action==='walk'?30000:60000);
        if(s.action==='key'||s.action==='press')fields+=`<label>Key<input data-step-field="key" value="${this.escape(s.key)}" maxlength="12"></label>`;
        if(s.action==='press')fields+=number('count','Press count',1,20)+number('intervalMs','Delay between presses (ms)',0,5000);
        if(s.action==='walk')fields+=`<fieldset class="flow-walk"><legend>Hold directions together</legend>${['W','A','S','D'].map(k=>`<label><input type="checkbox" data-walk-key="${k}"${s.keys.includes(k)?' checked':''}>${k}</label>`).join('')}</fieldset><label class="flow-checkbox"><input type="checkbox" data-step-field="sprint"${s.sprint?' checked':''}>Sprint</label>`+choices('sprintKey','Sprint key',{Shift:'Shift',Control:'Control'});
        if(s.action==='scroll')fields=choices('direction','Direction',{Up:'Scroll up',Down:'Scroll down'})+number('ticks','Wheel ticks each time',1,10)+number('count','Repeat scroll',1,100)+number('intervalMs','Delay between scrolls (ms)',0,5000);
        if(s.action==='call')fields=select('workflow','Sequence',Object.fromEntries(Object.entries(this.definition.workflows).filter(([id])=>id!==this.flow)));
        if(s.action==='repeat'){fields=number('count','Repeat count',1,20);blocks=this.groupHTML(s.steps,path+'.steps','Repeat these steps');}
        if(s.action==='for-setting'){fields=select('setting','Selected list / priority',Object.fromEntries(Object.entries(this.definition.settings).filter(([,s])=>['priority','multiselect'].includes(s.type)).map(([id,s])=>[id,{name:s.label}])));blocks=this.groupHTML(s.steps,path+'.steps','For each selected item, in saved order');}
        if(s.action==='if'&&s.condition)blocks=this.conditionHTML(s.condition,path+'.condition')+this.groupHTML(s.thenSteps,path+'.thenSteps','Then')+this.groupHTML(s.elseSteps,path+'.elseSteps','Otherwise');
        if(s.action==='if'&&!s.condition)fields=select('target','Target',this.definition.targets)+select('then','Then run',this.definition.workflows,true)+select('otherwise','Otherwise run',this.definition.workflows,true);
        if(s.action==='click-wait'||s.action==='dismiss'){fields=select('target','Click target',this.definition.targets)+select('ready','Continue when this image appears',Object.fromEntries(Object.entries(this.definition.targets).filter(([,t])=>t.kind==='pattern')))+choices('button','Mouse button',{Left:'Left click',Right:'Right click'})+number('timeoutMs',s.action==='click-wait'?'Wait after each click (seconds)':'Maximum duration (seconds)',100,60000)+number('intervalMs','Delay between attempts (seconds)',100,5000)+(s.action==='click-wait'?number('attempts','Maximum clicks',1,5):'');}
        if(s.action==='scroll-option')fields=select('setting','Dropdown setting',Object.fromEntries(Object.entries(this.definition.settings).filter(([,v])=>v.type==='select').map(([k,v])=>[k,{name:v.label}])))+number('x','Scroll area X',0,799)+number('y','Scroll area Y',0,599)+'<button class="button" data-step-command="point">Select scroll position</button>'+choices('direction','Direction',{Down:'Down',Up:'Up'})+number('maxScrolls','Maximum scrolls',1,100)+number('timeoutMs','Maximum duration (seconds)',100,60000)+number('intervalMs','Delay between scrolls (seconds)',100,5000);
        if(s.action==='setting-call'){fields=select('setting','Dropdown setting',Object.fromEntries(Object.entries(this.definition.settings).filter(([,v])=>v.type==='select').map(([k,v])=>[k,{name:v.label}])));for(const o of this.definition.settings[s.setting]?.options||[])fields+=`<label>${this.escape(o.label)}<select data-setting-route="${this.escape(o.value)}">${this.options(this.definition.workflows,s.routes[o.value])}</select></label>`;}
        if(s.action==='match-result'){const images=Object.fromEntries(Object.entries(this.definition.targets).filter(([,t])=>t.kind==='pattern')),settings=Object.fromEntries(Object.entries(this.definition.settings).filter(([,v])=>v.type==='select').map(([k,v])=>[k,{name:v.label}]));fields='<div class="result-handler-section"><h4>1. Detect result</h4>'+select('victory','Victory image',images)+select('defeat','Defeat image',images)+'</div><div class="result-handler-section"><h4>2. Dismiss rewards</h4>'+select('dismiss','Next / reward dismissal target',this.definition.targets,true)+select('lobby','Lobby button image',images)+'</div><div class="result-handler-section"><h4>3. Choose next action</h4>'+select('replay','Replay button image (optional)',images,true)+select('next','Next stage button image (optional)',images,true)+['victory','defeat'].map(side=>choices(side+'Action','After '+side,{lobby:'Return to lobby',replay:'Replay',next:'Next stage',setting:'Use player dropdown setting'})+(s[side+'Action']==='setting'?select(side+'Setting','Player setting',settings):'')).join('')+'<p>Replay and Next stage fall back to Lobby when unavailable. Map player dropdown options to these button images.</p></div><div class="result-handler-section"><h4>4. Confirm destination</h4>'+select('lobbyReady','Lobby ready image',images)+select('matchReady','Match ready image',images)+'</div>';blocks='<details class="result-handler-timing"><summary>Timing</summary><div class="framework-fields">'+number('timeoutMs','Wait for result (seconds)',100,3600000)+number('menuTimeoutMs','Dismiss rewards within (seconds)',100,120000)+number('transitionTimeoutMs','Wait for destination (seconds)',100,180000)+number('intervalMs','Delay between reward clicks (seconds)',100,5000)+'</div></details>';}
        if(s.action==='outcome'){const images=Object.fromEntries(Object.entries(this.definition.targets).filter(([,t])=>t.kind==='pattern'));fields=select('victory','Victory image',images)+select('defeat','Defeat image',images)+number('timeoutMs','Wait up to (seconds)',100,3600000);blocks='<button type="button" class="button" data-step-command="simplify-result">Replace branches with simple result handler</button><p>This replaces custom result steps in the draft. Discard draft restores the saved version.</p><details><summary>Custom victory and defeat steps</summary>'+this.groupHTML(s.thenSteps,path+'.thenSteps','On victory')+this.groupHTML(s.elseSteps,path+'.elseSteps','On defeat')+'</details>';}
        if(s.action==='wait'&&s.condition){fields=number('timeoutMs','Wait up to (ms)',100,3600000)+choices('missing','If time runs out',{error:'Stop with error',skip:'Continue to next step'});blocks=this.conditionHTML(s.condition,path+'.condition');}
        if(s.action==='retry'||s.action==='until'){
          fields=(s.action==='retry'?number('attempts','Maximum attempts',1,20):'')+number('timeoutMs',s.action==='retry'?'Wait for images after each attempt (ms)':'Stop checking after (ms)',100,s.action==='until'?3600000:60000)+number('intervalMs','Delay between attempts / checks (ms)',100,10000)+choices('failure','If unsuccessful',{error:'Stop with error',continue:'Continue to next step'});
          blocks=s.action==='retry'?this.groupHTML(s.steps,path+'.steps','Try these steps')+'<h4>Continue when</h4>'+this.conditionHTML(s.condition,path+'.condition'):this.conditionHTML(s.condition,path+'.condition')+this.groupHTML(s.steps,path+'.steps','Repeat while waiting');
        }
        const image=s.target&&this.definition.targets[s.target]?.kind==='pattern'?this.preview(s.target):'';
        const fold=this.foldKey(path),svg=PantheonKeyCapture.icon;
        return `<details class="framework-step" data-flow-step="${i}" data-step-path="${path}" data-fold-key="${this.escape(fold)}"${this.openSteps.has(fold)?' open':''}${this.selectedStep===fold?' data-step-selected':''}><summary class="framework-step-top"><button type="button" class="icon-button fold-indicator" aria-label="Expand or collapse step" aria-expanded="${this.openSteps.has(fold)}" data-step-command="fold">${svg('chevron-down')}</button><span class="sequence-grip" aria-label="Drag step">${svg('grip-vertical')}</span><span class="step-order">${i+1}</span><strong>${this.escape(s.name||labels[s.action])}</strong><span class="step-action-label">${s.name?labels[s.action]:''}</span><div class="flow-step-commands"><button type="button" class="icon-button" aria-label="Move step up" data-step-command="up"${i===0?' disabled':''}>${svg('arrow-up')}</button><button type="button" class="icon-button" aria-label="Move step down" data-step-command="down"${i===steps.length-1?' disabled':''}>${svg('arrow-down')}</button><button type="button" class="icon-button" aria-label="Copy step" data-step-command="copy">${svg('layers')}</button><button type="button" class="icon-button" aria-label="Remove step" data-step-command="delete">${svg('trash')}</button></div></summary><div class="sequence-step-body"><div class="framework-fields"><label>Step name<input data-step-field="name" maxlength="80" value="${this.escape(s.name||'')}" placeholder="${labels[s.action]}"></label><label>Action<select data-step-field="action" aria-label="Step action">${this.actionOptions(s.action)}</select></label></div><div class="developer-toolbar"><button class="button" data-step-command="insert">Insert below</button></div><div class="framework-step-fields">${fields}</div>${root.PantheonComponentGuide?.[s.action]?`<div class="component-help"><span>${this.escape(root.PantheonComponentGuide[s.action].description)}</span><button class="button" data-component-help="${s.action}">Example</button></div>`:''}${image}${blocks}</div></details>`;
      }).join('')+(steps.length?'':'<p class="flow-empty">No steps</p>')+'</div>';
    }
    renderFlow(){
      const host=this.$('framework-steps'),restore=root.PantheonEditorView?.capture(host);
      for(const card of host.querySelectorAll('details[data-fold-key]'))card.open?this.openSteps.add(card.dataset.foldKey):this.openSteps.delete(card.dataset.foldKey);
      const f=this.definition.workflows[this.flow];host.innerHTML=this.stepsHTML(f.steps);this.paintPreviews(host);this.updatePasteButtons();restore?.();
    }
  }
  root.FrameworkEditor=FrameworkEditor;root.PantheonFlowActions={actions,labels,step,normalize};
  if(typeof module!=='undefined'&&module.exports)module.exports={actions,labels,step,normalize};
})(globalThis);
