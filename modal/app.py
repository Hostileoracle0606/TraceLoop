"""
TraceLoop Modal compute plane — isolated firmware build + Renode simulation.

This is the compute-plane side of the control-plane/compute-plane seam (see
docs/adr/0004). It receives firmware source, builds it with Zephyr, simulates
it in Renode with trace logging, and returns the raw logs. All causal analysis
stays in the control plane.

Deploy:
    modal deploy modal/app.py

The endpoint URL is printed on deploy. Point ModalFirmwareJobRunner at it.
"""

import json
import os
import subprocess
import tempfile
from pathlib import Path

import modal

# The Modal image: Zephyr SDK + Renode + build tools.
# This is a heavy image — first build takes several minutes.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        # Build tools
        "cmake",
        "ninja-build",
        "git",
        "wget",
        "xz-utils",
        # Zephyr build dependencies
        "python3-pip",
        "python3-venv",
        "libssl-dev",
        "libffi-dev",
        "device-tree-compiler",
    )
    # Install west (Zephyr's meta-tool)
    .run_commands("pip install west")
    # Clone Zephyr and install the toolchain
    # This is the expensive part — ~5-10 minutes on first build
    .run_commands(
        "cd /opt && "
        "west init zephyrproject && "
        "cd zephyrproject && "
        "west update && "
        "west zephyr-export"
    )
    # Install Zephyr Python dependencies
    .run_commands(
        "pip install -r /opt/zephyrproject/zephyr/scripts/requirements.txt"
    )
    # Download and install Zephyr SDK (ARM toolchain for STM32F4)
    .run_commands(
        "cd /tmp && "
        "wget -q https://github.com/zephyrproject-rtos/sdk-ng/releases/download/v0.17.0/zephyr-sdk-0.17.0_linux-x86_64.tar.xz && "
        "tar xf zephyr-sdk-0.17.0_linux-x86_64.tar.xz -C /opt && "
        "cd /opt/zephyr-sdk-0.17.0 && "
        "./setup.sh -t arm-zephyr-eabi -h -c"
    )
    # Install Renode (portable Linux binary)
    .run_commands(
        "cd /tmp && "
        "wget -q https://github.com/renode/renode/releases/download/v1.15.3/renode-1.15.3.x86_64.tar.gz && "
        "tar xf renode-1.15.3.x86_64.tar.gz -C /opt && "
        "ln -s /opt/renode-1.15.3/renode /usr/local/bin/renode"
    )
    .env(
        {
            "ZEPHYR_BASE": "/opt/zephyrproject/zephyr",
            "ZEPHYR_SDK_INSTALL_DIR": "/opt/zephyr-sdk-0.17.0",
            "PATH": "/opt/zephyr-sdk-0.17.0/arm-zephyr-eabi/bin:/opt/renode-1.15.3:${PATH}",
        }
    )
)

app = modal.App("traceloop-firmware-job", image=image)


@app.function()
@modal.web_endpoint(method="POST")
def firmware_job(request: dict) -> dict:
    """
    The compute-plane seam. Receives a FirmwareJobRequest, returns a FirmwareJobResult.

    request shape (matches src/engine/firmware-job.ts FirmwareJobRequest):
        {
            "files": { "src/main.c": "...", "CMakeLists.txt": "...", ... },
            "board": "stm32f4_disco"
        }

    response shape (matches FirmwareJobResult):
        {
            "build": { "ok": bool, "log": str },
            "trace": { "log": str } | undefined  // only present if build.ok
        }
    """
    files = request["files"]
    board = request["board"]

    with tempfile.TemporaryDirectory() as workdir:
        workdir_path = Path(workdir)

        # Write the firmware source files into the workspace
        for relpath, content in files.items():
            filepath = workdir_path / relpath
            filepath.parent.mkdir(parents=True, exist_ok=True)
            filepath.write_text(content)

        # Build the firmware with west
        build_cmd = [
            "west",
            "build",
            "-b",
            board,
            "-d",
            str(workdir_path / "build"),
            str(workdir_path),
        ]

        try:
            build_result = subprocess.run(
                build_cmd,
                capture_output=True,
                text=True,
                timeout=300,  # 5-minute build timeout
                env={**os.environ, "ZEPHYR_BASE": os.environ["ZEPHYR_BASE"]},
            )
        except subprocess.TimeoutExpired:
            return {
                "build": {
                    "ok": False,
                    "log": "Build timed out after 5 minutes",
                }
            }

        build_log = build_result.stdout + "\n" + build_result.stderr

        if build_result.returncode != 0:
            # Build failed — return the compiler log, no trace
            return {"build": {"ok": False, "log": build_log}}

        # Build succeeded — locate the ELF
        elf_path = workdir_path / "build" / "zephyr" / "zephyr.elf"
        if not elf_path.exists():
            return {
                "build": {
                    "ok": False,
                    "log": build_log + "\n\nERROR: zephyr.elf not found after build",
                }
            }

        # Generate a Renode script (.resc) for this build
        # The script loads the ELF, enables trace logging, runs for a short
        # virtual time slice, then exits.
        resc_content = f"""mach create "stm32f4"
machine LoadPlatformDescription @platforms/cpus/stm32f4.repl
sysbus LoadELF @{elf_path}
cpu LogFunctionNames true
sysbus LogPeripheralAccess timer2 true
sysbus LogPeripheralAccess nvic true
sysbus LogPeripheralAccess gpioPortG true
emulation RunFor "0.05"
quit
"""
        resc_path = workdir_path / "trace.resc"
        resc_path.write_text(resc_content)

        # Run Renode with the trace script
        renode_cmd = ["renode", "--disable-xwt", resc_path]

        try:
            renode_result = subprocess.run(
                renode_cmd,
                capture_output=True,
                text=True,
                timeout=60,  # 1-minute sim timeout
                cwd="/opt/renode-1.15.3",
            )
        except subprocess.TimeoutExpired:
            return {
                "build": {"ok": True, "log": build_log},
                "trace": {"log": "Renode simulation timed out after 60 seconds"},
            }

        trace_log = renode_result.stdout + "\n" + renode_result.stderr

        return {
            "build": {"ok": True, "log": build_log},
            "trace": {"log": trace_log},
        }
