# Mando de 22 mm (160 x 240) y AD16 (120 x 200), estilo plano (sin degradados):
# cuerpo gris con hombros, rótulos de borne en relieve, sin tornillos a la vista
# (el casquillo lo pone el simulador en el borde). Piloto angosto con aro negro;
# pulsador ancho con marco oscuro cuadrado y aro claro: se distinguen a primera vista.
from kit import *
import math
BODYM='#a7adb4'; OUT='#1f2328'; EMB='#dfe3e7'; BEZEL='#2b2f35'; RING='#d6dade'; KNOB='#16191d'

def emb(x,y,s,size=15):
    """Rótulo en relieve sobre el cuerpo (borde oscuro, relleno claro)."""
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="800" fill="{EMB}" stroke="#30363d" stroke-width="1.1" text-anchor="middle">{s}</text>'
def shoulders(x0,x1,y0,y1,tab=14,inset=None):
    """Silueta con hombros: lengüetas arriba y abajo más angostas que el cuerpo."""
    i = inset if inset is not None else (x1-x0)*0.12
    return (f'<path d="M{x0+i} {y0} H{x1-i} V{y0+tab} H{x1} V{y1-tab} H{x1-i} V{y1} H{x0+i} V{y1-tab} H{x0} V{y0+tab} H{x0+i} Z" '
            f'fill="{BODYM}" stroke="{OUT}" stroke-width="2" stroke-linejoin="round"/>')
def hits(top,bot,h):
    return ''.join(hit(t,x,17) for t,x in top)+''.join(hit(t,x,h-17,side='b') for t,x in bot)
def labels(top,bot,h,size=15):
    return ''.join(emb(x,40,t,size) for t,x in top)+''.join(emb(x,h-22,t,size) for t,x in bot)

def lens(cx,cy,R,lit='out.lit'):
    """Lente plana: apagada, el color oscurecido; encendida, el color vivo, un brillo plano y un halo."""
    s=g(circ(cx,cy,R+14,'#000','none',0,data_fill='param.color',opacity='.28'),data_show=lit)
    s+=circ(cx,cy,R+6,KNOB,OUT,1.6)
    s+=circ(cx,cy,R,'#888','none',0,data_fill='param.color')
    s+=circ(cx,cy,R,'#0b0d10','none',0,opacity='.6',data_show='!'+lit)
    s+=g(circ(cx-R*.32,cy-R*.32,R*.22,'#fff','none',0,opacity='.55'),data_show=lit)
    return s

# ---------------- piloto XB2: cuerpo angosto (80 px), aro negro, lente
def pilot(name,W,H,cx,cy,R,top,bot,body):
    b=shoulders(*body)
    b+=labels(top,bot,H)
    b+=lens(cx,cy,R)
    b+=f'<text x="{cx}" y="{cy+R+22}" font-size="9" font-weight="800" fill="#3a414b" text-anchor="middle" data-text="param.rating">24VDC</text>'
    b+=soot(cx,cy,R+8,R+4)
    b+=hits(top,bot,H)
    svg(name,W,H,b)
pilot('lamp',160,240,80,118,34,[('X1',80)],[('X2',80)],(34,126,4,236,18,10))
pilot('lamp__ad16',120,200,60,98,30,[('X1',60)],[('X2',60)],(16,104,4,196,18,10))

# ---------------- pulsadores: cuerpo ancho, marco oscuro cuadrado, aro claro, capuchón plano
def push_frame(top,bot,H=240):
    b=shoulders(10,150,4,H-4,22,22)
    b+=rect(26,52,108,136,BEZEL,6,OUT,1.4)
    b+=labels(top,bot,H)
    return b
def cap(cx,cy,R):
    up=circ(cx,cy,R+5,RING,OUT,1.6)+circ(cx,cy,R,'#888',OUT,1.6,data_fill='param.color')
    dn=(circ(cx,cy,R+5,RING,OUT,1.6)+circ(cx,cy,R+1,'#2b2f35','none',0)
        +circ(cx,cy,R-4,'#888',OUT,1.6,data_fill='param.color')+circ(cx,cy,R-4,'#000','none',0,opacity='.3'))
    return g(g(up,data_show='!out.pressed')+g(dn,data_show='out.pressed'),data_action='press',data_kind='momentary',style='cursor:pointer')
