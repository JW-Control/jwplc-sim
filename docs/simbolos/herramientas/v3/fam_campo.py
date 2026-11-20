# Campo, a escala reducida: motores, electroválvulas, finales, sensores, interruptores, transmisores, torre, calibrador, PC.
import kit
kit.replica()
from kit import *
import math
DEFS='''<pattern id="jwc-hys" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#f0a020" fill-opacity=".18"/><line x1="0" y1="0" x2="0" y2="5" stroke="#f0a020" stroke-width="1.4"/></pattern>'''
def lbl(x,y,s,size=8.5,fill=TXT,anchor='middle',w=700):
    return text(x,y,s,round(size*1.2,1),fill,800,anchor,stroke='#ffffff',stroke_width='2.6',paint_order='stroke',stroke_linejoin='round') if fill==TXT else text(x,y,s,round(size*1.15,1),fill,800,anchor)
def dtext(x,y,expr,sample,size=10,fill=TXT,anchor='middle',w=800,mono=False,show=None):
    ff=' font-family="Consolas,DejaVu Sans Mono,monospace"' if mono else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{w}" fill="{fill}" text-anchor="{anchor}"{ff}{a(data_text=expr,data_show=show)}>{sample}</text>'

# ------------------------------------------------ motores (320 x 260), vista lateral, bornera arriba
def motor(name,terms,kind='3~',cap=False,extra=''):
    W=320
    xs=[x for _,x in terms]; x0=min(xs)-24; x1=max(xs)+24
    b=rect(x0,4,x1-x0,54,BAND,4)
    for t,x in terms:
        col='#2f8a3a' if t=='PE' else TXT
        b+=term(x,22,t,lab='none')+text(x,46,t,9,col,700)
    cx=(x0+x1)/2
    b+=rect(cx-34,58,68,14,'#2a568c',0)
    if cap:
        b+=rect(64,52,52,22,'#3a414b',10)+lbl(90,67,'cap.',8,LIGHT)
    b+=rect(56,72,180,110,'#2f62a0',12)
    for i in range(6): b+=rect(64,84+i*16,166,6,'#244f86',3,'none',0)  # aletas axiales de la carcasa
    b+=path('M236 84 h28 q8 0 8 8 v70 q0 8 -8 8 h-28z',fill='#2a568c')
    for i in range(5): b+=path(f'M244 {96+i*15} h22',stroke=BLUE2,sw=3,stroke_linecap='round')
    b+=rect(18,118,38,18,STEEL,3)+rect(26,123,14,6,'#8b949e',1,'none',0)
    b+=path('M78 182 l-10 22 h48 l-10 -22z M176 182 l-10 22 h48 l-10 -22z',fill='#244c7c')
    # indicador de giro (gira con la velocidad)
    b+=circ(196,127,24,'#eaf1fb',LINE)
    fan=''.join(path(f'M196 127 L{196+18*math.sin(math.radians(k*120)):.1f} {127-18*math.cos(math.radians(k*120)):.1f}',stroke='#2f62a0',sw=5,stroke_linecap='round') for k in range(3))
    b+=g(fan+circ(196,127,5,DARK,'none',0),data_spin='out.speed:196:127:3')
    b+=text(118,128,f'M {kind}',16,'#eaf1fb',800)
    b+=extra
    b+=dtext(140,226,'param.carga:d0:%','75 %',10,'#8fbff2',anchor='middle',w=700)
    b+=text(110,226,'carga',10,'#8fbff2',600,'end')
    b+=tag(146,96,'FALTA DE FASE',AMBER,fg='#2b1a00',show='out.faltaFase')
    b+=soot(146,128,80,46)
    svg(name,W,260,b,DEFS)
motor('motor-3ph',[('U1',100),('V1',140),('W1',180),('PE',220)])
motor('motor-3ph__6cables',[('U1',40),('V1',80),('W1',120),('W2',160),('U2',200),('V2',240),('PE',280)])
motor('motor-2v',[('1U',40),('1V',80),('1W',120),('2U',160),('2V',200),('2W',240),('PE',280)],'3~ 2V',
      extra=dtext(146,246,'out.velocidad','',10,'#5aa9ff',w=800)+tag(146,150,'DOS VELOCIDADES A LA VEZ',RED,show='out.conflicto'))
