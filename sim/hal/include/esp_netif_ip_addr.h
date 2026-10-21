#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct esp_ip6_addr { uint32_t addr[4]; uint8_t zone; } esp_ip6_addr_t;
typedef struct esp_ip4_addr { uint32_t addr; } esp_ip4_addr_t;
typedef enum {
  ESP_IP6_ADDR_IS_UNKNOWN,
  ESP_IP6_ADDR_IS_GLOBAL,
  ESP_IP6_ADDR_IS_LINK_LOCAL,
  ESP_IP6_ADDR_IS_SITE_LOCAL,
  ESP_IP6_ADDR_IS_UNIQUE_LOCAL,
  ESP_IP6_ADDR_IS_IPV4_MAPPED_IPV6,
} esp_ip6_addr_type_t;
esp_ip6_addr_type_t esp_netif_ip6_get_addr_type(esp_ip6_addr_t *ip6_addr);
#ifdef __cplusplus
}
#endif