PB={'pushbutton-no':([('13',80)],[('14',80)]),
    'pushbutton-nc':([('11',80)],[('12',80)]),
    'pushbutton-nonc':([('13',60),('21',100)],[('14',60),('22',100)]),
    'pushbutton-nono':([('13',60),('23',100)],[('14',60),('24',100)])}
for name,(tt,bb) in PB.items():
    svg(name,160,240,push_frame(tt,bb)+cap(80,120,40)+hits(tt,bb,240))

# pulsador luminoso: el capuchón es una lente (apagada oscura, encendida viva) y se hunde
tt,bb=[('13',60),('X1',100)],[('14',60),('X2',100)]
b=push_frame(tt,bb)
up=circ(80,120,45,RING,OUT,1.6)+lens(80,120,34)
dn=circ(80,120,45,RING,OUT,1.6)+circ(80,120,41,BEZEL,'none',0)+lens(80,120,30)
b+=g(g(up,data_show='!out.pressed')+g(dn,data_show='out.pressed'),data_action='press',data_kind='momentary',style='cursor:pointer')
b+=soot(80,120,44,38)+hits(tt,bb,240)
svg('pushbutton-lit',160,240,b)

# ---------------- parada de emergencia: hongo rojo que sobresale del marco, flecha de giro para soltar
def arrow(cx,cy,r,col,op='1'):
    a0,a1=-40,250
    p=[(cx+r*math.cos(math.radians(a)),cy+r*math.sin(math.radians(a))) for a in (a0,a1)]
    s=path(f'M{p[0][0]:.1f} {p[0][1]:.1f} A{r} {r} 0 1 1 {p[1][0]:.1f} {p[1][1]:.1f}',stroke=col,sw=7,stroke_linecap='round',opacity=op)
    # punta de flecha al final del arco
    ex,ey=p[1]; s+=f'<path d="M{ex-11:.1f} {ey+2:.1f} L{ex+9:.1f} {ey-12:.1f} L{ex+5:.1f} {ey+12:.1f} Z" fill="{col}" opacity="{op}"/>'
    return s
tt,bb=[('11',60),('23',100)],[('12',60),('24',100)]
b=push_frame(tt,bb)
up=circ(80,120,58,'#b3201c',OUT,2)+arrow(80,120,34,'#eef2f6')
dn=circ(80,120,54,'#7d1613',OUT,2)+arrow(80,120,31,'#c9d0d8','.7')
b+=g(g(up,data_show='!out.pressed')+g(dn,data_show='out.pressed'),data_action='press',data_kind='toggle',style='cursor:pointer')
b+=hits(tt,bb,240)
svg('emergency-stop',160,240,b)

# ---------------- selectores: perilla negra con aro claro y maneta con franja blanca
def selector(name,tt,bb,options,rot,marks,key=False):
    b=push_frame(tt,bb)
    for ang,l in marks:
        x=80+58*math.sin(math.radians(ang)); y=120-58*math.cos(math.radians(ang))
        b+=text(round(x,1),round(y+4,1),l,10,'#cfd5dc',800)
    b+=circ(80,120,45,RING,OUT,1.6)
    if key:
        k=circ(80,120,40,'#c9ced4',OUT,1.6)+circ(80,120,30,'#b2b8bf',OUT,1.2)+rect(76,96,8,48,'#2b2f35',3,'none',0)
    else:
        k=circ(80,120,40,KNOB,OUT,1.6)+rect(69,74,22,92,'#3a3f46',10,OUT,1.4)+rect(75,80,10,36,'#f4f6f8',3,'none',0)
    b+=g(g(k,data_rotate=rot),data_action='position',data_kind='cycle',data_options=options,style='cursor:pointer')
    b+=hits(tt,bb,240)
    svg(name,160,240,b)
