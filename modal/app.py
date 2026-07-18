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

import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import modal

# The Modal image: Zephyr SDK + Renode + build tools.
# This is a heavy image — first build takes several minutes.
image = (
    # Python 3.12+ is required: west's build.py calls pathlib
    # relative_to(..., walk_up=True), which only exists in 3.12+.
    modal.Image.debian_slim(python_version="3.12")
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
        # Zephyr SDK host tool dependencies
        "bzip2",
        "dfu-util",
        "libusb-1.0-0",
    )
    # Install west (Zephyr's meta-tool), jsonschema (required by west), and fastapi (required by @modal.fastapi_endpoint)
    .run_commands("pip install west jsonschema fastapi")
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
    # Install the Zephyr SDK that MATCHES the cloned Zephyr, via `west sdk install`.
    # A hardcoded SDK version drifts out of sync with Zephyr main: the cloned tree
    # required SDK >= 1.0 while a pinned 0.17.0 was rejected by CMake. west sdk
    # install fetches the exact SDK the tree wants and registers it in the CMake
    # package registry, so Zephyr discovers it automatically (no env var needed).
    # --no-hosttools: the SDK's host-tools installer (qemu/openocd/etc.) fails in
    # the minimal container, and the build doesn't need them — the image already
    # apt-installs cmake/ninja/dtc. The GNU toolchain + CMake registration still happen.
    .run_commands(
        "cd /opt/zephyrproject && west sdk install --toolchains arm-zephyr-eabi --no-hosttools"
    )
    # Install Renode (portable Linux binary)
    # Extract into a FIXED /opt/renode with --strip-components=1: the tarball's
    # top-level dir is named 'renode_1.16.1_portable' (not 'renode-1.16.1'), so a
    # hardcoded path was wrong. Flattening makes the path predictable.
    .run_commands(
        "mkdir -p /opt/renode && cd /tmp && "
        "wget https://github.com/renode/renode/releases/download/v1.16.1/renode-1.16.1.linux-portable.tar.gz && "
        "tar xf renode-1.16.1.linux-portable.tar.gz -C /opt/renode --strip-components=1 && "
        "ln -s /opt/renode/renode /usr/local/bin/renode"
    )
    .env(
        {
            "ZEPHYR_BASE": "/opt/zephyrproject/zephyr",
            # The SDK is found via the CMake package registry that `west sdk
            # install` writes, so ZEPHYR_SDK_INSTALL_DIR is intentionally unset.
            "PATH": "/opt/renode:${PATH}",
        }
    )
)

app = modal.App("traceloop-firmware-job", image=image)


def _run_command(
    cmd: list[str],
    timeout: int,
    cwd: Optional[str] = None,
) -> tuple[Optional[subprocess.CompletedProcess], bool]:
    """
    Run a subprocess with common parameters. Returns (result, timed_out).
    If timed_out is True, result is None and the caller should handle the timeout.
    """
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=cwd,
        )
        return result, False
    except subprocess.TimeoutExpired:
        return None, True


# Board configurations for Renode simulation.
# Each entry maps a Zephyr board target to the Renode platform file,
# machine name, and peripherals to log for trace analysis.
BOARD_CONFIGS: dict[str, dict] = {
    "stm32f4_disco": {
        "platform_file": "platforms/cpus/stm32f4.repl",
        "machine_name": "stm32f4",
        "peripherals_to_log": ["timer2", "nvic", "gpioPortG"],
    },
    "nrf52840dk_nrf52840": {
        "platform_file": "platforms/cpus/nrf52840.repl",
        "machine_name": "nrf52840",
        "peripherals_to_log": ["TIMER1", "gpio", "nvic"],
    },
    "esp32c3": {
        "platform_file": "platforms/cpus/esp32c3.repl",
        "machine_name": "esp32c3",
        "peripherals_to_log": ["timer_group0", "gpio", "uart0"],
    },
}


def _generate_resc_script(elf_path: Path, board_config: dict) -> str:
    """
    Generate a Renode .resc script for the given board configuration.

    board_config keys:
        platform_file: path to the Renode .repl platform description
        machine_name: name for the Renode machine
        peripherals_to_log: list of peripheral names for LogPeripheralAccess
    """
    peripheral_lines = "\n".join(
        f"sysbus LogPeripheralAccess {p} true"
        for p in board_config["peripherals_to_log"]
    )
    return f"""mach create "{board_config['machine_name']}"
machine LoadPlatformDescription @{board_config['platform_file']}
sysbus LoadELF @{elf_path}
cpu LogFunctionNames true
{peripheral_lines}
emulation RunFor "0.05"
quit
"""


@app.function()
@modal.fastapi_endpoint(method="POST")
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
    import traceback

    try:
        return _firmware_job_impl(request)
    except Exception:
        # Surface the traceback as a build-failed result instead of a 500, so the
        # control plane (and debugging) sees what actually broke in the container.
        return {
            "build": {
                "ok": False,
                "log": "compute-plane exception:\n" + traceback.format_exc(),
            }
        }


def _firmware_job_impl(request: dict) -> dict:
    files = request["files"]
    board = request["board"]

    # Resolve board config: explicit override in request, or look up from BOARD_CONFIGS
    board_config = request.get("board_config")
    if board_config is None:
        board_config = BOARD_CONFIGS.get(board)
    if board_config is None:
        return {
            "build": {
                "ok": False,
                "log": f"Unknown board '{board}'. Known boards: {list(BOARD_CONFIGS.keys())}",
            }
        }

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

        build_result, build_timed_out = _run_command(
            build_cmd,
            timeout=300,  # 5-minute build timeout
        )

        if build_timed_out:
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
        resc_content = _generate_resc_script(elf_path, board_config)
        resc_path = workdir_path / "trace.resc"
        resc_path.write_text(resc_content)

        # Run Renode with the trace script. --console runs the monitor headless
        # (the .resc ends in `quit`); str() because subprocess wants strings.
        renode_cmd = ["renode", "--console", "--disable-xwt", str(resc_path)]

        renode_result, renode_timed_out = _run_command(
            renode_cmd,
            timeout=60,  # 1-minute sim timeout
            cwd="/opt/renode",
        )

        if renode_timed_out:
            return {
                "build": {"ok": True, "log": build_log},
                "trace": {"log": "Renode simulation timed out after 60 seconds"},
            }

        trace_log = renode_result.stdout + "\n" + renode_result.stderr

        return {
            "build": {"ok": True, "log": build_log},
            "trace": {"log": trace_log},
        }
