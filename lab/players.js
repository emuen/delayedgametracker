/* Players: headshots and roster details from the open nflverse dataset (players.json, refreshed daily
   by .github/workflows/players.yml). Images are the NFL's own headshot URLs, shown directly and
   resized by the image server; a neutral silhouette stands in when a photo is missing or won't load.

   Players.ready(cb)            load once (lazy), then cb()
   Players.byId(espnId)         the player with this ESPN athlete id, or null
   Players.find(name, teams)    by "D.Achane" / "De'Von Achane", limited to a team code or list (["MIA","NYJ"]); null if unknown or ambiguous
   Players.warm(teams)          preload the active players' headshots (skill players first) for team codes (["LAR","SEA"]), once per team, a few at a time
   Players.preload(names,teams) preload just these players' headshots (the faces a score is about to show)
   Players.imgOf(espnId)        a shared, CORS-enabled Image for drawing in the chart (starts loading if needed), or null
   Players.onChange(fn)         fn() runs (debounced) when the data or a photo arrives, so pictures can be redrawn
   Players.face(p, opts)        HTML for a framed headshot with the jersey number on a plate at the bottom.
                                opts: {size: px (default 44, the size that is preloaded), num: override, bg/ink: plate colours (team colours)} */
var Players=(function(){
  var SRC=/\/(beta|lab)\/[^\/]*$/.test(location.pathname)?"../players.json":"players.json";   /* one shared file in the site root */
  var IMG="https://static.www.nfl.com/image/", D=null, byName={}, waiting=[], loading=false;
  function key(n){return String(n||"").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g,"").replace(/[^a-z]/g,"")}
  function shortOf(full){var w=String(full||"").replace(/\s+(Jr|Sr|II|III|IV)\.?$/,"").split(/\s+/);return w.length>1?w[0][0]+"."+w.slice(1).join(" "):full}
  function index(){
    byName={};
    Object.keys(D).forEach(function(id){var p=D[id];p.id=id;
      [p.short,shortOf(p.name),p.name].forEach(function(n){var k=p.team+"|"+key(n);if(!n)return;
        var l=byName[k]=byName[k]||[];if(l.indexOf(p)<0)l.push(p)})});
  }
  /* Kept on the phone (Cache Storage, survives refresh and restarts): the roster file counts as fresh for 4 hours,
     then it is re-checked in the background and the saved copy stays if that fails. Photos are kept for good,
     keyed by their link; a changed headshot comes with a new link, and links no longer used are cleared out. */
  var STORE="db-players-v1", FRESH=4*3600e3, CS=null;
  function store(){if(!CS)CS=(window.caches&&window.isSecureContext?caches.open(STORE):Promise.reject()).catch(function(){return null});return CS}
  function flush(){var w=waiting;waiting=[];w.forEach(function(f){try{f()}catch(e){console.log(e)}})}
  function use(x){if(!x||!x.players)return false;D=x.players;index();VER++;changed();flush();return true}
  function ready(cb){
    if(D){cb&&cb();return}
    if(cb)waiting.push(cb);
    if(loading)return; loading=true;
    store().then(function(c){
      return (c?c.match("players.json"):Promise.resolve(null)).then(function(hit){
        if(!hit)return refresh(c);
        var age=Date.now()-(+hit.headers.get("x-saved")||0);
        return hit.json().then(function(x){use(x);if(age>FRESH)refresh(c)}).catch(function(){return refresh(c)});
      });
    }).catch(function(){}).then(function(){if(!D){D={};flush()}});
  }
  function refresh(c){
    return fetch(SRC,{cache:"no-cache"}).then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(t){
      var x=JSON.parse(t);
      if(c){c.put("players.json",new Response(t,{headers:{"content-type":"application/json","x-saved":String(Date.now())}}));prune(c,x.players)}
      use(x);
    }).catch(function(){});   /* offline or server trouble: keep what we have */
  }
  function prune(c,P){
    var keep={}; Object.keys(P||{}).forEach(function(id){var u=url(P[id]);if(u)keep[u]=1});
    c.keys().then(function(ks){ks.forEach(function(rq){if(/^https:\/\/static\.www\.nfl\.com\//.test(rq.url)&&!keep[rq.url])c.delete(rq)})});
  }
  function byId(id){return D&&id!=null?D[String(id)]||null:null}
  function find(name,teams){
    if(!D||!name)return null;
    teams=[].concat(teams||[]); var hits=[];
    teams.forEach(function(t){(byName[t+"|"+key(name)]||[]).forEach(function(p){if(hits.indexOf(p)<0)hits.push(p)})});
    return hits.length===1?hits[0]:null;   /* unknown or ambiguous: no guess */
  }
  /* One image size everywhere (160 px, sharp up to 80 css px), so every place shares one cached file
     and the image server only has to make it once. */
  function url(p){
    if(!p||!p.img)return "";var px=SIZE;
    var u=/^https?:/.test(p.img)?p.img:IMG+p.img;
    /* Ask the image server for a small, face-centred square (2x for sharp phone screens). */
    return u.replace("/f_auto,q_auto/","/c_fill,g_face,w_"+px*2+",h_"+px*2+"/f_auto,q_auto/");
  }
  var IMGS={}, subs=[], tmr=0, VER=0;
  function changed(){clearTimeout(tmr);tmr=setTimeout(function(){subs.forEach(function(f){try{f()}catch(e){console.log(e)}})},250)}
  function onChange(f){subs.push(f)}
  /* One Image per photo, fed from the phone's store when it has it (a local copy, so the chart can draw it),
     else fetched once (CORS) and saved. */
  function imgFor(u,ping){
    var im=IMGS[u]; if(im){if(ping&&!im.naturalWidth)im._ping=1;return im}
    im=IMGS[u]=new Image(); im.decoding="async"; im._ping=ping;
    im.onload=function(){if(im._ping){VER++;changed()}};   /* redraw only for photos a picture is waiting on */
    store().then(function(c){
      return (c?c.match(u):Promise.resolve(null)).then(function(hit){
        if(hit)return hit.blob();
        return fetch(u,{mode:"cors"}).then(function(r){if(!r.ok)throw 0;if(c)c.put(u,r.clone());return r.blob()});
      });
    }).then(function(b){im._local=URL.createObjectURL(b);im.src=im._local})
      .catch(function(){im.crossOrigin="anonymous";im.src=u});   /* no store or fetch trouble: plain load (silhouette if it fails) */
    return im;
  }
  function imgOf(id){var u=url(byId(id));return u?imgFor(u,true):null
  }
  var SIL='<svg class="pf-sil" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="15" r="7.5"/><path d="M5 40c1.5-9 7.5-13.5 15-13.5S33.5 31 35 40z"/></svg>';
  function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
  function face(p,o){
    o=o||{}; var px=o.size||44, num=o.num!=null?o.num:(p&&p.num)||"", u=url(p), im=u&&IMGS[u];
    if(u&&!im)imgFor(u,false);   /* gets it into the store for next time */
    var img=u?'<img src="'+esc(im&&im._local||u)+'" alt=""'+(im&&im._local?'':' crossorigin="anonymous"')+' decoding="async" onerror="this.closest(\'.pf\').classList.add(\'pf-none\');this.remove()">':"";
    var tc=(o.bg?"--tc:"+esc(o.bg)+";":"")+(o.ink?"--tci:"+esc(o.ink)+";":"");
    return '<span class="pf'+(u?"":" pf-none")+'" style="--pf:'+px+'px;'+tc+'" title="'+esc(p?p.name+(p.pos?" · "+p.pos:""):"")+'"><span class="pf-in">'+SIL+img+'</span>'+
      (num!==""?'<b class="pf-num">'+esc(num)+'</b>':"")+'</span>';
  }
  /* Preloading: the browser keeps each fetched image in its cache, so a face shows at once later.
     Same URL as face() at the default size, or the cache wouldn't match. */
  var SIZE=80, warmed={}, queue=[], busy=0, seen={};
  function pump(){
    while(busy<4&&queue.length){var u=queue.shift();if(IMGS[u])continue;var im=imgFor(u,false);busy++;
      im.addEventListener("load",done);im.addEventListener("error",done)}
    function done(){busy--;setTimeout(pump,50)}
  }
  function want(p){var u=url(p);if(u&&!seen[u]){seen[u]=1;queue.push(u)}}
  /* Preload order: skill players, kickers, defence, offensive line, then punters and long snappers. */
  var RANK={QB:0,RB:0,WR:0,TE:0,FB:0,K:1,DL:2,LB:2,DB:2,OL:3,P:4,LS:4};
  function rank(p){var r=RANK[p.pos];return r==null?5:r}
  function warm(teams){
    teams=[].concat(teams||[]).filter(function(t){return t&&!warmed[t]}); if(!teams.length)return;
    teams.forEach(function(t){warmed[t]=1});
    ready(function(){
      Object.keys(D).map(function(id){return D[id]}).filter(function(p){return teams.indexOf(p.team)>=0&&(!p.st||p.st==="ACT")})
        .sort(function(a,b){return rank(a)-rank(b)}).forEach(want);   /* both teams together, most likely to be named first */
      pump()});
  }
  function preload(names,teams){
    ready(function(){var front=[];[].concat(names||[]).forEach(function(n){var p=find(n,teams),u=url(p);if(u){seen[u]=1;front.push(u)}});
      queue=front.concat(queue.filter(function(u){return front.indexOf(u)<0}));pump()});   /* these jump the queue */
  }
  return {ready:ready,byId:byId,find:find,face:face,url:url,warm:warm,preload:preload,imgOf:imgOf,onChange:onChange,ver:function(){return VER}};
})();
