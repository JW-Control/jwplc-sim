# Mando de 22 mm (160 x 240) y AD16 (120 x 200), estilo plano (sin degradados):
# cuerpo gris con hombros, rótulos de borne en blanco, sin tornillos a la vista
# (el casquillo lo pone el simulador en el borde). La lente o el capuchón ocupan
# casi todo el ancho. Piloto: aro negro ancho (AD16 con difusor punteado);
# pulsador: aro claro fino. Se distinguen a primera vista.
from kit import *
import math
BODYM='#8f969e'; OUT='#1f2328'; EMB='#f1f3f5'; BEZEL='#2b2f35'; RING='#d6dade'; KNOB='#16191d'

def emb(x,y,s,size=17):
    """Rótulo de borne en blanco, bien legible, sobre el cuerpo."""
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="800" fill="{EMB}" text-anchor="middle">{s}</text>'
def shoulders(x0,x1,y0,y1,tab=30,inset=None):
    """Silueta con hombros: lengüetas arriba y abajo más angostas que el cuerpo."""
    i = inset if inset is not None else (x1-x0)*0.14
    return (f'<path d="M{x0+i} {y0} H{x1-i} V{y0+tab} H{x1} V{y1-tab} H{x1-i} V{y1} H{x0+i} V{y1-tab} H{x0} V{y0+tab} H{x0+i} Z" '
            f'fill="{BODYM}" stroke="{OUT}" stroke-width="2" stroke-linejoin="round"/>')
def hits(top,bot,h):
    return ''.join(hit(t,x,17) for t,x in top)+''.join(hit(t,x,h-17,side='b') for t,x in bot)
def labels(top,bot,h,size=17):
    return ''.join(emb(x,38,t,size) for t,x in top)+''.join(emb(x,h-20,t,size) for t,x in bot)

def lens(cx,cy,R,ring,lit='out.lit',dots=False):
    """Aro negro ancho y lente plana: apagada, el color oscurecido; encendida, el color vivo."""
    s=circ(cx,cy,ring,KNOB,OUT,2)
    s+=circ(cx,cy,R,'#888','none',0,data_fill='param.color')
    s+=circ(cx,cy,R,'#0b0d10','none',0,opacity='.58',data_show='!'+lit)
    if dots:
        d=''
        step=R*0.26
        n=int(R/step)
        for i in range(-n,n+1):
            for j in range(-n,n+1):
                x,y=cx+i*step,cy+j*step
                if (i*step)**2+(j*step)**2 <= (R-step*0.6)**2: d+=f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{R*0.07:.1f}"/>'
        s+=g(d,fill='#fff',opacity='.18',data_show='!'+lit)+g(d,fill='#fff',opacity='.4',data_show=lit)
    s+=circ(cx,cy,R,'none',OUT,1.4)
    return s

# ---------------- pilotos: la lente ocupa casi todo el ancho del cuerpo
def pilot(name,W,H,cx,cy,R,ring,top,bot,body,dots=False):
    b=shoulders(*body)
    b+=lens(cx,cy,R,ring,dots=dots)
    b+=labels(top,bot,H)
    b+=soot(cx,cy,R,R-6)
    b+=hits(top,bot,H)
    svg(name,W,H,b)
pilot('lamp',160,240,80,120,44,58,[('X1',80)],[('X2',80)],(22,138,4,236,30))
pilot('lamp__ad16',120,200,60,100,36,44,[('X1',60)],[('X2',60)],(14,106,4,196,26),dots=True)

# ---------------- pulsadores: la misma proporción; capuchón plano casi del ancho, aro claro fino
def push_frame(top,bot,H=240):
    b=shoulders(12,148,4,H-4,30)
    b+=labels(top,bot,H)
    return b
