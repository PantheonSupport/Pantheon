(function(root){
  'use strict';

  function copyItem(destination, source, kind, value, sequence, listPath, {reuseReferences=false, after}={}) {
    const draft = structuredClone(destination);
    const references = {targets:new Map(), workflows:new Map(), settings:new Map(), maps:new Map()};

    function nextId(items, prefix) {
      let index = 1;
      while (Object.hasOwn(items, prefix+'-'+index)) index++;
      return prefix+'-'+index;
    }

    function copyReference(collection, id) {
      if (!id) return id;
      const names = references[collection];
      if (names.has(id)) return names.get(id);
      const from = source[collection] || {};
      if (!Object.hasOwn(from,id)) throw Error('The source macro is missing a reference to '+id+'.');
      if (collection === 'maps' && source.game !== destination.game)
        throw Error('Copy placement maps between macros for the same game.');
      const to = draft[collection] ||= {};
      if (reuseReferences && (collection !== kind || id !== value) && Object.hasOwn(to,id)) {
        names.set(id,id);
        return id;
      }
      const item = structuredClone(from[id]);
      if (collection === 'settings' && item.type === 'key' && item.control) {
        const existing = Object.keys(to).find(key=>to[key].type==='key' && to[key].control===item.control);
        if (existing) {
          names.set(id,existing);
          return existing;
        }
      }
      const prefixes = {targets:'target',workflows:'sequence',settings:'setting',maps:'map'};
      const newId = Object.hasOwn(to,id) ? nextId({...from,...to},prefixes[collection]) : id;
      names.set(id,newId);
      to[newId] = item;
      if (collection === 'workflows') item.steps.forEach(rewrite);
      if (collection === 'settings') {
        for (const option of item.options || []) {
          if (option.target) option.target = copyReference('targets',option.target);
          if (option.map) option.map = copyReference('maps',option.map);
        }
      }
      if (collection === 'maps' && item.parent) item.parent = copyReference('maps',item.parent);
      return newId;
    }

    function rewrite(item) {
      if (!item || typeof item !== 'object') return;
      if (Array.isArray(item)) {
        item.forEach(rewrite);
        return;
      }
      const targetFields = ['target','ready','victory','defeat','dismiss','lobby','replay','next','lobbyReady','matchReady'];
      for (const [field,value] of Object.entries(item)) {
        if (typeof value === 'object') {
          if (field === 'routes') {
            for (const key of Object.keys(value)) value[key] = copyReference('workflows',value[key]);
          } else rewrite(value);
        } else if (value && targetFields.includes(field)) {
          item[field] = copyReference('targets',value);
        } else if (value && ['setting','selectedImage','victorySetting','defeatSetting'].includes(field)) {
          item[field] = copyReference('settings',value);
        } else if (value && ['workflow','then','otherwise'].includes(field)) {
          item[field] = copyReference('workflows',value);
        } else if (field === 'route' && !['setting','shared','selected'].includes(value)) {
          item[field] = copyReference('maps',value);
        }
      }
    }

    let id;
    if (kind === 'step') {
      const flow = draft.workflows[sequence];
      if (!flow) throw Error('Select a destination sequence first.');
      let list = flow.steps;
      for (const part of listPath.split('.').filter(Boolean)) list = list?.[part];
      if (!Array.isArray(list)) throw Error('The destination step group no longer exists.');
      if (list.length >= 100) throw Error('The destination step group already has 100 steps.');
      const item = structuredClone(value);
      rewrite(item);
      item.id = nextId(Object.fromEntries(list.map(s=>[s.id,true])),'step');
      list.splice(after === undefined ? list.length : after+1,0,item);
      id = item.id;
    } else {
      id = copyReference(kind,value);
    }
    for (const [collection,limit] of Object.entries({targets:128,workflows:32,settings:32,maps:48})) {
      if (Object.keys(draft[collection] || {}).length > limit)
        throw Error('This copy would exceed the macro limit for '+collection+'.');
    }
    return {draft,id};
  }

  root.PantheonMacroCopy = {copyItem};
  if (typeof module !== 'undefined') module.exports = {copyItem};
})(globalThis);
