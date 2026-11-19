# Bloques de proceso y neumática de planta: edificio, filtro, montacargas, compresor, unidad de mantenimiento, clorador.
from kit import *
import math
DEFS='''<linearGradient id="jwp-tank" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4f86c6"/><stop offset=".45" stop-color="#6d9fd8"/><stop offset="1" stop-color="#2f62a0"/></linearGradient>
<linearGradient id="jwp-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e0605a"/><stop offset=".5" stop-color="#c9302c"/><stop offset="1" stop-color="#9c2421"/></linearGradient>
<linearGradient id="jwp-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c3c9d0"/><stop offset=".45" stop-color="#eef1f4"/><stop offset="1" stop-color="#9aa3ad"/></linearGradient>'''
def lbl(x,y,s,size=8.5,fill=TXT,anchor='middle',w=700): return text(x,y,s,size,fill,w,anchor)
def dtext(x,y,expr,sample,size=10,fill=TXT,anchor='middle',w=800,mono=False,show=None):
    ff=' font-family="Consolas,DejaVu Sans Mono,monospace"' if mono else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{w}" fill="{fill}" text-anchor="{anchor}"{ff}{a(data_text=expr,data_show=show)}>{sample}</text>'
def card(W,H,title):
    return rect(2,2,W-4,H-4,BODY,8)+jw(2,2,W-4,title,h=18,size=10)
def gauge(cx,cy,R,expr,v1,label,ticks=6):
    s=circ(cx,cy,R,'#f4f6f8',LINE)+circ(cx,cy,R-4,'none','#c9cfd6',1)
    for i in range(ticks+1):
        ang=-135+270*i/ticks; x1=cx+(R-10)*math.sin(math.radians(ang)); y1=cy-(R-10)*math.cos(math.radians(ang)); x2=cx+(R-5)*math.sin(math.radians(ang)); y2=cy-(R-5)*math.cos(math.radians(ang))
        s+=path(f'M{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}',stroke=TXT,sw=1.3)
    s+=g(path(f'M{cx} {cy} L{cx} {cy-R+12}',stroke=RED,sw=2.4,stroke_linecap='round'),data_rotate=f'{expr}:0:{v1}:-135:135:{cx}:{cy}')
    s+=circ(cx,cy,4,DARK,'none',0)+lbl(cx,cy+R*0.5,label,8,MUTED,700)
    return s
def knob(cx,cy,expr,v1,action,drag,lab):
    s=circ(cx,cy,30,'#3a414b',LINE)
    for i in range(7):
        ang=-135+45*i; x1=cx+34*math.sin(math.radians(ang)); y1=cy-34*math.cos(math.radians(ang)); x2=cx+39*math.sin(math.radians(ang)); y2=cy-39*math.cos(math.radians(ang))
        s+=path(f'M{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}',stroke=TXT,sw=1.3)
    k=circ(cx,cy,24,'#4a525c',LINE)+rect(cx-3,cy-22,6,16,AMBER,2,'none',0)
    s+=g(g(k,data_rotate=f'{expr}:0:{v1}:-135:135:{cx}:{cy}'),data_action=action,data_kind='drag',data_drag=drag,style='cursor:ns-resize')
    s+=lbl(cx,cy-46,lab,8.5,TXT,800)
    return s

# ------------------------------------------------ red de agua del edificio (360 x 400)
b=card(360,400,'red del edificio')
b+=gauge(70,120,46,'out.presion|param.presion0',10,'bar')
b+=dtext(70,190,'out.presion|param.presion0:d2:bar','3,00 bar',13,TXT)
# hidroneumático
b+=rect(36,208,68,96,'url(#jwp-tank)',30)+dtext(70,256,'param.hidro','24',13,'#fff')+lbl(70,270,'L',9,'#eaf1fb')
b+=path('M70 304 V318 H150 V150',stroke=WATER,sw=5)
b+=tag(70,330,'EN SECO',RED,show='out.seco')
# edificio
b+=rect(150,40,170,240,'#c9cfd6',3)
for r in range(6):
    for c in range(4):
        x=162+c*38; y=52+r*36
        b+=rect(x,y,26,24,'#7c8792',2,LINE,1)
        b+=rect(x,y,26,24,'#9fd0ff',2,'none',0,opacity='.85',data_show='out.qConsumo')