rpm=dtext(146,246,'out.rpm:d0:rpm','',11,'#5aa9ff',w=800)
motor('motor-1ph',[('U1',140),('U2',180),('PE',220)],'1~',cap=True,extra=rpm+tag(146,150,'ZUMBA: NO ARRANCA',RED,show='out.bloqueado'))
motor('motor-1ph__4cables',[('U1',120),('U2',160),('Z1',200),('Z2',240),('PE',280)],'1~',cap=True,extra=rpm+tag(146,150,'ZUMBA: NO ARRANCA',RED,show='out.bloqueado'))

# Motor genérico (220 x 200): carcasa metálica gris acero compacta (230 VAC / 24 VDC),
# visualmente distinto de los WEG azules (motor-1ph / motor-3ph).
def motor_generic():
    b=band(56,4,108,52,4)
    for t,x in [('U1',80),('U2',140)]: b+=term(x,22,t,lab='none')+lbl(x,46,t,9)
    b+=rect(86,56,48,12,'#6b7581',0,LINE,2)
    b+=rect(46,68,126,90,STEEL,10,LINE,2.2)
    b+=path('M64 68 H56 q-10 0 -10 10 V148 q0 10 10 10 H64 Z',fill=STEEL2,stroke=LINE,sw=2.2)
    b+=path('M172 76 h18 q8 0 8 8 v58 q0 8 -8 8 h-18 Z',fill='#7d868f',stroke=LINE,sw=2.2)
    for i in range(4): b+=path(f'M178 {90+i*15} h14',stroke='#262b33',sw=3,stroke_linecap='round')
    b+=rect(40,97,6,32,'#5b6570',2,LINE,1.8)
    b+=rect(14,104,26,18,'#dde1e6',3,LINE,2.2)+rect(19,109,13,6,'#6b7581',1,'none',0)
    b+=path('M66 158 l-8 20 h34 l-8 -20 Z M136 158 l-8 20 h34 l-8 -20 Z',fill='#6b7581',stroke=LINE,sw=2.2)
    b+=circ(144,113,21,'#f4f6f8',LINE,2.2)
    fan=''.join(path(f'M144 113 L{144+15*math.sin(math.radians(k*120)):.1f} {113-15*math.cos(math.radians(k*120)):.1f}',stroke='#262b33',sw=4.5,stroke_linecap='round') for k in range(3))
    b+=g(fan+circ(144,113,4.5,'#5b6570','none',0)+circ(144,100,2.2,'#2f8cff','none',0),data_spin='out.speed:144:113:3')
    b+=text(93,109,'M',18,'#1f2328',900)
    b+=g(text(93,126,'230 V~',9.5,'#2b3138',800),data_show='param.rating=230VAC')
    b+=g(text(93,126,'24 V=',9.5,'#1f6fd1',800),data_show='param.rating=24VDC')
    b+=g(text(110,193,'↻ adelante',9.5,'#1f7a3a',800),data_show='out.speed>0.01')
    b+=g(text(110,193,'↺ reversa',9.5,'#1f6fd1',800),data_show='out.speed&lt;-0.01')
    b+=soot(116,113,60,40)
    svg('motor',220,200,b,DEFS)
motor_generic()

# ------------------------------------------------ electroválvula 5/2 + cilindro
PRESS=AIR; EXH='#9cc8f5'
def cylinder(stroke=80):
    rod=rect(150,38,184,12,'#f4f6f8',2)+rect(334,33,16,22,'#b9c0c8',2)
    b=g(rod,data_translate=f'out.position:0:1:x:{stroke}')
    b+=rect(20,24,250,40,'#e3e7eb',4)
    b+=rect(14,18,26,52,'#b9c0c8',3)+rect(250,18,26,52,'#b9c0c8',3)
    b+=lbl(145,49,'Ø20 × 100',11)
    for x in (27,263): b+=circ(x,70,5,'#2f8cff',LINE,1)
    return b
def hoses(expr_ext, xa, xb):
    # A = trasera (sale), B = delantera (entra)
    pa=f'M27 75 V96 Q27 104 35 104 H{xa-8} Q{xa} 104 {xa} 112 V126'
    pb=f'M263 75 V96 Q263 104 255 104 H{xb+8} Q{xb} 104 {xb} 112 V126'
    s=g(path(pa,stroke=PRESS,sw=5,stroke_linecap='round')+path(pb,stroke=EXH,sw=5,stroke_linecap='round'),data_show=expr_ext)
    s+=g(path(pa,stroke=EXH,sw=5,stroke_linecap='round')+path(pb,stroke=PRESS,sw=5,stroke_linecap='round'),data_show='!'+expr_ext)
    return s
