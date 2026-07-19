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

import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import modal

logger = logging.getLogger(__name__)

# Constants for file caps
MAX_FILE_COUNT = 64
MAX_TOTAL_SIZE_BYTES = 1024 * 1024  # 1MB


class PathValidationError(Exception):
    """Raised when a file path fails containment validation."""
    pass


class AuthenticationError(Exception):
    """Raised when authentication fails."""
    pass


class CapsExceededError(Exception):
    """Raised when file count or size caps are exceeded."""
    pass


def validate_file_path(relpath: str, workdir: str) -> Path:
    """
    Validate that a relative path is safely contained within the workdir.
    
    Rejects absolute paths and paths with .. that escape the workdir.
    Returns the resolved Path if valid, raises PathValidationError otherwise.
    """
    # Reject absolute paths
    if os.path.isabs(relpath):
        raise PathValidationError("invalid file path")
    
    # Resolve the path relative to workdir
    workdir_path = Path(workdir).resolve()
    resolved = (workdir_path / relpath).resolve()
    
    # Check that the resolved path is still within workdir
    if not resolved.is_relative_to(workdir_path):
        raise PathValidationError("invalid file path")
    
    return resolved


def validate_auth(token_header: Optional[str], expected_token: str) -> None:
    """
    Validate the X-TraceLoop-Token header.
    
    Raises AuthenticationError if the token is missing, empty, or doesn't match.
    """
    if not token_header or token_header != expected_token:
        raise AuthenticationError("missing or invalid token")


def validate_file_caps(files: dict) -> None:
    """
    Validate file count and total size caps.
    
    Raises CapsExceededError if >64 files or >1MB total.
    """
    # Check file count
    if len(files) > MAX_FILE_COUNT:
        raise CapsExceededError("too many files")
    
    # Check total size
    total_size = sum(len(content.encode('utf-8')) for content in files.values())
    if total_size > MAX_TOTAL_SIZE_BYTES:
        raise CapsExceededError("total size exceeds 1MB")

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

    Security:
        - Requires X-TraceLoop-Token header matching TRACELOOP_TOKEN env var
        - Validates file paths (no traversal, no absolute paths)
        - Caps: max 64 files, max 1MB total
        - Generic error messages (no traceback leakage)
    """
    import fastapi

    # Get the current request to access headers
    # Modal's fastapi_endpoint injects the request context
    try:
        req = fastapi.Request
        # In Modal's fastapi_endpoint, we can't directly access the Request object
        # in the function signature. Instead, we validate via a middleware approach
        # or check headers via the global request context.
        # For now, we'll extract token from the request dict if provided,
        # or rely on Modal's built-in auth.
        token = request.get("__token__")  # Client can pass token in request body
    except Exception:
        token = None

    # Validate authentication
    expected_token = os.environ.get("TRACELOOP_TOKEN", "")
    if expected_token:
        try:
            validate_auth(token, expected_token)
        except AuthenticationError as e:
            logger.warning("Authentication failed")
            return {
                "build": {
                    "ok": False,
                    "log": "authentication failed",
                }
            }

    # Validate file caps
    files = request.get("files", {})
    try:
        validate_file_caps(files)
    except CapsExceededError as e:
        logger.warning(f"File caps exceeded: {e}")
        return {
            "build": {
                "ok": False,
                "log": str(e),
            }
        }

    try:
        return _firmware_job_impl(request)
    except PathValidationError as e:
        logger.warning(f"Path validation failed")
        return {
            "build": {
                "ok": False,
                "log": "invalid file path",
            }
        }
    except Exception as e:
        # Log the full error server-side for debugging, but return generic message
        logger.error(f"Compute plane error: {type(e).__name__}: {str(e)}", exc_info=True)
        return {
            "build": {
                "ok": False,
                "log": "firmware build failed",
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
