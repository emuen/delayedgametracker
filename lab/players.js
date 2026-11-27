/* Players: headshots and roster details from the open nflverse dataset (players.json, refreshed daily
   by .github/workflows/players.yml). Images are the NFL's own headshot URLs, shown directly and
   resized by the image server; a neutral silhouette stands in when a photo is missing or won't load.

   Players.ready(cb)            load once (lazy), then cb()
   Players.byId(espnId)         the player with this ESPN athlete id, or null
   Players.find(name, teams)    by "D.Achane" / "De'Von Achane", limited to a team code or list (["MIA","NYJ"]); null if unknown or ambiguous
   Players.face(p, opts)        HTML for a framed headshot with the jersey number on a plate at the bottom.
                                opts: {size: px (default 56), num: override, bg/ink: plate colours (team colours)} */
var Players=(function(){
  var SRC=/\/(beta|lab)\/[^\/]*$/.test(location.pathname)?"../players.json":"players.json";   /* one shared file in the site root */
  var IMG="https://static.www.nfl.com/image/", D=null, byName={}, waiting=[], loading=false;
  function key(n){return String(n||"").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g,"").replace(/[^a-z]/g,"")}
  function shortOf(full){var w=String(full||"").replace(/\s+(Jr|Sr|II|III|IV)\.?$/,"").split(/\s+/);return w.length>1?w[0][0]+"."+w.slice(1).join(" "):full}
  function index(){
    Object.keys(D).forEach(function(id){var p=D[id];p.id=id;
      [p.short,shortOf(p.name),p.name].forEach(function(n){var k=p.team+"|"+key(n);if(!n)return;
        var l=byName[k]=byName[k]||[];if(l.indexOf(p)<0)l.push(p)})});
  }
  function ready(cb){
    if(D){cb&&cb();return}
    if(cb)waiting.push(cb);
    if(loading)return; loading=true;
    fetch(SRC,{cache:"default"}).then(function(r){return r.ok?r.json():null}).then(function(x){
      D=(x&&x.players)||{}; index();
    }).catch(function(){D={}}).then(function(){var w=waiting;waiting=[];w.forEach(function(f){try{f()}catch(e){console.log(e)}})});
  }
  function byId(id){return D&&id!=null?D[String(id)]||null:null}
  function find(name,teams){
    if(!D||!name)return null;
    teams=[].concat(teams||[]); var hits=[];
    teams.forEach(function(t){(byName[t+"|"+key(name)]||[]).forEach(function(p){if(hits.indexOf(p)<0)hits.push(p)})});
    return hits.length===1?hits[0]:null;   /* unknown or ambiguous: no guess */
  }
  function url(p,px){
    if(!p||!p.img)return "";
    var u=/^https?:/.test(p.img)?p.img:IMG+p.img;
    /* Ask the image server for a small, face-centred square (2x for sharp phone screens). */
    return u.replace("/f_auto,q_auto/","/c_fill,g_face,w_"+px*2+",h_"+px*2+"/f_auto,q_auto/");
  }
  var SIL='<svg class="pf-sil" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="15" r="7.5"/><path d="M5 40c1.5-9 7.5-13.5 15-13.5S33.5 31 35 40z"/></svg>';
  function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
  function face(p,o){
    o=o||{}; var px=o.size||56, num=o.num!=null?o.num:(p&&p.num)||"", u=url(p,px);
    var img=u?'<img src="'+esc(u)+'" alt="" loading="lazy" decoding="async" onerror="this.parentNode.classList.add(\'pf-none\');this.remove()">':"";
    return '<span class="pf'+(u?"":" pf-none")+'" style="--pf:'+px+'px" title="'+esc(p?p.name+(p.pos?" · "+p.pos:""):"")+'">'+SIL+img+
      (num!==""?'<b class="pf-num" style="'+(o.bg?"background:"+esc(o.bg)+";":"")+(o.ink?"color:"+esc(o.ink):"")+'">'+esc(num)+'</b>':"")+'</span>';
  }
  return {ready:ready,byId:byId,find:find,face:face,url:url};
})();