def valve_body(x,expr_ext):
    # cuerpo 104 x 54 con símbolo de corredera 5/2
    b=rect(x,126,104,54,BODY,3)
    for xx,n in [(x+30,'A'),(x+70,'B')]: b+=circ(xx,128,5,'#2f8cff',LINE,1)+lbl(xx+9,142,n,9,TXT,600,'start')
    sym=f'<g stroke="{TXT}" stroke-width="1.2" fill="none"><rect x="{x+16}" y="148" width="32" height="20"/><rect x="{x+48}" y="148" width="32" height="20"/></g>'
    # casilla izquierda activa con la bobina: P→A
    a1=path(f'M{x+21} 164 l20 -12 M{x+36} 152 h5 v4 M{x+43} 164 l-4 -4',stroke=TXT,sw=1.2)
    a2=path(f'M{x+54} 152 v12 M{x+74} 164 v-12 M{x+71} 155 l3 -3 l3 3',stroke=TXT,sw=1.2)
    hl_l=rect(x+16,148,32,20,LEDON,0,'none',0,opacity='.35',data_show=expr_ext)
    hl_r=rect(x+48,148,32,20,'#9cc8f5',0,'none',0,opacity='.45',data_show='!'+expr_ext)
    b+=hl_l+hl_r+sym+a1+a2
    for xx,n in [(x+20,'R'),(x+60,'P'),(x+80,'S')]: b+=lbl(xx,177,n,8.5,TXT,600)
    b+=circ(x+50,180,5,'#2f8cff',LINE,1)+path(f'M{x+50} 185 V218',stroke='#2f8cff',sw=5,stroke_linecap='round')
    return b
def coil(x,expr_led,flip=False):
    b=rect(x,122,58,62,DARK,4)
    lx=x+46 if not flip else x+12
    b+=led(lx,134,expr_led,4)
    b+=g(text(x+29,160,'24 VDC',10,LIGHT,700),data_show='param.coil=24VDC')
    b+=g(text(x+29,160,'230 VAC',10,LIGHT,700),data_show='param.coil=230VAC')
    b+=text(x+29,174,'bobina',8,'#9aa3ad',600)
    return b

# monoestable 440 x 220: bornes A1 A2 abajo a la derecha
b=cylinder()+hoses('out.energized',110,150)+valve_body(80,'out.energized')+coil(184,'out.energized')
b+=path('M242 168 H272 Q280 168 280 176 V184',stroke=DARK,sw=4)
b+=band(256,184,88,34)+term(280,202,'A1',side='b',lab='none',r=7)+lbl(280,192,'A1',7.5)+term(320,202,'A2',side='b',lab='none',r=7)+lbl(320,192,'A2',7.5)
b+=soot(213,150,40,30)
svg('solenoid-valve',440,220,b,DEFS)

# biestable 440 x 220: bobina A+ a la izquierda, A− a la derecha, borneras alineadas bajo cada bobina
b=cylinder()
b+=hoses('out.spoolA',170,210)+valve_body(140,'out.spoolA')
b+=coil(80,'out.coilPlus',flip=True)+text(109,116,'A+',9,TXT,800)
b+=coil(246,'out.coilMinus')+text(275,116,'A−',9,TXT,800)
b+=band(60,184,80,34)+term(80,202,'A+1',side='b',lab='none',r=7)+lbl(80,192,'A+1',7.5)+term(120,202,'A+2',side='b',lab='none',r=7)+lbl(120,192,'A+2',7.5)
b+=band(240,184,80,34)+term(260,202,'A-1',side='b',lab='none',r=7)+lbl(260,192,'A−1',7.5)+term(300,202,'A-2',side='b',lab='none',r=7)+lbl(300,192,'A−2',7.5)
b+=soot(190,150,40,30)
svg('solenoid-valve-2',440,220,b,DEFS)

