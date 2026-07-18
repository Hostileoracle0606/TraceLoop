/*
 * TraceLoop demo firmware — Zephyr port (see docs/adr/0002).
 *
 * TIM2 fires a periodic update interrupt (IRQ 28). The handler is SUPPOSED to
 * light the green LED (GPIOG pin 12) but contains the planted bug: it writes
 * the orange LED (GPIOG pin 13) instead, via Zephyr's gpio_pin_set_dt() — the
 * same API the reused dashboard's PatchReview shows. The fix swaps the ISR's
 * write from the orange LED spec to the green LED spec (see proposePatch).
 *
 * TIM2 itself is configured with direct register access (Zephyr does not ship
 * a STM32 timer abstraction that preserves the exact IRQ28/timer_isr causal
 * shape the engine's fixture and tests already assert on); GPIO output goes
 * through Zephyr's GPIO driver + devicetree, matching ADR-0002.
 */
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/irq.h>

#define REG(addr) (*(volatile uint32_t *)(addr))

#define RCC_APB1ENR REG(0x40023840) /* TIM2 clock enable */
#define TIM2_CR1    REG(0x40000000)
#define TIM2_DIER   REG(0x4000000C)
#define TIM2_SR     REG(0x40000010)
#define TIM2_EGR    REG(0x40000014)
#define TIM2_PSC    REG(0x40000028)
#define TIM2_ARR    REG(0x4000002C)

#define TIM2_IRQ 28

static const struct gpio_dt_spec green_led =
    GPIO_DT_SPEC_GET(DT_NODELABEL(green_led), gpios);
static const struct gpio_dt_spec orange_led =
    GPIO_DT_SPEC_GET(DT_NODELABEL(orange_led), gpios);

static void timer_isr(const void *arg)
{
	ARG_UNUSED(arg);
	TIM2_SR &= ~(1u << 0); /* clear UIF */

	/* BUG: pin 13 (orange). Should be pin 12 (green) — see docstring above. */
	gpio_pin_set_dt(&orange_led, 1);
}

int main(void)
{
	gpio_pin_configure_dt(&green_led, GPIO_OUTPUT_INACTIVE);
	gpio_pin_configure_dt(&orange_led, GPIO_OUTPUT_INACTIVE);

	RCC_APB1ENR |= (1u << 0); /* TIM2 clock */

	TIM2_PSC = 0u;
	TIM2_ARR = 1000u;
	TIM2_EGR = 1u; /* force update to load PSC/ARR */
	TIM2_SR = 0u;  /* clear the update flag it just set */
	TIM2_DIER |= (1u << 0); /* update interrupt enable (UIE) */

	IRQ_CONNECT(TIM2_IRQ, 1, timer_isr, NULL, 0);
	irq_enable(TIM2_IRQ);

	TIM2_CR1 |= (1u << 0); /* enable counter (CEN) */

	while (1) {
		k_sleep(K_MSEC(100));
	}
	return 0;
}
