# Kit «tablero JW» v3 para los símbolos del Sim (docs/SIMBOLOS.md).
# Plano, contorno fino gris, tornillos Phillips con número, franja JW con un dato, sin marcas.
import os
OUT=os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'../../../../app/renderer/assets/devices'))+'/'
BODY='#e7eaee'; BODY2='#dde1e6'; BAND='#d4d9df'; LINE='#5b6570'; DARK='#262b33'; DARK2='#353b44'
TXT='#2b3138'; MUTED='#6b7581'; LIGHT='#e9edf1'; JWG='#7cb342'; JWG2='#3f9a4c'; LEDON='#8ee26a'
RED='#d64541'; AMBER='#f0a020'; BLUE='#2f62a0'; BLUE2='#4f86c6'; AIR='#2f8cff'; STEEL='#c3c9d0'; STEEL2='#9aa3ad'
WATER='#3d8fd6'
SW='1.2'
FONT='Segoe UI,Noto Sans,Arial,sans-serif'

def a(**k):
    return ''.join(f' {kk.replace("_","-")}="{v}"' for kk,v in k.items() if v is not None)
def rect(x,y,w,h,fill=BODY,rx=0,stroke=LINE,sw=SW,**k):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}"{a(rx=rx or None)} fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{a(**k)}/>'
def circ(x,y,r,fill=BODY,stroke=LINE,sw=SW,**k):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{a(**k)}/>'
def path(d,fill='none',stroke=LINE,sw=SW,**k):
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{a(**k)}/>'
def text(x,y,s,size=9,fill=TXT,weight=600,anchor='middle',**k):
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}"{a(**k)}>{s}</text>'
def g(body,**k):
    return f'<g{a(**k)}>{body}</g>'

def screw(x,y,r=8):
    return (circ(x,y,r,'#f4f6f8')+circ(x,y,r-2.2,'none','#c9cfd6',1)+
            path(f'M{x-r*0.5} {y}h{r} M{x} {y-r*0.5}v{r}',stroke='#39414b',sw=1.8,stroke_linecap='round'))
def hit(term,x,y,r=9,side=None,cls='jw-term'):
    return f'<circle class="{cls}" data-term="{term}" cx="{x}" cy="{y}" r="{r}"{a(data_side=side)}/>'
def term(x,y,tid,label=None,side='t',r=8,lab='out',color=TXT,size=9):
    """Tornillo + rótulo + zona .jw-term. lab='out' rótulo hacia el centro del equipo, 'none' sin rótulo,
       'l'/'r' al costado."""
    label=tid if label is None else label
    s=screw(x,y,r)
    if lab=='out':
        ly = y+r+10 if side=='t' else y-r-4
        s+=text(x,ly,label,size,color)
    elif lab in('l','r'):
        s+=text(x-r-3 if lab=='l' else x+r+3,y+3.5,label,size,color,anchor='end' if lab=='l' else 'start')
    return s+hit(tid,x,y,r+1)
def band(x,y,w,h,rx=0):
    return rect(x,y,w,h,BAND,rx)
def jw(x,y,w,txt='',h=13,size=9):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{DARK}"/>'
    s+=text(x+5,y+h-3,'JW',size,'#fff',800,'start',letter_spacing='.5')
    s+=path(f'M{x+21} {y+h-4} l3 -5 l3 5',stroke=JWG,sw=1.6)
    if txt: s+=text(x+w-5,y+h-3,txt,size,'#e9edf1',700,'end')
    return s
def led(x,y,expr,r=4,on=LEDON,off='#4a5058'):
    return (circ(x,y,r,off,LINE,1)+
            g(circ(x,y,r+3.5,on,'none',0,opacity='.25')+circ(x,y,r,on,LINE,1),data_show=expr))
def soot(cx,cy,rx,ry,label='QUEMADO',ty=None):
    s=f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#1a1a1a" opacity=".55"/>'
    s+=f'<ellipse cx="{cx-rx*.2}" cy="{cy+ry*.1}" rx="{rx*.5}" ry="{ry*.45}" fill="#0b0b0b" opacity=".6"/>'
    ty = cy if ty is None else ty
    s+=rect(cx-30,ty-8,60,15,RED,3,'#7a1f1c',1)+text(cx,ty+3.5,label,9,'#fff',800)
    return g(s,data_show='damaged')
def tag(cx,cy,s,fill=RED,w=None,fg='#fff',show=None,size=9):
    w = w or (len(s)*5.8+14)
    return g(rect(cx-w/2,cy-8,w,16,fill,3,'none',0)+text(cx,cy+3.5,s,size,fg,800),data_show=show)
def svg(name,w,h,body,defs='',root=''):
    assert w%20==0 and h%20==0,(name,w,h)
    s=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" font-family="{FONT}"{root}>'
       +(f'<defs>{defs}</defs>' if defs else '')+body+'</svg>\n')
    open(OUT+name+'.svg','w').write(s)

# ---------------- estilo «réplica» (19/11): contorno oscuro grueso, tornillos grandes, bornera más oscura.
# Las familias que lo usan llaman kit.replica() ANTES de «from kit import *».
OL='#1f2328'; HOODC='#c4c9cf'
def replica():
    g_=globals()
    _rect,_circ,_path=g_['rect'],g_['circ'],g_['path']
    def fix(stroke,sw):
        if stroke in (LINE,OL) and float(sw)>0: return OL,max(float(sw),2.2)
        return stroke,sw
    def rect2(x,y,w,h,fill=BODY,rx=0,stroke=LINE,sw=SW,**k):
        s,w_=fix(stroke,sw); return _rect(x,y,w,h,fill,rx,s,w_,**k)
    def circ2(x,y,r,fill=BODY,stroke=LINE,sw=SW,**k):
        s,w_=fix(stroke,sw); return _circ(x,y,r,fill,s,w_,**k)
    def path2(d,fill='none',stroke=LINE,sw=SW,**k):
        s,w_=fix(stroke,sw); return _path(d,fill,s,w_,**k)
    def screw2(x,y,r=8):
        r=min(r*1.2,9.5) if r<10 else r*1.15; d=r*0.55
        return (_circ(x,y,r,'#fbfbfc',OL,2.2)+_circ(x,y,r-2.8,'none','#a3aab2',1.1)
                +_path(f'M{x-d:.1f} {y}h{2*d:.1f} M{x} {y-d:.1f}v{2*d:.1f}',stroke='#2a2e33',sw=max(2.4,r*0.3),stroke_linecap='round'))
    def band2(x,y,w,h,rx=0): return _rect(x,y,w,h,HOODC,rx,OL,2)
    g_.update(rect=rect2,circ=circ2,path=path2,screw=screw2,band=band2,BAND=HOODC,LINE=OL)
