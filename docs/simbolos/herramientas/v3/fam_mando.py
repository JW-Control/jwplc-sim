# Mando de 22 mm (160 x 240) y AD16 (120 x 200): pilotos, pulsadores, paro, selectores, potenciómetro, zumbador, medidores.
from kit import *

LIT_DEFS='''<radialGradient id="jwm-shine" cx=".38" cy=".32" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".35" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<radialGradient id="jwm-cap" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient>'''

def frame22(terms_top,terms_bot,datum,datum_expr=None,face=None):
    """Cuerpo del operador de 22 mm: bloques de contacto arriba y abajo, base gris y franja JW."""
    b=rect(14,4,132,232,STEEL2,6)
    b+=band(14,4,132,30,0)+band(14,206,132,30,0)
    for t,x in terms_top: b+=term(x,17,t,side='t',lab='none')
    for t,x in terms_bot: b+=term(x,223,t,side='b',lab='none')
    # rótulos al costado de cada tornillo
    for t,x in terms_top: b+=text(x+(14 if x>=80 else -14),21,t,8.5,TXT,700)
    for t,x in terms_bot: b+=text(x+(14 if x>=80 else -14),227,t,8.5,TXT,700)
    b+=jw(14,34,132)
    tx=f'<text x="141" y="44" font-size="9" font-weight="700" fill="#e9edf1" text-anchor="end"{a(data_text=datum_expr)}>{datum}</text>'
    b+=tx
    b+=rect(20,52,120,136,DARK,8)
    return b

def lamp_head(cx,cy,R,lit_expr='out.lit',press=None):
    s=g(circ(cx,cy,R+12,'#000','none',0,data_fill='param.color',opacity='.30')+circ(cx,cy,R+6,'#000','none',0,data_fill='param.color',opacity='.30'),data_show=lit_expr)
    s+=circ(cx,cy,R+4,STEEL,LINE)
    s+=circ(cx,cy,R,'#888',LINE,1,data_fill='param.color')
    s+=circ(cx,cy,R,'#0d0f12','none',0,opacity='.55',data_show='!'+lit_expr)
    s+=circ(cx,cy,R*.16,'#fff','none',0,opacity='.25',data_show='!'+lit_expr)
    s+=circ(cx,cy,R,'url(#jwm-shine)','none',0,data_show=lit_expr)
    return s

# ---------------- piloto XB2
b=frame22([('X1',80)],[('X2',80)],'24VDC','param.rating')
b+=lamp_head(80,120,42)
b+=soot(80,120,46,40)
svg('lamp',160,240,b,LIT_DEFS)

# ---------------- piloto AD16 (monobloque)
b=rect(12,4,96,192,STEEL2,6)+band(12,4,96,30)+band(12,166,96,30)
b+=term(60,17,'X1',lab='none')+text(78,21,'X1',8.5,TXT,700)+term(60,183,'X2',side='b',lab='none')+text(78,187,'X2',8.5,TXT,700)
b+=jw(12,34,96)+f'<text x="103" y="44" font-size="9" font-weight="700" fill="#e9edf1" text-anchor="end" data-text="param.rating">24VDC</text>'
b+=rect(16,52,88,108,DARK,8)
b+=lamp_head(60,106,36)
b+=soot(60,106,40,34)
svg('lamp__ad16',120,200,b,LIT_DEFS)

# ---------------- pulsadores
def cap(cx,cy,R):
    up=circ(cx,cy,R,'#888',LINE,1,data_fill='param.color')+circ(cx,cy,R,'url(#jwm-cap)','none',0)+circ(cx,cy,R-7,'none','#000',1.2,opacity='.18')
    dn=circ(cx,cy+1,R-3,'#888',LINE,1,data_fill='param.color')+circ(cx,cy+1,R-3,'#000','none',0,opacity='.22')+circ(cx,cy+1,R-10,'none','#000',1.2,opacity='.25')
    return g(circ(cx,cy,R+6,STEEL,LINE)+circ(cx,cy,R+1.5,'#1c2026','none',0)+g(up,data_show='!out.pressed')+g(dn,data_show='out.pressed'),data_action='press',data_kind='momentary',style='cursor:pointer')