b+=rect(218,252,34,28,'#5b6570',2,LINE,1)
# lecturas
b+=rect(14,344,232,46,'#f4f6f8',4)
b+=lbl(24,362,'bombas',9,MUTED,700,'start')+dtext(236,362,'out.qBombas:d0:L/min','0 L/min',11,TXT,'end')
b+=lbl(24,380,'consumo',9,MUTED,700,'start')+dtext(236,380,'out.qConsumo:d0:L/min','0 L/min',11,TXT,'end')
b+=knob(300,330,'out.consumo|param.consumo',300,'consumo','y:0:-0.4:0:300','CONSUMO')
b+=dtext(300,388,'out.consumo|param.consumo:d0:L/min','60 L/min',10,TXT)
svg('building-water',360,400,b,DEFS,' data-terms="none"')

# ------------------------------------------------ filtro de arena (320 x 420)
b=card(320,420,'filtro de arena')
b+=rect(50,40,140,300,'url(#jwp-tank)',60)
b+=rect(64,150,112,150,'#e3cf9a',6,'none',0)+rect(64,262,112,38,'#b89a63',4,'none',0)
b+=rect(64,150,112,22,'#8a6a3a',0,'none',0,opacity='.6',data_show='out.colmatacion>50')
b+=rect(64,150,112,46,'#6b4f28',0,'none',0,opacity='.7',data_show='out.colmatacion>80')
b+=g(''.join(path(f'M{x} 290 V170 m-6 10 l6 -10 l6 10',stroke='#fff',sw=2.5,stroke_linecap='round') for x in (90,120,150))+rect(70,200,100,18,AMBER,3,'none',0)+lbl(120,213,'RETROLAVADO',9,'#2b1a00',800),data_show='out.lavando')
b+=path('M120 340 V372 H40 M120 372 H200',stroke=WATER,sw=5)
b+=g(path('M40 372 H16',stroke='#8a6a3a',sw=5),data_show='out.lavando')
b+=lbl(40,392,'Y2 desagüe',8.5,MUTED,700)+lbl(190,392,'Y1 → T2',8.5,MUTED,700)
b+=gauge(260,90,36,'out.dp|param.colmatacion0',2,'ΔP')
b+=dtext(260,146,'out.dp:d2:bar','0,00 bar',11,TXT)
b+=lbl(260,166,'colmatación',8,MUTED,700)+dtext(260,182,'out.colmatacion|param.colmatacion0:d0:%','40 %',11,TXT)
b+=knob(260,262,'out.turbidez|param.turbidez',200,'turbidez','y:0:-0.6:0:200','TURBIDEZ')
b+=dtext(260,312,'out.turbidez|param.turbidez:d0:NTU','20 NTU',10,TXT)
b+=g(rect(222,330,76,24,'#f4f6f8',4)+lbl(260,346,'COLMATAR',8.5,RED,800),data_action='colmatar',data_kind='momentary',style='cursor:pointer')
b+=lbl(240,392,'salida',8.5,MUTED,700,'start')+dtext(310,408,'out.qServicio:d0:L/min','0 L/min',11,TXT,'end')
svg('sand-filter',320,420,b,DEFS,' data-terms="none"')

# ------------------------------------------------ montacargas (300 x 520)
b=card(300,520,'montacargas')
b+=rect(50,30,160,412,'#2b3138',2)
for y,l in [(440,'PB'),(290,'P1'),(140,'P2')]:
    b+=path(f'M20 {y} H260',stroke=LINE,sw=3)+lbl(30,y-40,l,11,TXT,800)
for i,y in enumerate([342,192,42]):
    closed=rect(214,y,12,98,'#9aa3ad',1,LINE,1)+path(f'M214 {y}l12 98M226 {y}l-12 98',stroke=LINE,sw=1)
    opened=rect(232,y,24,98,'#9aa3ad',1,LINE,1,opacity='.6')+rect(212,y,6,98,AMBER,0,'none',0,opacity='.8')+text(244,y+52,'ABIERTA',7,TXT,800,transform=f'rotate(-90 244 {y+52})')
    b+=g(rect(206,y,60,98,'#000',0,'none',0,opacity='0')+g(closed,data_show=f'!out.puerta{i}')+g(opened,data_show=f'out.puerta{i}'),data_action=f'puerta{i}',data_kind='toggle',style='cursor:pointer')
