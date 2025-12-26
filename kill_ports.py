#!/usr/bin/env python3
"""停止监听指定端口的进程"""

import os
import signal
import subprocess
import sys

def kill_processes_on_port(port):
    """停止监听指定端口的进程"""
    try:
        # 在Windows上使用netstat和taskkill
        result = subprocess.run(
            f'netstat -ano | findstr :{port} | findstr LISTENING',
            shell=True,
            capture_output=True,
            text=True
        )

        if result.stdout:
            lines = result.stdout.strip().split('\n')
            for line in lines:
                if line.strip():
                    parts = line.split()
                    pid = parts[-1]
                    print(f"停止进程 PID: {pid}")
                    subprocess.run(f'taskkill /F /PID {pid}', shell=True)
        else:
            print(f"没有找到监听端口 {port} 的进程")

    except Exception as e:
        print(f"错误: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        port = sys.argv[1]
    else:
        port = 8002

    print(f"正在停止监听端口 {port} 的进程...")
    kill_processes_on_port(port)
    print("完成")