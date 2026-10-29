function __rev(v){ return (v && typeof v==='object' && v.__d) ? new Date(v.__d) : v; }
var __SHEETS = {};
Object.keys(__DATA).forEach(function(n){ __SHEETS[n] = __DATA[n].map(function(r){ return r.map(__rev); }); });
function __mkSheet(name){
  var g = function(){ return __SHEETS[name]; };
  function width(){ var w=0; g().forEach(function(r){ for(var i=r.length-1;i>=0;i--){ if(r[i]!==''&&r[i]!=null){ w=Math.max(w,i+1); break; } } }); return w; }
  function ensure(r,c){ var d=g(); while(d.length<r) d.push([]); for(var i=0;i<d.length;i++){ while(d[i].length<c) d[i].push(''); } }
  function store(v){ if(typeof v==='string' && v.charAt(0)==="'") return v.slice(1); if(typeof v==='string' && /^\d{4}-\d{2}$/.test(v)) return new Date(v+'-01T00:00:00'); return v; }
  var sh = {
    getName:function(){return name;},
    getLastRow:function(){ var d=g(); for(var i=d.length-1;i>=0;i--){ if(d[i].some(function(x){return x!==''&&x!=null;})) return i+1; } return 0; },
    getLastColumn:function(){ return width(); },
    getRange:function(r,c,nr,nc){ nr=nr||1; nc=nc||1; return {
      getValues:function(){ ensure(r+nr-1,c+nc-1); var out=[]; for(var i=0;i<nr;i++){ out.push(g()[r-1+i].slice(c-1,c-1+nc).map(function(x){return x==null?'':x;})); } return out; },
      setValues:function(v){ if(v.length!==nr||v[0].length!==nc) throw new Error('setValues: dimensiones no calzan '+v.length+'x'+v[0].length+' vs '+nr+'x'+nc); ensure(r+nr-1,c+nc-1); for(var i=0;i<nr;i++) for(var j=0;j<nc;j++) g()[r-1+i][c-1+j]=store(v[i][j]); return this; },
      setValue:function(v){ ensure(r,c); g()[r-1][c-1]=store(v); return this; }
    }; },
    getDataRange:function(){ return this.getRange(1,1,this.getLastRow(),this.getLastColumn()); }
  };
  return sh;
}
var __SS = { getSheetByName:function(n){ return __SHEETS[n]? __mkSheet(n):null; }, getSheets:function(){ return Object.keys(__SHEETS).map(__mkSheet); } };
var SpreadsheetApp = { openById:function(){ return __SS; }, getActiveSpreadsheet:function(){ return __SS; }, getUi:function(){ throw new Error('no ui'); } };
var PropertiesService = { getScriptProperties:function(){ return { getProperty:function(){ return null; } }; } };
var Utilities = { formatDate:function(d,tz,f){ function p(n){return ('0'+n).slice(-2);} return f.replace('yyyy',d.getFullYear()).replace('MM',p(d.getMonth()+1)).replace('dd',p(d.getDate())).replace('HH',p(d.getHours())).replace('mm',p(d.getMinutes())); } };
var Session = { getActiveUser:function(){ return { getEmail:function(){ return 'c.snmartin@gmail.com'; } }; } };
var LockService = { getScriptLock:function(){ return { waitLock:function(){}, releaseLock:function(){} }; } };
var ScriptApp = { getService:function(){ return { getUrl:function(){ return 'https://script.google.com/macros/s/X/exec'; } }; } };
var __calls = [];
var google = { script: { run: (function mk(ok, fail){
  return new Proxy({}, { get:function(_, k){
    if(k==='withSuccessHandler') return function(f){ return mk(f, fail); };
    if(k==='withFailureHandler') return function(f){ return mk(ok, f); };
    return function(){ var args=JSON.parse(JSON.stringify(Array.prototype.slice.call(arguments))); __calls.push(k);
      setTimeout(function(){ try{ var r = window[k].apply(null,args); r = JSON.parse(JSON.stringify(r)); ok && ok(r); } catch(e){ console.error('SERVER ERROR', k, e); fail && fail(e); } }, 30); };
  }});
})() } };