# ------------------------------------------------ finales de carrera
def lswitch(name,H,body_col,pivot,lever_len,roller_r,rot_expr,datum):
    W=120; py=pivot
    b=''
    lever=path(f'M60 {py} L{60+lever_len*0.55:.0f} {py-lever_len*0.83:.0f}',stroke='#1f2328',sw=10,stroke_linecap='round')
    lever+=path(f'M60 {py} L{60+lever_len*0.55:.0f} {py-lever_len*0.83:.0f}',stroke='#7d868f',sw=6,stroke_linecap='round')
    rx=60+lever_len*0.55; ry=py-lever_len*0.83
    lever+=circ(round(rx),round(ry),roller_r,'#2b2f35')+circ(round(rx),round(ry),roller_r*0.4,'#c3c9d0')
    b+=g(lever,data_rotate=rot_expr,data_action='actuate',data_kind='momentary',style='cursor:pointer')
    bh=H-py-40
    b+=rect(22,py-8,76,bh,body_col,6)
    b+=rect(28,py-16,64,30,'#8f98a2',5)          # cabeza giratoria
    b+=rect(30,py+22,60,bh*0.5,'#eef0f2',3)       # tapa con sus 4 tornillos
    for xx,yy in [(36,py+28),(84,py+28),(36,py+16+bh*0.5),(84,py+16+bh*0.5)]: b+=circ(xx,yy,2.6,'#9aa3ad','#1f2328',1)
    b+=circ(60,py,9,STEEL)+circ(60,py,3,'#1f2328','none',0)
    b+=led(60,py+(H-py-40)*0.5+8,'out.actuated',3.5,'#ff5a4e')
    b+=text(60,H-56,datum,10,'#ffffff' if body_col.startswith('#3') else '#1e2226',900)
    b+=band(14,H-46,92,40)
    for t,x in [('13',20),('14',40),('21',80),('22',100)]: b+=term(x,H-14,t,side='b',lab='none',r=7)+lbl(x,H-28,t,7.5)
    b+=lbl(30,H-38,'NA',6.5,MUTED,600)+lbl(90,H-38,'NC',6.5,MUTED,600)
    return b
def lswitch_down(H,body_col,pivot_from_bottom,lever_len,roller_r,rot_deg,datum):
    py=H-pivot_from_bottom
    b=''
    rx=60+lever_len*0.55; ry=py+lever_len*0.83
    lever=path(f'M60 {py} L{rx:.0f} {ry:.0f}',stroke='#1f2328',sw=10,stroke_linecap='round')
    lever+=path(f'M60 {py} L{rx:.0f} {ry:.0f}',stroke='#7d868f',sw=6,stroke_linecap='round')
    lever+=circ(round(rx),round(ry),roller_r,'#2b2f35')+circ(round(rx),round(ry),roller_r*0.4,'#c3c9d0')
    b+=g(lever,data_rotate=f'out.actuated:0:1:0:{rot_deg}:60:{py}',data_action='actuate',data_kind='momentary',style='cursor:pointer')
    bh=py-40
    b+=rect(22,48,76,bh,body_col,6)
    b+=rect(28,py-14,64,30,'#8f98a2',5)          # cabeza giratoria abajo
    b+=rect(30,68,60,bh*0.5,'#eef0f2',3)         # tapa con sus 4 tornillos
    for xx,yy in [(36,74),(84,74),(36,62+bh*0.5),(84,62+bh*0.5)]: b+=circ(xx,yy,2.6,'#9aa3ad','#1f2328',1)
    b+=circ(60,py,9,STEEL)+circ(60,py,3,'#1f2328','none',0)
    b+=led(60,68+bh*0.25,'out.actuated',3.5,'#ff5a4e')
    b+=text(60,60,datum,10,'#ffffff' if body_col.startswith('#3') else '#1e2226',900)
    b+=band(14,6,92,40)
    for t,x in [('13',20),('14',40),('21',80),('22',100)]: b+=term(x,14,t,side='t',lab='none',r=7)+lbl(x,32,t,7.5)
    b+=lbl(30,42,'NA',6.5,MUTED,600)+lbl(90,42,'NC',6.5,MUTED,600)
    return b
b=lswitch('limit-switch__compacto',200,'#3f6fa8',62,40,11,'out.actuated:0:1:0:28:60:62','1NA + 1NC')
svg('limit-switch__compacto',120,200,b,DEFS)
b=lswitch('limit-switch',240,'#c9ced4',74,52,14,'out.actuated:0:1:0:25:60:74','1NA + 1NC')
svg('limit-switch',120,240,b,DEFS)
svg('limit-switch__compacto__abajo',120,200,lswitch_down(200,'#3f6fa8',62,40,11,-28,'1NA + 1NC'),DEFS)
svg('limit-switch__xckj__abajo',120,240,lswitch_down(240,'#c9ced4',74,52,14,-25,'1NA + 1NC'),DEFS)

