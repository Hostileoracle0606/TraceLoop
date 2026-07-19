import firmwareSource from '../../../../firmware-zephyr/timer2-wrong-pin/src/main.c?raw';
import { runData } from '../../run';
import type {
  BoardSummary,
  ConversationSummary,
  ProjectSummary,
  SchematicSummary,
  WorkspaceSession,
} from './types';

// Simulation profiles are an implementation detail. They help the runtime choose
// compatible emulation models, but users work from uploaded schematics instead.
const SIMULATION_PROFILES: BoardSummary[] = [
  { id: 'demo-stm32f4', name: 'STM32F4 Discovery', mcu: 'STM32F407VG', architecture: 'ARM Cortex-M4', peripherals: ['GPIO', 'TIM2', 'NVIC', 'UART'], status: 'available' },
  { id: 'demo-nrf52840', name: 'nRF52840 DK', mcu: 'nRF52840', architecture: 'ARM Cortex-M4F', peripherals: ['BLE', '802.15.4', 'USB', 'SPI'], status: 'available' },
  { id: 'demo-esp32c3', name: 'ESP32-C3 DevKitM', mcu: 'ESP32-C3', architecture: '32-bit RISC-V', peripherals: ['Wi-Fi', 'BLE', 'GPIO', 'SPI'], status: 'available' },
];

const VEHICLE_SCHEMATIC: SchematicSummary = {
  id: 'vehicle-system',
  fileName: 'vehicle_system.kicad_sch',
  displayName: 'Vehicle control system',
  format: 'KiCad schematic',
  fileSize: '284 KB',
  componentCount: 47,
  controllerCount: 3,
  buses: ['CAN 2.0B', 'I²C', 'SPI / HCI', 'Ethernet'],
  nodes: [
    { id: 'tmp117', reference: 'U4', name: 'TMP117', detail: 'I²C · temperature', kind: 'sensor' },
    { id: 'lsm6dso', reference: 'U5', name: 'LSM6DSO', detail: 'SPI · 6-axis IMU', kind: 'sensor' },
    { id: 'mpx5700', reference: 'U6', name: 'MPX5700', detail: 'ADC · pressure', kind: 'sensor' },
    { id: 'ina226', reference: 'U7', name: 'INA226', detail: 'I²C · current', kind: 'sensor' },
    { id: 'ecu-a', reference: 'U1', name: 'STM32F407', detail: 'ECU-A · sensor controller', kind: 'controller', firmware: 'ecu_a.elf' },
    { id: 'ecu-b', reference: 'U2', name: 'STM32F407', detail: 'ECU-B · vehicle gateway', kind: 'controller', firmware: 'ecu_b.elf' },
    { id: 'radio', reference: 'U3', name: 'nRF52840', detail: 'BLE digital key', kind: 'radio', firmware: 'ble.hex' },
    { id: 'telematics', reference: 'ETH0', name: 'Telematics', detail: 'TLS 1.3 uplink', kind: 'service' },
  ],
  links: [
    { id: 'temp-a', source: 'tmp117', target: 'ecu-a', protocol: 'I²C' },
    { id: 'imu-a', source: 'lsm6dso', target: 'ecu-a', protocol: 'SPI' },
    { id: 'pressure-b', source: 'mpx5700', target: 'ecu-b', protocol: 'ADC' },
    { id: 'current-b', source: 'ina226', target: 'ecu-b', protocol: 'I²C' },
    { id: 'vehicle-can', source: 'ecu-a', target: 'ecu-b', protocol: 'CAN 2.0B' },
    { id: 'radio-hci', source: 'ecu-b', target: 'radio', protocol: 'SPI / HCI' },
    { id: 'cloud-uplink', source: 'ecu-b', target: 'telematics', protocol: 'Ethernet' },
  ],
};