PB={'pushbutton-no':([('13',80)],[('14',80)],'1 NA'),
    'pushbutton-nc':([('11',80)],[('12',80)],'1 NC'),
    'pushbutton-nonc':([('13',60),('21',100)],[('14',60),('22',100)],'1 NA + 1 NC'),
    'pushbutton-nono':([('13',60),('23',100)],[('14',60),('24',100)],'2 NA')}
for name,(tt,bb,d) in PB.items():
    b=frame22(tt,bb,d)+cap(80,120,40)
    svg(name,160,240,b,LIT_DEFS)

# pulsador luminoso: lente que se enciende y se hunde
b=frame22([('13',60),('X1',100)],[('14',60),('X2',100)],'24VDC','param.rating')
head_up=lamp_head(80,120,40)
head_dn=lamp_head(80,121,37)
b+=g(circ(80,120,46,STEEL,LINE)+g(head_up,data_show='!out.pressed')+g(head_dn,data_show='out.pressed'),data_action='press',data_kind='momentary',style='cursor:pointer')
b+=soot(80,120,44,38)
svg('pushbutton-lit',160,240,b,LIT_DEFS)

# ---------------- parada de emergencia (hongo Ø40 sobre placa amarilla)
b=frame22([('11',60),('23',100)],[('12',60),('24',100)],'1 NC + 1 NA')
b+=circ(80,120,62,'#f2c230',LINE)+text(80,72,'EMERGENCIA',7.5,'#3a2f00',800)
up=(circ(80,120,22,'#3d9a4a',LINE)+circ(80,120,48,'#c9302c',LINE)+circ(80,120,48,'url(#jwm-cap)','none',0)+circ(80,120,36,'none','#000',1.2,opacity='.18'))
dn=(circ(80,121,44,'#9c2421',LINE)+circ(80,121,44,'#000','none',0,opacity='.18')+circ(80,121,32,'none','#000',1.2,opacity='.25')+text(80,124,'ENCLAVADO',7.5,'#ffd9d6',800))
b+=g(g(up,data_show='!out.pressed')+g(dn,data_show='out.pressed'),data_action='press',data_kind='toggle',style='cursor:pointer')
svg('emergency-stop',160,240,b,LIT_DEFS)

# ---------------- selectores
def selector(name,tt,bb,datum,options,rot,marks,key=False):
    b=frame22(tt,bb,datum)
    for ang,lbl in marks:
        import math
        r=55; x=80+r*math.sin(math.radians(ang)); y=120-r*math.cos(math.radians(ang))
        b+=text(round(x,1),round(y+3.5,1),lbl,10,LIGHT,800)
    if key:
        knob=(circ(80,120,32,'#d8dde3',LINE)+circ(80,120,26,'#b9c0c8',LINE,1)+rect(76,98,8,44,'#2b3138',2,'none',0)
              +path('M80 88 v-8',stroke=JWG,sw=3,stroke_linecap='round'))
        b+=circ(80,120,40,STEEL,LINE)
    else:
        knob=(circ(80,120,36,'#2b3138',LINE)+circ(80,120,36,'url(#jwm-cap)','none',0)
              +rect(72,86,16,68,'#3a414b',4,LINE,1)+rect(77,90,6,18,'#f4f6f8',2,'none',0))
        b+=circ(80,120,42,STEEL,LINE)
    b+=g(g(knob,data_rotate=rot),data_action='position',data_kind='cycle',data_options=options,style='cursor:pointer')
    svg(name,160,240,b,LIT_DEFS)
selector('selector-2',[('13',60),('21',100)],[('14',60),('22',100)],'0 – I','0,1','out.position:0:1:-45:45:80:120',[(-45,'0'),(45,'I')])
selector('selector-3',[('13',60),('23',100)],[('14',60),('24',100)],'I – 0 – II','-1,0,1','out.position:-1:1:-45:45:80:120',[(-45,'I'),(0,'0'),(45,'II')])
selector('selector-key',[('13',60),('21',100)],[('14',60),('22',100)],'llave 0 – I','0,1','out.position:0:1:-45:45:80:120',[(-45,'0'),(45,'I')],key=True)