cab=rect(70,346,140,92,'#e7eaee',3)+rect(70,346,140,10,'#c9cfd6',0,LINE,1)
load=g(rect(112,394,40,42,'#c9a26a',2,LINE,1)+rect(154,408,28,28,'#c9a26a',2,LINE,1),data_action='sobrecarga',data_kind='toggle',style='cursor:pointer')
over=g(rect(100,360,80,16,RED,3,'none',0)+lbl(140,372,'SOBRECARGA',8.5,'#fff',800)+rect(80,410,30,26,'#c9a26a',2,LINE,1),data_show='out.sobrecarga')
b+=g(cab+load+over,data_translate='out.altura|param.altura0:-0.4,6.4:y:20,-320')
b+=rect(110,470,80,32,DARK,4)+dtext(150,494,'out.pisoTxt','PB',17,LEDON,mono=True)
svg('lift',300,520,b,DEFS,' data-terms="none"')

# ------------------------------------------------ compresor (360 x 240)
b=band(40,8,140,48)
b+=term(80,32,'L',lab='none')+lbl(80,52,'L',8.5)+term(140,32,'N',lab='none')+lbl(140,52,'N',8.5)
b+=rect(20,140,300,70,'url(#jwp-red)',35)+lbl(170,182,'50 L · 8 bar',11,'#fff',800)
b+=path('M60 210 l-8 20 h30 l-8 -20z M260 210 l-8 20 h30 l-8 -20z',fill='#3a414b')
b+=rect(40,70,100,66,'#2f62a0',6)+lbl(90,108,'M 1~',12,'#eaf1fb',800)
b+=g(circ(152,84,7,LEDON,'none',0)+lbl(152,72,'ON',8,'#2f8a3a',800),data_show='out.running')
b+=rect(150,92,64,48,'#9aa3ad',4)
b+=gauge(270,82,40,'out.pressure|param.start',12,'bar')
b+=rect(232,4,76,18,'#101317',3,'none',0,fill_opacity='.85')+dtext(270,17,'out.pressure:d1:bar','— bar',10,'#e8eaed')
svg('compressor',360,240,b,DEFS)

# ------------------------------------------------ unidad de mantenimiento (200 x 280)
b=rect(10,108,180,14,AIR,2,'none',0)+lbl(24,102,'entrada',8,MUTED,700,'start')+lbl(176,102,'salida',8,MUTED,700,'end')
b+=rect(70,90,60,50,'url(#jwp-steel)',4)
b+=gauge(100,46,34,'out.pressure|param.setpoint',10,'bar')
b+=path('M100 80 V90',stroke=LINE,sw=4)
b+=rect(76,140,48,90,'#d9e7f5',10,LINE,1,opacity='.95')+rect(82,186,36,36,'#9fc6ea',6,'none',0)
b+=rect(90,230,20,22,'#9aa3ad',3)
b+=rect(54,254,92,22,'#101317',3,'none',0,fill_opacity='.85')+dtext(100,270,'out.pressure|param.setpoint:d1:bar','— bar',11,'#e8eaed')
svg('service-unit',200,280,b,DEFS,' data-terms="none"')

# ------------------------------------------------ clorador (200 x 300)
b=band(56,8,88,44)+term(80,30,'A1',lab='none',r=7.5)+lbl(80,48,'A1',7.5)+term(120,30,'A2',lab='none',r=7.5)+lbl(120,48,'A2',7.5)
b+=rect(40,56,120,60,'#c9302c',6)+rect(56,68,60,24,'#f4f6f8',3)+lbl(86,84,'DOSIS',9,TXT,800)
b+=g(circ(138,80,6,LEDON,'none',0)+circ(138,80,11,LEDON,'none',0,opacity='.3'),data_show='out.dosificando')
b+=g(rect(48,98,104,14,AMBER,2,'none',0)+lbl(100,109,'SIN CAUDAL',8.5,'#2b1a00',800),data_show='out.sinCaudal')
b+=g(rect(120,58,36,18,'#f4f6f8',3)+lbl(138,71,'falla',8,RED,800),data_action='falla',data_kind='toggle',style='cursor:pointer')
b+=rect(50,120,100,150,'#eef1f4',8,LINE)
b+=f'<clipPath id="jwp-clo"><rect x="51" y="121" width="98" height="148" rx="7"/></clipPath>'
b+=g(g(rect(51,268,98,140,'#e8e48a',0,'none',0,opacity='.9'),data_translate='out.tanque|param.tanque:0:100:y:-128'),clip_path='url(#jwp-clo)')
b+=lbl(100,200,'NaClO',11,TXT,800)+dtext(100,220,'out.tanque|param.tanque:d0:%','80 %',11,TXT)
b+=lbl(100,290,'hipoclorito',9,MUTED,700)
svg('chlorinator',200,300,b,DEFS)
print('proceso ok')
