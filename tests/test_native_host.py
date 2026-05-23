import importlib.util
import pathlib
import sys
import tempfile
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[1]
HOST_PATH = ROOT / "native-host" / "save_file.py"

spec = importlib.util.spec_from_file_location("save_file", HOST_PATH)
save_file = importlib.util.module_from_spec(spec)
spec.loader.exec_module(save_file)


class NativeHostSaveTests(unittest.TestCase):
    def test_missing_save_directory_is_marked_as_directory_error(self):
        response = save_file.handle_save({
            "directory": "",
            "filename": "note.md",
            "content": "hello"
        })

        self.assertFalse(response["success"])
        self.assertEqual(response["errorCode"], "saveDirectory")

    @mock.patch.object(save_file.os, "makedirs")
    def test_directory_creation_errors_are_marked_as_directory_errors(self, makedirs):
        makedirs.side_effect = OSError("Permission denied: /Users/me/Scrapes")

        response = save_file.handle_save({
            "directory": "/Users/me/Scrapes",
            "filename": "note.md",
            "content": "hello"
        })

        self.assertFalse(response["success"])
        self.assertEqual(response["errorCode"], "saveDirectory")
        self.assertIn("Permission denied", response["error"])

    def test_rejects_path_separator_in_filename(self):
        with tempfile.TemporaryDirectory() as directory:
            response = save_file.handle_save({
                "directory": directory,
                "filename": "../secret.md",
                "content": "private"
            })

        self.assertFalse(response["success"])
        self.assertIn("filename", response["error"].lower())

    @mock.patch.object(save_file.sys, "platform", "darwin")
    @mock.patch.object(save_file.subprocess, "run")
    def test_can_open_saved_file_on_macos(self, run):
        with tempfile.TemporaryDirectory() as directory:
            response = save_file.handle_save({
                "directory": directory,
                "filename": "note.md",
                "content": "hello",
                "openAfterSave": True
            })

            saved_path = pathlib.Path(response["path"])
            self.assertTrue(response["success"])
            self.assertEqual(saved_path.read_text(encoding="utf-8"), "hello")
            self.assertTrue(response["opened"])
            run.assert_called_once_with(
                ["open", str(saved_path)],
                check=True,
                stdout=save_file.subprocess.DEVNULL,
                stderr=save_file.subprocess.PIPE,
                text=True
            )

    @mock.patch.object(save_file.sys, "platform", "darwin")
    @mock.patch.object(save_file.subprocess, "run")
    def test_can_copy_markdown_text_to_clipboard_on_macos(self, run):
        with tempfile.TemporaryDirectory() as directory:
            response = save_file.handle_save({
                "directory": directory,
                "filename": "note.md",
                "content": "hello",
                "clipboardMode": "markdown"
            })

            self.assertTrue(response["success"])
            self.assertTrue(response["copiedText"])
            run.assert_called_once_with(
                ["pbcopy"],
                input="hello",
                check=True,
                stdout=save_file.subprocess.DEVNULL,
                stderr=save_file.subprocess.PIPE,
                text=True
            )

    @mock.patch.object(save_file.sys, "platform", "darwin")
    @mock.patch.object(save_file.subprocess, "run")
    def test_can_copy_saved_file_to_clipboard_on_macos(self, run):
        with tempfile.TemporaryDirectory() as directory:
            response = save_file.handle_save({
                "directory": directory,
                "filename": "note.md",
                "content": "hello",
                "clipboardMode": "file"
            })

            saved_path = pathlib.Path(response["path"])
            self.assertTrue(response["success"])
            self.assertTrue(response["copiedFile"])
            run.assert_called_once_with(
                [
                    "osascript",
                    "-e", "on run argv",
                    "-e", "set thePath to item 1 of argv",
                    "-e", "set the clipboard to (POSIX file thePath)",
                    "-e", "end run",
                    str(saved_path)
                ],
                check=True,
                stdout=save_file.subprocess.DEVNULL,
                stderr=save_file.subprocess.PIPE,
                text=True
            )

    @mock.patch.object(save_file.sys, "platform", "linux")
    def test_open_after_save_is_macos_only(self):
        with tempfile.TemporaryDirectory() as directory:
            response = save_file.handle_save({
                "directory": directory,
                "filename": "note.md",
                "content": "hello",
                "openAfterSave": True
            })

        self.assertTrue(response["success"])
        self.assertFalse(response["opened"])
        self.assertIn("macOS", response["openError"])

    @mock.patch.object(save_file.sys, "platform", "linux")
    def test_copy_text_to_clipboard_is_macos_only(self):
        with tempfile.TemporaryDirectory() as directory:
            response = save_file.handle_save({
                "directory": directory,
                "filename": "note.md",
                "content": "hello",
                "clipboardMode": "markdown"
            })

        self.assertTrue(response["success"])
        self.assertFalse(response["copiedText"])
        self.assertIn("macOS", response["copyTextError"])

    @mock.patch.object(save_file.sys, "platform", "linux")
    def test_copy_file_to_clipboard_is_macos_only(self):
        with tempfile.TemporaryDirectory() as directory:
            response = save_file.handle_save({
                "directory": directory,
                "filename": "note.md",
                "content": "hello",
                "clipboardMode": "file"
            })

        self.assertTrue(response["success"])
        self.assertFalse(response["copiedFile"])
        self.assertIn("macOS", response["copyFileError"])

    @mock.patch.object(save_file.sys, "platform", "darwin")
    @mock.patch.object(save_file.subprocess, "run")
    def test_can_choose_directory_on_macos(self, run):
        run.return_value.stdout = "/Users/me/Scrapes/\n"

        response = save_file.handle_choose_directory()

        self.assertEqual(response, {
            "success": True,
            "directory": "/Users/me/Scrapes"
        })
        run.assert_called_once_with(
            [
                "osascript",
                "-e", 'POSIX path of (choose folder with prompt "Choose save directory for Page Scraper")'
            ],
            check=True,
            stdout=save_file.subprocess.PIPE,
            stderr=save_file.subprocess.PIPE,
            text=True
        )

    @mock.patch.object(save_file.sys, "platform", "darwin")
    @mock.patch.object(save_file.subprocess, "run")
    def test_choose_directory_cancel_is_not_an_error(self, run):
        run.side_effect = save_file.subprocess.CalledProcessError(
            1,
            ["osascript"],
            stderr="execution error: User canceled. (-128)"
        )

        response = save_file.handle_choose_directory()

        self.assertEqual(response, {
            "success": False,
            "cancelled": True
        })


if __name__ == "__main__":
    unittest.main()