# ------------------------------------------------ sensores inductivo y capacitivo (620 x 260), zona exagerada
def prox(name,Sn,Hy,hpx,cap=False):
    b=''
    b+=g(g(path(f'M248 46 L418 16.6 V143.4 L248 114 Z',fill=JWG,fill_opacity='.35',stroke=JWG,sw=1.2),opacity='.4'),data_show='!out.detecting')
    b+=g(path(f'M248 46 L418 16.6 V143.4 L248 114 Z',fill=JWG,fill_opacity='.35',stroke=JWG,sw=1.2),data_show='out.detecting')
    b+=path(f'M418 16.6 L{418+hpx} 8 V152 L418 143.4 Z',fill='url(#jwc-hys)',stroke=AMBER,sw=1.2)
    b+=path('M418 143.4 V172',stroke=JWG,sw=1.2)
    b+=text(414,168,f'detección {Sn}',10,'#a5d67a',700,'end')+text(422+hpx,168,f'histéresis {Hy}',10,AMBER,700,'start')
    b+=dtext(414,184,'out.snTxt','Sn 8,0 mm',9,'#c9cdd3',anchor='end',w=700)
    # cable
    for t,x,col,l1 in [('BN',40,'#8a5a2b','+V'),('BU',80,'#2f62d6','0 V'),('BK',120,'#1b1d20','salida')]:
        b+=path(f'M60 80 H42 Q30 80 30 92 V170 C30 190 {x} 184 {x} 202 V236',stroke=col,sw=3.4)
        b+=term(x,242,t,side='b',lab='none',r=7)+text(x+10,216,l1,9,LIGHT,800,'start')+text(x+10,227,t,8,'#9aa0a6',700,'start')
    b+=path('M60 80 H42 Q30 80 30 92 V170',stroke='#33373d',sw=12,stroke_linecap='round')
    # cuerpo
    body_col = '#5b6570' if cap else STEEL
    b+=rect(60,56,34,48,DARK,4)
    b+=rect(94,46,154,68,body_col,3)
    for x in range(100,240,8): b+=path(f'M{x} 48 l2 64',stroke='#000',sw=.8,opacity='.15')
    b+=rect(148,30,14,100,'#9aa3ad',2)+rect(176,30,14,100,'#9aa3ad',2)
    b+=rect(222,46,26,68,'#e08a2b' if not cap else '#d9dde2',3)
    b+=g(circ(77,52,9,'#ff5a4e','none',0,opacity='.35')+circ(77,52,4.5,'#ff5a4e',LINE,1),data_show='out.output')
    b+=circ(77,52,4.5,'#4a1410',LINE,1,data_show='!out.output')
    if cap:
        b+=circ(108,39,8,STEEL)+g(path('M108 39 v-7',stroke=DARK,sw=2.5,stroke_linecap='round'),data_rotate='param.sensitivity:20:100:-120:120:108:39')+lbl(108,24,'SENS',7,LIGHT)
    # placa de tipo, sin marca
    b+=rect(98,126,120,28,'#f4f6f8',3)
    for o,c,t in [('pnp','no','PNP · NA'),('pnp','nc','PNP · NC'),('npn','no','NPN · NA'),('npn','nc','NPN · NC')]:
        b+=g(g(text(158,139,t,10,TXT,800),data_show=f'param.contact={c}'),data_show=f'param.output={o}')
    b+=text(158,150,'M18 · 10-30 VDC',8,MUTED,600)
    # pieza arrastrable
    tgt=rect(244,12,32,122,'#000',0,'none',0,opacity='0')+rect(248,30,24,100,'#c3c9d0' if not cap else '#d8c9a6',2)
    for y in (72,80,88): tgt+=path(f'M254 {y} H266',stroke=LINE,sw=1)
    tgt+=rect(235,11,50,16,'#101317',3,'none',0,fill_opacity='.85')+dtext(260,23,'out.distance|param.distance:mm','12,0 mm',10,'#e8eaed')
    if cap: tgt+=dtext(260,144,'param.material','metal',9,'#c9cdd3',w=700)
    vals='0,8,8.8,20' if not cap else '0,8,9.6,20'; px='0,170,220,320' if not cap else '0,170,230,320'
    b+=g(tgt,data_translate=f'out.distance|param.distance:{vals}:x:{px}',data_action='distance',data_kind='drag',data_drag=f'x:248:{vals}:{px}',style='cursor:ew-resize')
    svg(name,620,260,b,DEFS)