const TIMER_SCHEMATIC: SchematicSummary = {
  id: 'timer-led',
  fileName: 'timer_led_controller.kicad_sch',
  displayName: 'Timer LED controller',
  format: 'KiCad schematic',
  fileSize: '92 KB',
  componentCount: 12,
  controllerCount: 1,
  buses: ['GPIO', 'SWD'],
  nodes: [
    { id: 'timer', reference: 'TIM2', name: 'Timer 2', detail: '32-bit peripheral', kind: 'peripheral' },
    { id: 'mcu', reference: 'U1', name: 'STM32F407VG', detail: 'Cortex-M4 controller', kind: 'controller', firmware: 'firmware.elf' },
    { id: 'green-led', reference: 'LD4', name: 'Green LED', detail: 'GPIOG · PG12', kind: 'peripheral' },
    { id: 'orange-led', reference: 'LD3', name: 'Orange LED', detail: 'GPIOG · PG13', kind: 'peripheral' },
  ],
  links: [
    { id: 'timer-mcu', source: 'timer', target: 'mcu', protocol: 'IRQ 28' },
    { id: 'mcu-green', source: 'mcu', target: 'green-led', protocol: 'GPIO' },
    { id: 'mcu-orange', source: 'mcu', target: 'orange-led', protocol: 'GPIO' },
  ],
};

const DEMO_PROJECTS: ProjectSummary[] = [
  { id: 'demo-vehicle-project', name: 'Vehicle gateway network', source: VEHICLE_SCHEMATIC.fileName, controllers: 3, updatedLabel: 'Now' },
  { id: 'demo-timer', name: 'Timer LED controller', source: TIMER_SCHEMATIC.fileName, controllers: 1, updatedLabel: 'Yesterday' },
];

const DEMO_CONVERSATIONS: ConversationSummary[] = [
  { id: 'demo-vehicle', projectId: 'demo-vehicle-project', title: 'Route thermal alerts across the vehicle network', preview: 'System verified across 3 controllers', status: 'passed', updatedLabel: 'Now' },
  { id: 'demo-run-1042', projectId: 'demo-timer', title: 'Turn on green LED with Timer 2', preview: 'Cause found · fix ready', status: 'failed', updatedLabel: '1d' },
  { id: 'demo-setup', projectId: 'demo-timer', title: 'Bring up the timer controller', preview: 'Virtual system ready and firmware scaffolded', status: 'passed', updatedLabel: '2d' },
];

const vehicleFiles = {
  'ecu-a/src/main.c': `#include <zephyr/kernel.h>\n#include <zephyr/drivers/sensor.h>\n#include <zephyr/drivers/can.h>\n\nstatic void publish_sensor_frame(void)\n{\n    struct can_frame frame = { .id = 0x241, .dlc = 8 };\n\n    /* Sample TMP117 and LSM6DSO, then publish on the vehicle bus. */\n    can_send(can_dev, &frame, K_MSEC(10), NULL, NULL);\n}\n\nint main(void)\n{\n    while (true) {\n        publish_sensor_frame();\n        k_sleep(K_MSEC(100));\n    }\n}\n`,
  'ecu-b/src/gateway.c': `#include <zephyr/kernel.h>\n#include <zephyr/drivers/can.h>\n#include <zephyr/net/socket.h>\n\nstatic void route_vehicle_state(const struct can_frame *frame)\n{\n    if (frame->id == 0x241) {\n        telemetry_publish(frame->data, frame->dlc);\n        radio_hci_notify(frame->data, frame->dlc);\n    }\n}\n\nint main(void)\n{\n    gateway_can_start(route_vehicle_state);\n    return 0;\n}\n`,
  'radio/src/main.c': `#include <zephyr/kernel.h>\n#include <zephyr/bluetooth/bluetooth.h>\n\nint main(void)\n{\n    bt_enable(NULL);\n    digital_key_service_init();\n\n    while (true) {\n        gateway_hci_process();\n        k_sleep(K_MSEC(20));\n    }\n}\n`,
};

const timerFiles = {
  'src/main.c': firmwareSource,
  'prj.conf': 'CONFIG_GPIO=y\nCONFIG_COUNTER=y\nCONFIG_LOG=y\n',
  'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.20.0)\nfind_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})\nproject(timer_led)\ntarget_sources(app PRIVATE src/main.c)\n',
};

