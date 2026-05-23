#!/usr/bin/env python3
"""Native messaging host for Page Scraper extension.

Receives file content from the Chrome extension via native messaging protocol
and writes it to a specified directory on disk.
"""
import sys
import json
import struct
import os
import subprocess

def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        sys.exit(0)
    message_length = struct.unpack('=I', raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message)


def send_message(message):
    encoded = json.dumps(message).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('=I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def validate_filename(filename):
    if not isinstance(filename, str):
        raise ValueError('Filename must be a string.')
    if not filename or filename in ('.', '..'):
        raise ValueError('Filename is required.')
    if '\x00' in filename or '/' in filename or '\\' in filename:
        raise ValueError('Filename must not contain path separators.')
    if os.path.isabs(filename) or os.path.basename(filename) != filename:
        raise ValueError('Filename must not contain a path.')
    if not filename.lower().endswith('.md'):
        raise ValueError('Filename must end with .md.')
    return filename


def open_saved_file(filepath):
    if sys.platform != 'darwin':
        return False, 'Open after save is macOS only.'

    try:
        subprocess.run(
            ['open', filepath],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True
        )
        return True, ''
    except subprocess.CalledProcessError as e:
        return False, (e.stderr or str(e)).strip()
    except OSError as e:
        return False, str(e)


def copy_markdown_to_clipboard(content):
    if sys.platform != 'darwin':
        return False, 'Copy Markdown text is macOS only.'

    try:
        subprocess.run(
            ['pbcopy'],
            input=content,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True
        )
        return True, ''
    except subprocess.CalledProcessError as e:
        return False, (e.stderr or str(e)).strip()
    except OSError as e:
        return False, str(e)


def copy_saved_file_to_clipboard(filepath):
    if sys.platform != 'darwin':
        return False, 'Copy saved file is macOS only.'

    try:
        subprocess.run(
            [
                'osascript',
                '-e', 'on run argv',
                '-e', 'set thePath to item 1 of argv',
                '-e', 'set the clipboard to (POSIX file thePath)',
                '-e', 'end run',
                filepath
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True
        )
        return True, ''
    except subprocess.CalledProcessError as e:
        return False, (e.stderr or str(e)).strip()
    except OSError as e:
        return False, str(e)


def handle_choose_directory():
    if sys.platform != 'darwin':
        return {'success': False, 'error': 'Folder picker is macOS only'}

    try:
        result = subprocess.run(
            [
                'osascript',
                '-e', 'POSIX path of (choose folder with prompt "Choose save directory for Page Scraper")'
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        directory = result.stdout.strip()
        if len(directory) > 1:
            directory = directory.rstrip('/')
        return {'success': True, 'directory': directory}
    except subprocess.CalledProcessError as e:
        error = (e.stderr or str(e)).strip()
        if '-128' in error or 'User canceled' in error:
            return {'success': False, 'cancelled': True}
        return {'success': False, 'error': error}
    except OSError as e:
        return {'success': False, 'error': str(e)}


def handle_save(msg):
    directory = msg.get('directory', '')
    filename = msg.get('filename', 'untitled.md')
    content = msg.get('content', '')
    clipboard_mode = msg.get('clipboardMode', 'off')
    open_after_save = msg.get('openAfterSave') is True

    if not isinstance(directory, str) or not directory.strip():
        return {'success': False, 'error': 'Save directory is required.'}
    if not isinstance(content, str):
        return {'success': False, 'error': 'Content must be a string.'}

    try:
        safe_filename = validate_filename(filename)
        os.makedirs(directory, exist_ok=True)
        filepath = os.path.join(directory, safe_filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

        response = {
            'success': True,
            'path': filepath,
            'copiedText': False,
            'copiedFile': False,
            'opened': False
        }
        if clipboard_mode == 'markdown':
            copied_text, copy_text_error = copy_markdown_to_clipboard(content)
            response['copiedText'] = copied_text
            if copy_text_error:
                response['copyTextError'] = copy_text_error
        elif clipboard_mode == 'file':
            copied_file, copy_file_error = copy_saved_file_to_clipboard(filepath)
            response['copiedFile'] = copied_file
            if copy_file_error:
                response['copyFileError'] = copy_file_error
        if open_after_save:
            opened, open_error = open_saved_file(filepath)
            response['opened'] = opened
            if open_error:
                response['openError'] = open_error
        return response
    except Exception as e:
        return {'success': False, 'error': str(e)}


def main():
    msg = read_message()
    action = msg.get('action')

    if action == 'save':
        send_message(handle_save(msg))
    elif action == 'chooseDirectory':
        send_message(handle_choose_directory())
    else:
        send_message({'success': False, 'error': f'Unknown action: {action}'})


if __name__ == '__main__':
    main()
