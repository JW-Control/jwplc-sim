"""Vista previa generica: aplica data-show/fill/text/rotate con estados dados.
uso: preview_gen.py casos.json salida.png escala [placa.png]
casos.json: [{"t": titulo, "svg": ruta, "st": {"out.lit": true, "param.color": "verde", ...}}]
"""
import sys, json, base64, html
from playwright.sync_api import sync_playwright

cases, out, sc = json.load(open(sys.argv[1])), sys.argv[2], float(sys.argv[3])
plate = sys.argv[4] if len(sys.argv) > 4 else None
COL = {"verde": "#2fbf5a", "rojo": "#e2342b", "amarillo": "#f2c230", "azul": "#2f6fd6", "blanco": "#f2f2f2", "negro": "#25282c"}
JS = """(()=>{const COL=%s;
document.querySelectorAll('.case').forEach(c=>{
 const st=JSON.parse(c.dataset.st);
 const ev=e=>{if(e.includes('|')){for(const x of e.split('|')){const v=ev(x);if(v!==undefined)return v;}return undefined;} if(e.startsWith('!'))return !ev(e.slice(1)); if(e.includes('=')){const[a,b]=e.split('=');return String(st[a])===b;} if(e.includes('>')){const[a,b]=e.split('>');return Number(st[a])>Number(b);} if(e.includes('<')){const[a,b]=e.split('<');return Number(st[a])<Number(b);} return st[e];};
 c.querySelectorAll('[data-show]').forEach(n=>{if(!ev(n.dataset.show))n.style.display='none'});
 c.querySelectorAll('[data-fill]').forEach(n=>n.setAttribute('fill',COL[ev(n.dataset.fill)]||ev(n.dataset.fill)));
 c.querySelectorAll('[data-text]').forEach(n=>n.textContent=ev(n.dataset.text));
 const S7={0:'abcdef',1:'bc',2:'abdeg',3:'abcdg',4:'bcfg',5:'acdfg',6:'acdefg',7:'abc',8:'abcdefg',9:'abcdfg',A:'abcefg',b:'cdefg',C:'adef',c:'deg',d:'bcdeg',E:'adefg',F:'aefg',H:'bcefg',L:'def',n:'ceg',o:'cdeg',P:'abefg',r:'eg',S:'acdfg',t:'defg',U:'bcdef',u:'cde','-':'g',' ':''};
 c.querySelectorAll('[data-seg]').forEach(n=>{const[e,k]=n.dataset.seg.split(':');const cs=[];for(const ch of String(ev(e)??'')){if(ch==='.'&&cs.length&&!cs[cs.length-1].includes('p'))cs[cs.length-1]+='p';else cs.push(ch==='.'?'p':(S7[ch]??''));}while(cs.length<+k)cs.unshift('');const cc=cs.slice(-k);
   n.querySelectorAll('[data-s]').forEach(g=>{const d=+g.dataset.s.slice(0,-1),q=g.dataset.s.slice(-1);g.setAttribute('fill',(cc[d]||'').includes(q)?(n.dataset.on||'#ff3b26'):(n.dataset.off||'#2a0c08'));});});
 c.querySelectorAll('[data-translate]').forEach(n=>{const[e,v0,v1,ax,d]=n.dataset.translate.split(':');
   const v=Number(ev(e)||0),t=Math.max(0,Math.min(1,(v-v0)/(v1-v0))),k=Number(d)*t;
   n.setAttribute('transform',ax==='x'?`translate(${k} 0)`:`translate(0 ${k})`);});
 c.querySelectorAll('[data-rotate]').forEach(n=>{const[e,v0,v1,a0,a1,cx,cy]=n.dataset.rotate.split(':');
   const v=Number(ev(e)||0),t=(v-v0)/(v1-v0),a=Number(a0)+(a1-a0)*Math.max(0,Math.min(1,t));
   n.setAttribute('transform',`rotate(${a} ${cx} ${cy})`);});
 c.querySelectorAll('.jw-term').forEach(n=>n.setAttribute('fill','none'));
 const s=c.querySelector('svg'),vb=s.viewBox.baseVal; s.setAttribute('width',vb.width*SC); s.setAttribute('height',vb.height*SC);
});})();""" % json.dumps(COL)
GRID = "background-color:#f3f4f6;background-image:linear-gradient(#dcdfe3 1px,transparent 1px),linear-gradient(90deg,#dcdfe3 1px,transparent 1px);"
body = ""
if plate:
    b64 = base64.b64encode(open(plate, "rb").read()).decode()
    body += f'<div><div class="t">JWPLC Basic</div><img src="data:image/png;base64,{b64}" width="{1549*20/64:.0f}"></div>'
for c in cases:
    svg = open(c["svg"]).read().split("?>", 1)[1]
    body += f'<div class="case" data-st=\'{html.escape(json.dumps(c["st"]))}\'><div class="t">{html.escape(c["t"])}</div>{svg}</div>'
doc = (f'<html><body style="margin:0;font-family:sans-serif"><div id="w" style="display:flex;flex-wrap:wrap;gap:{20*sc}px;align-items:flex-end;padding:{20*sc}px;{GRID}background-size:{20*sc}px {20*sc}px;width:max-content;max-width:1850px">'
       f'{body}</div><style>.t{{font-size:12px;margin-bottom:4px}}</style><script>const SC={sc};{JS}</script></body></html>')
with sync_playwright() as pw:
    br = pw.chromium.launch(); pg = br.new_page(viewport={"width": 1900, "height": 900})
    pg.set_content(doc); pg.wait_for_timeout(200); pg.locator("#w").screenshot(path=out); br.close()
print("ok")