const TIMER_SESSION: WorkspaceSession = {
  id: 'demo-run-1042',
  title: 'Turn on green LED with Timer 2',
  objective: 'Use Timer 2 to turn on the green LED within 2 milliseconds.',
  projectName: 'Timer LED controller',
  boardName: runData.run.board,
  origin: 'example',
  schematic: TIMER_SCHEMATIC,
  branch: runData.run.branch,
  status: 'failed',
  iteration: 1,
  permission: 'Review patches',
  files: timerFiles,
  activeFile: 'src/main.c',
  steps: [
    { id: 'map', label: 'Loaded the hardware design', detail: 'Found STM32F407VG, TIM2, and two GPIO outputs', state: 'complete', duration: '1.8s' },
    { id: 'build', label: 'Built the firmware', detail: 'stm32f4_disco · firmware.elf', state: 'complete', duration: '12.4s' },
    { id: 'simulate', label: 'Ran the system model', detail: '2.000 ms · 1,284 runtime events', state: 'complete', duration: '23.1s' },
    { id: 'test', label: 'Checked the requested behavior', detail: '3 of 4 checks passed', state: 'failed', duration: '1.1s' },
    { id: 'analyze', label: 'Found the cause', detail: 'Wrong GPIO write at 1004 µs', state: 'complete', duration: '2.0s' },
  ],
  evidence: [
    { id: 'e1', time: 1000, label: 'Timer 2 expired', detail: 'TIM2 update flag observed', register: 'TIM2_SR.UIF', value: '0 → 1', tone: 'neutral' },
    { id: 'e2', time: 1001, label: 'IRQ 28 pending', detail: 'NVIC accepted the timer interrupt', register: 'NVIC_ISPR0[28]', value: '0 → 1', tone: 'violet' },
    { id: 'e3', time: 1002, label: 'Entered timer_isr', detail: 'Program counter resolved to the handler', register: 'PC', value: '0x8000440', tone: 'violet' },
    { id: 'e4', time: 1004, label: 'Wrote the wrong GPIO pin', detail: 'The handler selected the orange LED on PG13', register: 'GPIOG_ODR[13]', value: '0 → 1', tone: 'amber' },
    { id: 'e5', time: 2000, label: 'Assertion failed', detail: 'The green LED on PG12 remained off', register: 'GPIOG_ODR[12]', value: 'expected 1 · observed 0', tone: 'red' },
  ],
  testSummary: { passed: 3, total: 4, assertion: 'green_led_should_turn_on', expected: 'GPIOG pin 12 = 1 by 2000 µs', observed: 'GPIOG pin 13 changed; pin 12 remained 0' },
};

const VEHICLE_SESSION: WorkspaceSession = {
  id: 'demo-vehicle',
  title: 'Route thermal alerts across the vehicle network',
  objective: 'Route a high-temperature sensor event from ECU-A to telematics and the BLE digital key.',
  projectName: 'Vehicle gateway network',
  boardName: 'Vehicle control system',
  origin: 'example',
  schematic: VEHICLE_SCHEMATIC,
  branch: 'agent/thermal-alert-routing',
  status: 'passed',
  iteration: 2,
  permission: 'Review patches',
  files: vehicleFiles,
  activeFile: 'ecu-a/src/main.c',
  steps: [
    { id: 'map', label: 'Loaded the hardware design', detail: '47 parts · 3 controllers · 4 shared interfaces', state: 'complete', duration: '2.4s' },
    { id: 'plan', label: 'Planned across controllers', detail: 'Defined CAN payload, gateway route, and BLE notification', state: 'complete', duration: '3.1s' },
    { id: 'author', label: 'Built three firmware images', detail: 'ECU-A, ECU-B, and radio compiled successfully', state: 'complete', duration: '18.7s' },
    { id: 'simulate', label: 'Verified the complete system', detail: 'Thermal alert reached telematics and BLE in 1.38 ms', state: 'complete', duration: '24.9s' },
  ],
  evidence: [],
  testSummary: { passed: 6, total: 6, assertion: 'thermal_alert_reaches_outputs', expected: 'Alert delivered to both routes', observed: 'Telematics and BLE acknowledged' },
};

const clone = <T,>(value: T): T => structuredClone(value);

export function getDemoProjects(): ProjectSummary[] { return clone(DEMO_PROJECTS); }
export function getDemoConversations(): ConversationSummary[] { return clone(DEMO_CONVERSATIONS); }
export function getSimulationProfiles(): BoardSummary[] { return clone(SIMULATION_PROFILES); }