def cap(cx,cy,R):
    up=circ(cx,cy,R+8,RING,OUT,2)+circ(cx,cy,R,'#888',OUT,1.6,data_fill='param.color')
    dn=(circ(cx,cy,R+8,RING,OUT,2)+circ(cx,cy,R+1,'#2b2f35','none',0)
        +circ(cx,cy,R-5,'#888',OUT,1.6,data_fill='param.color')+circ(cx,cy,R-5,'#000','none',0,opacity='.3'))
    return g(g(up,data_show='!out.pressed')+g(dn,data_show='out.pressed'),data_action='press',data_kind='momentary',style='cursor:pointer')
PB={'pushbutton-no':([('13',80)],[('14',80)]),
    'pushbutton-nc':([('11',80)],[('12',80)]),
    'pushbutton-nonc':([('13',60),('21',100)],[('14',60),('22',100)]),
    'pushbutton-nono':([('13',60),('23',100)],[('14',60),('24',100)])}
for name,(tt,bb) in PB.items():
    svg(name,160,240,push_frame(tt,bb)+cap(80,120,52)+hits(tt,bb,240))

# pulsador luminoso: cuerpo y aro claro del pulsador, lente del piloto; se hunde
tt,bb=[('13',60),('X1',100)],[('14',60),('X2',100)]
b=push_frame(tt,bb)
up=circ(80,120,60,RING,OUT,2)+lens(80,120,44,52)
dn=circ(80,120,60,RING,OUT,2)+lens(80,120,40,48)
b+=g(g(up,data_show='!out.pressed')+g(dn,data_show='out.pressed'),data_action='press',data_kind='momentary',style='cursor:pointer')
b+=soot(80,120,44,38)+hits(tt,bb,240)
svg('pushbutton-lit',160,240,b)

# ---------------- parada de emergencia: hongo rojo grande con la flecha de girar para soltar
def arrow(cx,cy,r,col,op='1'):
    a0,a1=-40,250
    p=[(cx+r*math.cos(math.radians(a)),cy+r*math.sin(math.radians(a))) for a in (a0,a1)]
    s=path(f'M{p[0][0]:.1f} {p[0][1]:.1f} A{r} {r} 0 1 1 {p[1][0]:.1f} {p[1][1]:.1f}',stroke=col,sw=8,stroke_linecap='round',opacity=op)
    ex,ey=p[1]; s+=f'<path d="M{ex-12:.1f} {ey+2:.1f} L{ex+10:.1f} {ey-13:.1f} L{ex+6:.1f} {ey+13:.1f} Z" fill="{col}" opacity="{op}"/>'
    return s
tt,bb=[('11',60),('23',100)],[('12',60),('24',100)]
b=push_frame(tt,bb)
up=circ(80,120,66,'#b3201c',OUT,2)+arrow(80,120,38,'#eef2f6')
dn=circ(80,120,61,'#7d1613',OUT,2)+arrow(80,120,34,'#c9d0d8','.7')
b+=g(g(up,data_show='!out.pressed')+g(dn,data_show='out.pressed'),data_action='press',data_kind='toggle',style='cursor:pointer')
b+=hits(tt,bb,240)
svg('emergency-stop',160,240,b)

# ---------------- selectores: perilla negra grande, aro claro fino y maneta con franja blanca
def selector(name,tt,bb,options,rot,marks,key=False):
    b=push_frame(tt,bb)
    b+=circ(80,120,60,RING,OUT,2)
    for ang,l in marks:
        x=80+44*math.sin(math.radians(ang)); y=120-44*math.cos(math.radians(ang))
        b+=text(round(x,1),round(y+4,1),l,10,'#2b3138',800)
    if key:
        k=circ(80,120,34,'#c9ced4',OUT,1.6)+circ(80,120,26,'#b2b8bf',OUT,1.2)+rect(76,98,8,44,'#2b2f35',3,'none',0)
    else:
        k=circ(80,120,36,KNOB,OUT,1.6)+rect(70,70,20,100,'#3a3f46',10,OUT,1.4)+rect(75,76,10,38,'#f4f6f8',3,'none',0)
    b+=g(g(k,data_rotate=rot),data_action='position',data_kind='cycle',data_options=options,style='cursor:pointer')
    b+=hits(tt,bb,240)
    svg(name,160,240,b)