# ---------------- potenciómetro de panel (bornes 1 2 3 arriba)
import math
b=rect(14,4,132,232,STEEL2,6)+band(14,4,132,30)
for t,x in [('1',40),('2',80),('3',120)]: b+=term(x,17,t,lab='none')+text(x+13,21,t,8.5,TXT,700)
b+=jw(14,34,132,'10 kΩ')
b+=rect(20,52,120,176,DARK,8)
for i in range(11):
    ang=-135+27*i; r1,r2=50,(58 if i%5==0 else 55)
    x1=80+r1*math.sin(math.radians(ang)); y1=120-r1*math.cos(math.radians(ang))
    x2=80+r2*math.sin(math.radians(ang)); y2=120-r2*math.cos(math.radians(ang))
    b+=path(f'M{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}',stroke=LIGHT,sw=1.6)
    if i%5==0:
        xt=80+66*math.sin(math.radians(ang)); yt=120-66*math.cos(math.radians(ang))
        b+=text(round(xt,1),round(yt+3.5,1),str(i),9,LIGHT,700)
knob=(circ(80,120,36,'#2b3138',LINE)+circ(80,120,36,'url(#jwm-cap)','none',0)+circ(80,120,26,'#353b44',LINE,1)+rect(78,88,4,20,JWG,2,'none',0))
b+=circ(80,120,42,STEEL,LINE)
b+=g(g(knob,data_rotate='out.pos|param.posicion:0:100:-135:135:80:120'),data_action='pos',data_kind='drag',data_drag='y:0:-1.2:0:100',style='cursor:ns-resize')
b+=text(80,212,'arrastrar ↕',8.5,'#9aa3ad',600)
svg('potentiometer',160,240,b,LIT_DEFS)

# ---------------- zumbador AD16 (160 x 200)
b=rect(22,4,116,192,STEEL2,6)+band(22,4,116,30)+band(22,166,116,30)
b+=term(80,17,'+',lab='none')+text(98,21,'+',10,TXT,800)+term(80,183,'-',side='b',lab='none')+text(98,187,'−',10,TXT,800)
b+=jw(22,34,116,'24 VDC')
b+=rect(28,52,104,108,DARK,8)
b+=circ(80,106,42,STEEL,LINE)+circ(80,106,36,'#2b3138',LINE,1)
for r in (8,16,24,31):
    b+=circ(80,106,r,'none','#4a525c',2.2,stroke_dasharray='3 3')
waves=''.join(path(f'M{80+dx} {106-h} q{s*8} {h} 0 {2*h}',stroke=LEDON,sw=3,stroke_linecap='round',opacity=op)
               for dx,s,h,op in [(-46,-1,16,'.9'),(-54,-1,24,'.55'),(46,1,16,'.9'),(54,1,24,'.55')])
b+=g(waves,data_show='out.sounding')
b+=circ(80,106,36,LEDON,'none',0,opacity='.18',data_show='out.sounding')
svg('buzzer',160,200,b,LIT_DEFS)

# ---------------- voltímetro y amperímetro AD16-22 (120 x 200)
def meter(name,unit,rng=None):
    b=rect(12,4,96,192,STEEL2,6)+band(12,4,96,30)+band(12,166,96,30)
    b+=term(60,17,'1',lab='none')+text(78,21,'1',8.5,TXT,700)+term(60,183,'2',side='b',lab='none')+text(78,187,'2',8.5,TXT,700)
    b+=jw(12,34,96)
    b+=f'<text x="103" y="44" font-size="9" font-weight="700" fill="#e9edf1" text-anchor="end"{a(data_text=rng)}>{rng and "60-500VAC" or unit}</text>'
    b+=rect(16,52,88,108,DARK,8)
    b+=circ(60,106,40,STEEL,LINE)+circ(60,106,34,'#14181d',LINE,1)
    b+=rect(30,94,60,26,'#0b1a10',3,'#2a3a2e',1)
    b+=f'<text x="86" y="113" font-size="17" font-weight="700" fill="{LEDON}" text-anchor="end" font-family="Consolas,DejaVu Sans Mono,monospace" data-text="out.lcd">---</text>'
    b+=text(60,134,unit,9,'#9aa3ad',700)
    svg(name,120,200,b,LIT_DEFS)
meter('voltmeter','V','param.range')
meter('ammeter','A')
print('mando ok')
