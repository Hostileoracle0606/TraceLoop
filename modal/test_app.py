"""
Tests for modal/app.py boundary hardening (issue 10).

Tests path containment, auth, file caps, and error handling.
"""

import os
import tempfile
from pathlib import Path

import pytest

# Import the validation functions we're about to add
from app import (
    validate_file_path,
    validate_auth,
    validate_file_caps,
    AuthenticationError,
    CapsExceededError,
    PathValidationError,
)


class TestPathContainment:
    """Path traversal and absolute path rejection."""

    def test_rejects_absolute_path(self):
        """Absolute paths must be rejected."""
        with tempfile.TemporaryDirectory() as workdir:
            with pytest.raises(PathValidationError, match="invalid file path"):
                validate_file_path("/etc/passwd", workdir)

    def test_rejects_parent_traversal(self):
        """Paths with .. that escape workdir must be rejected."""
        with tempfile.TemporaryDirectory() as workdir:
            with pytest.raises(PathValidationError, match="invalid file path"):
                validate_file_path("../../etc/passwd", workdir)

    def test_rejects_hidden_traversal(self):
        """Paths like 'src/../../etc/passwd' must be rejected."""
        with tempfile.TemporaryDirectory() as workdir:
            with pytest.raises(PathValidationError, match="invalid file path"):
                validate_file_path("src/../../etc/passwd", workdir)

    def test_accepts_valid_relative_path(self):
        """Normal relative paths within workdir must be accepted."""
        with tempfile.TemporaryDirectory() as workdir:
            # Should not raise
            result = validate_file_path("src/main.c", workdir)
            assert result is not None
            assert isinstance(result, Path)

    def test_accepts_nested_relative_path(self):
        """Nested relative paths within workdir must be accepted."""
        with tempfile.TemporaryDirectory() as workdir:
            result = validate_file_path("src/drivers/uart.c", workdir)
            assert result is not None
            assert isinstance(result, Path)

    def test_resolved_path_must_be_relative_to_workdir(self):
        """The resolved path must actually be under workdir."""
        with tempfile.TemporaryDirectory() as workdir:
            result = validate_file_path("src/main.c", workdir)
            resolved = result.resolve()
            workdir_resolved = Path(workdir).resolve()
            assert resolved.is_relative_to(workdir_resolved)


class TestAuthentication:
    """Token-based authentication."""

    def test_rejects_missing_token(self):
        """Missing X-TraceLoop-Token header must raise AuthenticationError."""
        with pytest.raises(AuthenticationError, match="missing or invalid token"):
            validate_auth(None, "expected-token")

    def test_rejects_empty_token(self):
        """Empty token must raise AuthenticationError."""
        with pytest.raises(AuthenticationError, match="missing or invalid token"):
            validate_auth("", "expected-token")

    def test_rejects_wrong_token(self):
        """Wrong token must raise AuthenticationError."""
        with pytest.raises(AuthenticationError, match="missing or invalid token"):
            validate_auth("wrong-token", "expected-token")

    def test_accepts_correct_token(self):
        """Correct token must not raise."""
        # Should not raise
        validate_auth("correct-token", "correct-token")


class TestFileCaps:
    """File count and size limits."""

    def test_rejects_too_many_files(self):
        """More than 64 files must raise CapsExceededError."""
        files = {f"file{i}.c": "content" for i in range(65)}
        with pytest.raises(CapsExceededError, match="too many files"):
            validate_file_caps(files)

    def test_accepts_64_files(self):
        """Exactly 64 files must be accepted."""
        files = {f"file{i}.c": "content" for i in range(64)}
        # Should not raise
        validate_file_caps(files)

    def test_rejects_oversized_total(self):
        """Total size > 1MB must raise CapsExceededError."""
        # Create files totaling > 1MB
        large_content = "x" * (1024 * 1024 + 1)  # 1MB + 1 byte
        files = {"large.c": large_content}
        with pytest.raises(CapsExceededError, match="total size"):
            validate_file_caps(files)

    def test_accepts_under_1mb(self):
        """Total size <= 1MB must be accepted."""
        # Create files totaling < 1MB
        content = "x" * (512 * 1024)  # 512KB
        files = {"file1.c": content, "file2.c": content}
        # Should not raise
        validate_file_caps(files)

    def test_accepts_empty_files(self):
        """Empty files dict must be accepted."""
        # Should not raise
        validate_file_caps({})


class TestErrorHandling:
    """Error responses must not leak tracebacks."""

    def test_path_validation_error_message_is_generic(self):
        """PathValidationError message must not contain path details."""
        with tempfile.TemporaryDirectory() as workdir:
            try:
                validate_file_path("../../etc/passwd", workdir)
                assert False, "Should have raised"
            except PathValidationError as e:
                # Message should be generic, not leak the attempted path
                assert "../../etc/passwd" not in str(e)
                assert "invalid file path" in str(e)

    def test_auth_error_message_is_generic(self):
        """AuthenticationError message must not leak token details."""
        try:
            validate_auth("wrong-token", "secret-token")
            assert False, "Should have raised"
        except AuthenticationError as e:
            # Message should not leak the expected or provided token
            assert "secret-token" not in str(e)
            assert "wrong-token" not in str(e)