selector('selector-2',[('13',60),('21',100)],[('14',60),('22',100)],'0,1','out.position:0:1:-45:45:80:120',[(-48,'0'),(48,'I')])
selector('selector-3',[('13',60),('23',100)],[('14',60),('24',100)],'-1,0,1','out.position:-1:1:-45:45:80:120',[(-48,'I'),(0,'0'),(48,'II')])
selector('selector-key',[('13',60),('21',100)],[('14',60),('22',100)],'0,1','out.position:0:1:-45:45:80:120',[(-48,'0'),(48,'I')],key=True)

# ---------------- potenciómetro de panel (bornes 1 2 3 arriba)
tt=[('1',40),('2',80),('3',120)]
b=shoulders(10,150,4,236,22,22)+rect(26,52,108,160,BEZEL,6,OUT,1.4)+labels(tt,[],240,13)
for i in range(11):
    ang=-135+27*i; r1,r2=48,(56 if i%5==0 else 53)
    x1=80+r1*math.sin(math.radians(ang)); y1=124-r1*math.cos(math.radians(ang)); x2=80+r2*math.sin(math.radians(ang)); y2=124-r2*math.cos(math.radians(ang))
    b+=path(f'M{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}',stroke='#cfd5dc',sw=1.6)
    if i%5==0:
        xt=80+62*math.sin(math.radians(ang)); yt=124-62*math.cos(math.radians(ang))
        b+=text(round(xt,1),round(yt+3.5,1),str(i),9,'#cfd5dc',800)
k=circ(80,124,34,KNOB,OUT,1.6)+circ(80,124,24,'#2b2f35','none',0)+rect(77,92,6,22,JWG,2,'none',0)
b+=circ(80,124,40,RING,OUT,1.6)
b+=g(g(k,data_rotate='out.pos|param.posicion:0:100:-135:135:80:124'),data_action='pos',data_kind='drag',data_drag='y:0:-1.2:0:100',style='cursor:ns-resize')
b+=text(80,202,'arrastrar ↕',8.5,'#9aa3ad',600)+hits(tt,[],240)
svg('potentiometer',160,240,b)

# ---------------- zumbador AD16 (160 x 200): rejilla negra, ondas verdes al sonar
tt,bb=[('+',80)],[('-',80)]
b=shoulders(30,130,4,196,18,10)+emb(80,40,'+',16)+emb(80,178,'−',16)
b+=circ(80,100,40,KNOB,OUT,1.6)
for r in (8,16,24,32): b+=circ(80,100,r,'none','#3a3f46',2.4,stroke_dasharray='3 3')
waves=''.join(path(f'M{80+dx} {100-h} q{s*9} {h} 0 {2*h}',stroke='#2f9a3e',sw=4,stroke_linecap='round',opacity=op)
               for dx,s,h,op in [(-50,-1,16,'1'),(-60,-1,26,'.6'),(50,1,16,'1'),(60,1,26,'.6')])
b+=g(waves,data_show='out.sounding')+hits(tt,bb,200)
svg('buzzer',160,200,b)

# ---------------- voltímetro y amperímetro AD16-22 (120 x 200)
def meter(name,unit,rng=None):
    tt,bb=[('1',60)],[('2',60)]
    b=shoulders(14,106,4,196,18,10)+emb(60,40,'1',14)+emb(60,178,'2',14)
    b+=circ(60,100,40,KNOB,OUT,1.6)+rect(28,86,64,28,'#0f1d14',3,'#2a3a2e',1)
    b+=f'<text x="88" y="107" font-size="17" font-weight="700" fill="{LEDON}" text-anchor="end" font-family="Consolas,DejaVu Sans Mono,monospace" data-text="out.lcd">---</text>'
    b+=text(60,128,unit,10,'#cfd5dc',800)
    if rng: b+=f'<text x="60" y="78" font-size="8" font-weight="700" fill="#9aa3ad" text-anchor="middle" data-text="{rng}">60-500VAC</text>'
    b+=hits(tt,bb,200)
    svg(name,120,200,b)
meter('voltmeter','V','param.range')
meter('ammeter','A')
print('mando ok')
