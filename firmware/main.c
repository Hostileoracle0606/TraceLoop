/*
 * TraceLoop demo firmware — STM32F407, bare metal.
 *
 * TIM2 fires a periodic update interrupt. The handler is SUPPOSED to light the
 * green LED (GPIOG pin 12) but contains the planted bug: it writes pin 13
 * (orange) instead. A test asserting "GPIOG_ODR[12] == 1" therefore fails, and
 * TraceLoop's causal engine must blame this write — not the (correct) timer/IRQ.
 */
#include <stdint.h>

#define REG(addr) (*(volatile uint32_t *)(addr))

#define RCC_AHB1ENR REG(0x40023830) /* GPIO clock enable */
#define RCC_APB1ENR REG(0x40023840) /* TIM2 clock enable  */

#define GPIOG_MODER REG(0x40021800)
#define GPIOG_ODR   REG(0x40021814)

#define TIM2_CR1    REG(0x40000000)
#define TIM2_DIER   REG(0x4000000C)
#define TIM2_SR     REG(0x40000010)
#define TIM2_EGR    REG(0x40000014)
#define TIM2_PSC    REG(0x40000028)
#define TIM2_ARR    REG(0x4000002C)

#define NVIC_ISER0  REG(0xE000E100)

extern uint32_t _estack;

void Reset_Handler(void);
void Default_Handler(void);
void timer_isr(void);
int main(void);

/* Cortex-M vector table: 16 system vectors + IRQs. TIM2 is IRQ 28 -> index 44. */
__attribute__((section(".isr_vector"), used))
void (*const vector_table[16 + 29])(void) = {
    (void (*)(void))(&_estack), /* 0  initial SP        */
    Reset_Handler,              /* 1  Reset             */
    Default_Handler,            /* 2  NMI               */
    Default_Handler,            /* 3  HardFault         */
    Default_Handler, Default_Handler, Default_Handler, /* 4-6 fault handlers */
    0, 0, 0, 0,                 /* 7-10 reserved        */
    Default_Handler,            /* 11 SVCall            */
    Default_Handler,            /* 12 Debug             */
    0,                          /* 13 reserved          */
    Default_Handler,            /* 14 PendSV            */
    Default_Handler,            /* 15 SysTick           */
    /* IRQ0..IRQ27 (indices 16..43) */
    Default_Handler, Default_Handler, Default_Handler, Default_Handler,
    Default_Handler, Default_Handler, Default_Handler, Default_Handler,
    Default_Handler, Default_Handler, Default_Handler, Default_Handler,
    Default_Handler, Default_Handler, Default_Handler, Default_Handler,
    Default_Handler, Default_Handler, Default_Handler, Default_Handler,
    Default_Handler, Default_Handler, Default_Handler, Default_Handler,
    Default_Handler, Default_Handler, Default_Handler, Default_Handler,
    timer_isr,                  /* IRQ28 = TIM2 (index 44) */
};

int main(void) {
    RCC_AHB1ENR |= (1u << 6); /* GPIOG clock */
    RCC_APB1ENR |= (1u << 0); /* TIM2 clock  */

    /* PG12 (green) and PG13 (orange) as push-pull outputs (MODER = 01) */
    GPIOG_MODER |= (1u << 24) | (1u << 26);

    /* TIM2: overflow after a short count, raise update interrupt */
    TIM2_PSC = 0u;
    TIM2_ARR = 1000u;
    TIM2_EGR = 1u;          /* force update to load PSC/ARR */
    TIM2_SR = 0u;           /* clear the update flag it just set */
    TIM2_DIER |= (1u << 0); /* update interrupt enable (UIE) */
    TIM2_CR1 |= (1u << 0);  /* enable counter (CEN) */

    NVIC_ISER0 = (1u << 28); /* enable TIM2 interrupt (IRQ 28) */

    for (;;) {
    }
}

void timer_isr(void) {
    TIM2_SR &= ~(1u << 0);   /* clear UIF */
    GPIOG_ODR |= (1u << 13); /* BUG: pin 13 (orange). Should be pin 12 (green). */
}

void Reset_Handler(void) {
    main();
    for (;;) {
    }
}

void Default_Handler(void) {
    for (;;) {
    }
}