prox('sensor-inductive','8,0 mm','8,8 mm',50)
prox('sensor-capacitive','8,0 mm','9,6 mm',60,cap=True)

# ------------------------------------------------ interruptor de nivel tipo pera (160 x 300)
b=rect(4,40,152,256,'#f4f6f8',4,LINE)
b+=rect(5,236,150,59,WATER,0,'none',0,opacity='.8',data_show='!out.up')
b+=rect(5,120,150,175,WATER,0,'none',0,opacity='.8',data_show='out.up')
for t,x,c in [('BK',40,'#1b1d20'),('BN',80,'#8a5a2b'),('BU',120,'#2f62d6')]:
    b+=term(x,14,t,lab='none',r=7)+text(x+11,18,t,8,'#9aa3ad',700,'start')
b+=path('M40 22 V34 Q40 40 60 40 M80 22 V40 M120 22 V34 Q120 40 100 40',stroke='#33373d',sw=3)
b+=path('M80 40 V70',stroke='#33373d',sw=6)+rect(70,66,20,6,'#555',1,'none',0)
fl_dn=path('M80 70 Q60 150 72 220',stroke='#33373d',sw=5)+f'<ellipse cx="74" cy="236" rx="18" ry="26" fill="#3a414b" stroke="{LINE}" stroke-width="1.2"/>'
fl_up=path('M80 70 Q110 96 112 108',stroke='#33373d',sw=5)+f'<ellipse cx="120" cy="118" rx="26" ry="16" fill="#3a414b" stroke="{LINE}" stroke-width="1.2" transform="rotate(-25 120 118)"/>'
b+=g(g(fl_dn,data_show='!out.up')+g(fl_up,data_show='out.up'),data_action='float',data_kind='toggle',style='cursor:pointer')
b+=text(80,286,'clic: sube / baja',8,'#eaf1fb',700)
svg('float-switch',160,300,b,DEFS)

# ------------------------------------------------ porta-electrodos (160 x 320)
b=rect(4,60,152,256,'#f4f6f8',4,LINE)
b+=f'<clipPath id="jwc-tank"><rect x="5" y="61" width="150" height="254"/></clipPath>'
water=rect(-10,314,180,240,WATER,0,'none',0,opacity='.8')+path('M-10 314 H170',stroke='#8fd0ff',sw=2)+rect(40,302,80,18,'#000',0,'none',0,opacity='0')
b+=g(g(water,data_translate='out.nivel|param.nivel:0:100:y:-220',data_action='nivel',data_kind='drag',data_drag='y:314:-2.2:0:100',style='cursor:ns-resize'),clip_path='url(#jwc-tank)')
b+=rect(16,24,128,36,BAND,4)
for t,x,y2 in [('E1',40,150),('E2',80,230),('E3',120,290)]:
    b+=term(x,46,t,lab='none',r=7)+text(x,36,t,7.5,TXT,700)
    b+=path(f'M{x} 60 V{y2}',stroke='#5b6570',sw=4)+rect(x-3,y2-6,6,10,STEEL,1,LINE,1)
b+=g(circ(40,150,8,LEDON,'none',0,opacity='.5'),data_show='out.wet1')+g(circ(80,230,8,LEDON,'none',0,opacity='.5'),data_show='out.wet2')
b+=rect(14,292,44,18,'#101317',3,'none',0,fill_opacity='.85')+dtext(36,305,'out.nivel|param.nivel:d0:%','50 %',10,'#e8eaed')
svg('level-electrodes',160,320,b,DEFS)