selector('selector-2',[('13',60),('21',100)],[('14',60),('22',100)],'0,1','out.position:0:1:-45:45:80:120',[(-50,'0'),(50,'I')])
selector('selector-3',[('13',60),('23',100)],[('14',60),('24',100)],'-1,0,1','out.position:-1:1:-45:45:80:120',[(-50,'I'),(0,'0'),(50,'II')])
selector('selector-key',[('13',60),('21',100)],[('14',60),('22',100)],'0,1','out.position:0:1:-45:45:80:120',[(-50,'0'),(50,'I')],key=True)

# ---------------- potenciómetro de panel (bornes 1 2 3 arriba)
tt=[('1',40),('2',80),('3',120)]
b=shoulders(12,148,4,236,30)+labels(tt,[],240,15)
for i in range(11):
    ang=-135+27*i; r1,r2=48,(56 if i%5==0 else 53)
    x1=80+r1*math.sin(math.radians(ang)); y1=124-r1*math.cos(math.radians(ang)); x2=80+r2*math.sin(math.radians(ang)); y2=124-r2*math.cos(math.radians(ang))
    b+=path(f'M{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}',stroke='#2b3138',sw=1.8)
    if i%5==0:
        xt=80+62*math.sin(math.radians(ang)); yt=124-62*math.cos(math.radians(ang))
        b+=text(round(xt,1),round(yt+3.5,1),str(i),10,'#f1f3f5',800)
k=circ(80,124,34,KNOB,OUT,1.6)+circ(80,124,24,'#2b2f35','none',0)+rect(77,92,6,22,JWG,2,'none',0)
b+=circ(80,124,40,RING,OUT,1.6)
b+=g(g(k,data_rotate='out.pos|param.posicion:0:100:-135:135:80:124'),data_action='pos',data_kind='drag',data_drag='y:0:-1.2:0:100',style='cursor:ns-resize')
b+=text(80,214,'arrastrar ↕',9,'#f1f3f5',700)+hits(tt,[],240)
svg('potentiometer',160,240,b)

# ---------------- zumbador AD16 (160 x 200): rejilla negra, ondas verdes al sonar
tt,bb=[('+',80)],[('-',80)]
b=shoulders(26,134,4,196,26)+emb(80,38,'+',18)+emb(80,182,'−',18)
b+=circ(80,100,50,KNOB,OUT,2)
for r in (9,18,27,36,44): b+=circ(80,100,r,'none','#3a3f46',2.4,stroke_dasharray='3 3')
waves=''.join(path(f'M{80+dx} {100-h} q{s*9} {h} 0 {2*h}',stroke='#2f9a3e',sw=4,stroke_linecap='round',opacity=op)
               for dx,s,h,op in [(-58,-1,16,'1'),(-66,-1,26,'.6'),(58,1,16,'1'),(66,1,26,'.6')])
b+=g(waves,data_show='out.sounding')+hits(tt,bb,200)
svg('buzzer',160,200,b)

# ---------------- voltímetro y amperímetro AD16-22 (120 x 200)
def meter(name,unit,rng=None):
    tt,bb=[('1',60)],[('2',60)]
    b=shoulders(14,106,4,196,26)+emb(60,38,'1',17)+emb(60,182,'2',17)
    b+=circ(60,100,44,KNOB,OUT,2)+rect(26,86,68,28,'#0f1d14',3,'#2a3a2e',1)
    b+=f'<text x="88" y="107" font-size="17" font-weight="700" fill="{LEDON}" text-anchor="end" font-family="Consolas,DejaVu Sans Mono,monospace" data-text="out.lcd">---</text>'
    b+=text(60,128,unit,10,'#cfd5dc',800)
    if rng: b+=f'<text x="60" y="78" font-size="8" font-weight="700" fill="#9aa3ad" text-anchor="middle" data-text="{rng}">60-500VAC</text>'
    b+=hits(tt,bb,200)
    svg(name,120,200,b)
meter('voltmeter','V','param.range')
meter('ammeter','A')
print('mando ok')
