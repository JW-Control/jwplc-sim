// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tipos de direcciones de lwIP (lwip/ip_addr.h) usados por IPAddress. El
// simulador no incluye la pila lwIP: la red del JWPLC Basic es el W5500, que
// se modela a nivel de registros (G4).
#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct ip4_addr { uint32_t addr; } ip4_addr_t;
typedef struct ip6_addr { uint32_t addr[4]; uint8_t zone; } ip6_addr_t;
enum lwip_ip_addr_type { IPADDR_TYPE_V4 = 0U, IPADDR_TYPE_V6 = 6U, IPADDR_TYPE_ANY = 46U };
typedef struct ip_addr {
  union { ip6_addr_t ip6; ip4_addr_t ip4; } u_addr;
  uint8_t type;
} ip_addr_t;
#define IP6_NO_ZONE 0
#ifdef __cplusplus
}
#endif