# ------------------------------------------------ presostato y termostato (160 x 300)
def kp(name,expr,maxv,unit,drag,datum,adj):
    b=rect(14,4,132,276,BODY,6)
    b+=jw(14,10,132,datum)
    b+=rect(24,32,112,60,'#f4f6f8',4)+lbl(80,48,'ajuste',8,MUTED,600)
    b+=dtext(80,80,'out.ajusteTxt',adj,11,TXT)
    # escala y deslizador
    b+=rect(24,100,112,120,'#2b3138',4)
    b+=rect(52,24+0,0.1,0.1,'none',0,'none',0)
    b+=path('M112 206 V26',stroke='#4a525c',sw=6,stroke_linecap='round') if False else ''
    b+=path('M120 206 V112',stroke='#4a525c',sw=4,stroke_linecap='round')
    b+=dtext(70,179,'out.texto','—',13,LEDON,w=800,mono=True)
    b+=lbl(70,196,unit,8,'#9aa3ad',600)
    b+=g(lbl(70,130,'1 ─ 4 cerrado',8.5,LEDON),data_show='out.activado')+g(lbl(70,130,'1 ─ 2 cerrado',8.5,'#cfd5dc'),data_show='!out.activado')
    knob=rect(108,200,24,12,AMBER,3)+path('M112 206 h16',stroke='#2b1a00',sw=1)
    b+=g(knob,data_translate=f'{expr}:0:{maxv}:y:-90',data_action=expr.split('|')[0].split('.')[1],data_kind='drag',data_drag=drag,style='cursor:ns-resize')
    b+=band(14,228,132,40)
    for t,x in [('1',40),('2',80),('4',120)]: b+=term(x,248,t,side='b',lab='none')+lbl(x+13,238,t,8)
    b+=lbl(80,276,'2 NC · 4 NA',7.5,MUTED,600)
    svg(name,160,300,b,DEFS)
# El deslizador recorre 90 px (antes 180): la escala por px se ajusta a la mitad.
kp('pressure-switch','out.presion|param.presion',10,'bar','y:206:-9:0:10','presostato','3,0 – 4,0 bar')
kp('thermostat','out.temperatura|param.temperatura',120,'°C','y:206:-0.75:0:120','termostato','37,0 – 40,0 °C')

# ------------------------------------------------ transmisores RS-485 (200 x 260)
def tx(name,datum,ok_expr,bad_expr,val_expr,sample,unit_lbl,bad_lbl,probe):
    b=rect(20,20,160,40,BAND,4)
    for t,x,l in [('+',40,'+'),('-',80,'−'),('A',120,'A'),('B',160,'B')]: b+=term(x,40,t,lab='none',r=7)+text(x,30,l,8,TXT,800)
    b+=rect(30,60,140,116,BODY,8)+jw(30,66,140,datum)
    b+=rect(44,90,112,56,'#0b1a10',4,'#2a3a2e',1)
    b+=dtext(100,127,val_expr,sample,16,LEDON,w=800,mono=True)
    b+=g(lbl(100,104,'medición OK',8,'#9be37e'),data_show=ok_expr)
    b+=tag(100,160,bad_lbl,RED,show=bad_expr)
    b+=probe
    svg(name,200,260,b,DEFS)
probe_p=rect(84,176,32,26,STEEL,3)+rect(90,202,20,34,'#9aa3ad',2)+path('M92 210 h16 M92 218 h16 M92 226 h16',stroke=LINE,sw=1)+lbl(100,252,'G 1/4',8,'#9aa3ad')
probe_c=rect(84,176,32,30,'#3a414b',3)+rect(92,206,16,36,'#d9dde2',6)+lbl(100,256,'celda',8,'#9aa3ad')
tx('pressure-rs485','0–10 bar','out.sensor=ok','out.sensor=abierto','out.presion:d2:bar','4,00 bar','bar','SENSOR ABIERTO',probe_p)
tx('chlorine-rs485','cloro libre','out.celda=ok','out.celda=seca','out.cloro:d2:mg/L','1,00 mg/L','mg/L','CELDA SECA',probe_c)

# PT100 (260 x 200): cabezal visto desde arriba, bornes alrededor
b=circ(100,100,82,BODY,LINE)+circ(100,100,70,'#f4f6f8','#c9cfd6',1)
for t,x,y in [('B',40,78),('A',80,39),('-',120,39),('+',160,78)]:
    b+=term(x,y,t,lab='none',r=7.5)+text(x,y-12 if y<60 else y+20,{'-':'−24V','+':'+24V'}.get(t,t),8,TXT,800)
for t,x,y,col in [('R3',60,150,'#f4f6f8'),('R1',100,164,RED),('R2',140,150,RED)]:
    b+=circ(x,y,10,col,LINE,1,opacity='.5')+term(x,y,t,side='b',lab='none',r=7.5)+text(x,y-13,t,8,TXT,800)
