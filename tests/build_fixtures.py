"""Builds tests/fixtures.json: a few real examples of every event type, each with just the
game header and the drive up to and including that play. Source: the season dump in
/home/claude/rt (types.json from the reviewer's classifier, data/<game>.json).
Run: python3 tests/build_fixtures.py  (only needed when the type catalogue changes)."""
import json, copy, os
RT='/home/claude/rt'; OUT=os.path.join(os.path.dirname(__file__),'fixtures.json')
T=json.load(open(RT+'/types.json'))['types']
cache={}
def game(gid):
    if gid not in cache: cache[gid]=json.load(open('%s/data/%s.json'%(RT,gid)))
    return cache[gid]
def slim_header(j):
    h=copy.deepcopy(j['header']); c=h['competitions'][0]
    for x in c.get('competitors',[]):
        t=x.get('team',{}); x['team']={k:t.get(k) for k in ('id','abbreviation','displayName','shortDisplayName','name','location','color','alternateColor')}
        for k in list(x):
            if k not in ('id','homeAway','team','score','order'): x.pop(k)
    keep={k:c.get(k) for k in ('id','date','competitors','status')}
    return {'id':h.get('id'),'week':h.get('week'),'season':h.get('season'),'competitions':[keep]}
def cut(j,pid):
    for d in j['drives'].get('previous',[])+([j['drives']['current']] if j['drives'].get('current') else []):
        ids=[p['id'] for p in d.get('plays',[])]
        if pid in ids:
            d2=copy.deepcopy(d); d2['plays']=d2['plays'][:ids.index(pid)+1]
            return d2
    return None
fx=[]
for t in T:
    n=0; seen_dir=set()
    exs=sorted(t['examples'],key=lambda e:(e['away'] in seen_dir))
    for i,e in enumerate(t['examples']):
        if n>=3: break
        j=game(e['game']); d=cut(j,e['play'])
        if not d: continue
        fx.append({'type':t['id'],'family':t['family'],'name':t['name'],'i':n,'count':t['count'],'play':e['play'],
                   'text':e['text'],'game':{'header':slim_header(j),'drives':{'previous':[d]}}})
        n+=1
# Synthetic cases for things that never happened this season (made from a real neighbour).
def synth(src_type,new_type,name,edit):
    base=next((f for f in fx if f['type']==src_type),None)
    if not base: return
    f=copy.deepcopy(base); f.update(type=new_type,name=name+' (synthetic)',i=0,count=0)
    p=f['game']['drives']['previous'][0]['plays'][-1]; edit(p); f['text']=p['text']; f['play']=p['id']; fx.append(f)
def ed_text(s): 
    def g(p): p['text']=s
    return g
synth('ko_touchback','ko_fair','Kickoff fair catch',ed_text('B.Pinion kicks 60 yards from SF 35 to LAR 5, fair catch by X.Smith.'))
synth('fg_good','fg_doink_in','Field goal off the upright and in',ed_text('J.Tucker 48 yard field goal is GOOD, Hit Left Upright, Center-N.Moore, Holder-J.Stout.'))
synth('fg_blocked','fg_blocked_ret','Blocked FG returned',ed_text('J.Myers 44 yard field goal is BLOCKED (A.Booker), Center-C.Stoll, Holder-M.Dickson, RECOVERED by CHI-J.Johnson at CHI 30. J.Johnson to SEA 32 for 38 yards (M.Dickson).'))
json.dump(fx,open(OUT,'w'),separators=(',',':'))
print(len(fx),'fixtures,',len({f['type'] for f in fx}),'types,',round(os.path.getsize(OUT)/1e6,2),'MB')