export function getDemoSession(id = 'demo-vehicle'): WorkspaceSession {
  if (id === 'demo-setup') {
    const setup = clone(TIMER_SESSION);
    setup.id = 'demo-setup';
    setup.title = 'Bring up the timer controller';
    setup.objective = 'Use the uploaded timer schematic, scaffold the Zephyr project, and verify UART output.';
    setup.status = 'passed';
    setup.branch = 'agent/timer-controller-bringup';
    setup.steps = setup.steps.slice(0, 3).map((step) => ({ ...step, state: 'complete' }));
    setup.evidence = [];
    setup.testSummary = { passed: 4, total: 4, assertion: 'firmware_boots_and_reports_ready', expected: 'UART ready message', observed: 'UART ready message at 18.4 ms' };
    return setup;
  }
  return clone(id === 'demo-run-1042' ? TIMER_SESSION : VEHICLE_SESSION);
}

const humanFileSize = (bytes: number) => {
  if (!bytes) return 'Local file';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const schematicFormat = (name: string, mimeType: string) => {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'kicad_sch') return 'KiCad schematic';
  if (extension === 'sch') return 'EDA schematic';
  if (extension === 'pdf' || mimeType.includes('pdf')) return 'PDF schematic';
  if (extension === 'svg') return 'SVG schematic';
  if (['png', 'jpg', 'jpeg'].includes(extension ?? '')) return 'Schematic image';
  return 'Schematic source';
};

export function createSchematicFromUpload(file: { name: string; size: number; type: string; text?: string }): SchematicSummary {
  const source = `${file.name} ${file.text ?? ''}`.toLowerCase();
  const looksLikeSingleController = /(timer|led.controller|stm32f4_disco)/.test(source) && !/(nrf52840|can 2\.0|telematics|ecu-b)/.test(source);
  const schematic = clone(looksLikeSingleController ? TIMER_SCHEMATIC : VEHICLE_SCHEMATIC);
  const baseName = file.name.replace(/\.(kicad_sch|sch|pdf|svg|png|jpe?g|json|net)$/i, '').replace(/[_-]+/g, ' ').trim();
  schematic.id = `upload-${Date.now()}`;
  schematic.fileName = file.name;
  schematic.displayName = baseName ? baseName.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Imported hardware system';
  schematic.format = schematicFormat(file.name, file.type);
  schematic.fileSize = humanFileSize(file.size);
  return schematic;
}

export function createImportedSession(schematic: SchematicSummary): WorkspaceSession {
  const base = schematic.controllerCount > 1 ? getDemoSession('demo-vehicle') : getDemoSession('demo-run-1042');
  base.id = `import-${Date.now()}`;
  base.title = schematic.displayName;
  base.objective = '';
  base.projectName = schematic.displayName;
  base.boardName = `${schematic.controllerCount} controller schematic`;
  base.origin = 'upload';
  base.schematic = schematic;
  base.branch = 'agent/awaiting-goal';
  base.status = 'active';
  base.iteration = 0;
  base.steps = [
    { id: 'parse', label: 'Loaded the schematic', detail: `${schematic.componentCount} components and ${schematic.controllerCount} programmable controllers`, state: 'complete', duration: '1.2s' },
    { id: 'model', label: 'Built the system model', detail: `${schematic.buses.join(', ')} connected in the simulator`, state: 'complete', duration: '2.8s' },
    { id: 'goal', label: 'Waiting for your goal', detail: 'Describe what the hardware should do in chat', state: 'active' },
  ];
  base.evidence = [];
  base.testSummary = { passed: 0, total: 0, assertion: 'Waiting for a behavior', expected: 'A goal described in chat', observed: 'Schematic is ready' };
  return base;
}

export function createSchematicTaskSession(objective: string, current: WorkspaceSession): WorkspaceSession {
  const session = clone(current);
  session.id = current.id.startsWith('import-') ? current.id : `draft-${Date.now()}`;
  session.title = objective.length > 52 ? `${objective.slice(0, 52)}…` : objective;
  session.objective = objective;
  session.branch = `agent/${objective.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'firmware-task'}`;
  session.status = 'active';
  session.steps = [
    { id: 'scope', label: 'Understanding the behavior', detail: `Checking the request against ${session.schematic.controllerCount} firmware targets`, state: 'active' },
    { id: 'plan', label: 'Planning the firmware changes', detail: 'Interfaces and acceptance checks come next', state: 'waiting' },
    { id: 'author', label: 'Writing and testing firmware', detail: 'Each image will boot in the complete system model', state: 'waiting' },
  ];
  return session;
}