b+=rect(70,90,60,24,DARK,3)+text(100,106,'PT100',10,LIGHT,800)
b+=rect(186,86,70,40,'#101317',4,'none',0)
b+=dtext(221,111,'out.temp:d1:°C','25,0 °C',11,LEDON,w=800,mono=True)
b+=g(lbl(221,140,'sonda OK',8,'#9be37e'),data_show='out.sonda=ok')
b+=tag(221,142,'ABIERTA',RED,show='out.sonda=abierta')+tag(221,142,'EN CORTO',RED,show='out.sonda=corto')
svg('pt100-rs485',260,200,b,DEFS)

# ------------------------------------------------ torre de señalización (120 x 360)
def lens(y,col,expr):
    off=rect(30,y,60,56,col,4,LINE,1)+rect(30,y,60,56,'#0d0f12',4,'none',0,opacity='.6')
    on=(rect(22,y-6,76,68,col,10,'none',0,opacity='.25')+rect(30,y,60,56,col,4,LINE,1)+rect(36,y+6,22,44,'#fff',3,'none',0,opacity='.35'))
    return g(off,data_show='!'+expr)+g(on,data_show=expr)
b=rect(40,4,40,14,'#3a414b',4)
b+=g(path('M28 12 q-8 -8 0 -16 M92 12 q8 -8 0 -16',stroke=LEDON,sw=2.5,stroke_linecap='round'),data_show='out.buzzer')
b+=lens(20,'#e0413b','out.red')+lens(80,'#f0a020','out.amber')+lens(140,'#3fbf4f','out.green')
b+=rect(30,200,60,30,'#3a414b',3)+dtext(60,219,'param.rating','24VDC',9,LIGHT,w=700)
b+=rect(54,230,12,60,'#9aa3ad',2)
b+=band(10,300,100,56)
for t,x,l in [('COM',20,'C'),('R',40,'R'),('A',60,'A'),('V',80,'V'),('Z',100,'Z')]: b+=term(x,342,t,side='b',lab='none',r=7)+text(x,326,l,8,TXT,800)
b+=text(60,312,'C · rojo · ámbar · verde · zumb.',6.5,MUTED,600)
svg('stack-light',120,360,b,DEFS)

# ------------------------------------------------ calibrador de lazo (200 x 300)
b=rect(20,4,160,292,'#f2c230',16)+rect(32,16,136,268,'#2b3138',10)
b+=rect(44,30,112,70,'#0b1a10',4,'#2a3a2e',1)
b+=dtext(150,52,'param.modo','4-20 mA',9,'#9be37e',anchor='end',w=700)
b+=dtext(150,86,'out.texto','12.00 mA',18,LEDON,anchor='end',w=800,mono=True)
b+=circ(100,170,40,'#3a414b',LINE)
for i in range(11):
    ang=-135+27*i; x1=100+44*math.sin(math.radians(ang)); y1=170-44*math.cos(math.radians(ang)); x2=100+50*math.sin(math.radians(ang)); y2=170-50*math.cos(math.radians(ang))
    b+=path(f'M{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}',stroke=LIGHT,sw=1.4)
knob=circ(100,170,30,'#4a525c',LINE)+rect(97,142,6,20,AMBER,2,'none',0)
b+=g(g(knob,data_rotate='out.valor|param.valor:0:100:-135:135:100:170'),data_action='valor',data_kind='drag',data_drag='y:0:-1.2:0:100',style='cursor:ns-resize')
b+=term(80,260,'+',side='b',lab='none')+text(80,242,'+',11,'#ff8a80',800)+term(120,260,'-',side='b',lab='none')+text(120,242,'COM',8,LIGHT,800)
b+=circ(80,260,11,'none',RED,2)+circ(120,260,11,'none','#111',2)
svg('signal-source',200,300,b,DEFS)

# ------------------------------------------------ PC con USB (160 x 160)
b=term(80,16,'USB',lab='none')+path('M80 24 V40',stroke='#33373d',sw=4)
b+=rect(20,40,120,80,DARK,6)+rect(28,48,104,64,'#16324f',3,'none',0)
b+=text(80,74,'PC · puerto',9,'#cfe0f5',600)+dtext(80,96,'param.com','COM20',16,'#eaf1fb',w=800)
b+=path('M8 124 H152 L140 140 H20 Z',fill=STEEL)
svg('usb-pc',160,160,b,DEFS)
print('campo ok')
