#!/usr/bin/env python3
"""Native messaging host for Local Scraper for LLM extension.

Receives file content from the Chrome extension via native messaging protocol
and writes it to a specified directory on disk.
"""
import sys
import json
import struct
import os

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


def main():
    msg = read_message()
    action = msg.get('action')

    if action == 'save':
        directory = msg.get('directory', '')
        filename = msg.get('filename', 'untitled.md')
        content = msg.get('content', '')

        try:
            os.makedirs(directory, exist_ok=True)
            filepath = os.path.join(directory, filename)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            send_message({'success': True, 'path': filepath})
        except Exception as e:
            send_message({'success': False, 'error': str(e)})
    else:
        send_message({'success': False, 'error': f'Unknown action: {action}'})


if __name__ == '__main__':
    main()
