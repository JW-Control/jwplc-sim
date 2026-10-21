// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <stdint.h>
#include "lwip/ip_addr.h"
#ifdef __cplusplus
extern "C" {
#endif
struct netif { struct netif *next; char name[2]; uint8_t num; };
extern struct netif *netif_list;
#define NETIF_NAMESIZE 6
#ifdef __cplusplus
}
#endif
