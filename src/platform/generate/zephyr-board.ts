import type { PlatformModel } from '../types';

export function toZephyrBoardFiles(model: PlatformModel): Record<string, string> {
  const ledNodes = model.ledMappings.map((led, i) => {
    const label = led.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    return `    ${label}: led_${i} {\n      gpios = <&${led.gpioPort.toLowerCase()} ${led.pin} GPIO_ACTIVE_HIGH>;\n      label = "${led.name}";\n    };`;
  }).join('\n');

  const overlay = `/ {\n  leds {\n    compatible = "gpio-leds";\n${ledNodes}\n  };\n};\n`;
  const prjConf = `CONFIG_GPIO=y\n`;
  return { 'app.overlay': overlay, 'prj.conf': prjConf };
}

export function validateOverlaySyntax(overlay: string): { valid: boolean; reason?: string } {
  let depth = 0;
  for (const ch of overlay) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth < 0) return { valid: false, reason: 'unbalanced closing brace' };
  }
  return depth === 0 ? { valid: true } : { valid: false, reason: 'unbalanced opening brace' };
}
