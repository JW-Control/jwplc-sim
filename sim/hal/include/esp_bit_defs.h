#pragma once
#define BIT64(nr) (1ULL << (nr))
#define BIT31 0x80000000
#define BIT0 0x00000001
#ifndef BIT
#define BIT(nr) (1UL << (nr))
#endif
