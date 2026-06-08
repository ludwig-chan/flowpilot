$ErrorActionPreference = 'Stop'

Add-Type -ReferencedAssemblies @('System.Windows.Forms') -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace FlowPilotAutoClicker
{
  public static class Program
  {
    private const int WH_MOUSE_LL = 14;
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_LBUTTONDOWN = 0x0201;
    private const int WM_LBUTTONUP = 0x0202;
    private const int WM_MOUSEMOVE = 0x0200;
    private const int WM_KEYDOWN = 0x0100;
    private const int VK_ESCAPE = 0x1B;
    private const uint INPUT_MOUSE = 0;
    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;

    private static readonly LowLevelProc MouseProc = MouseHookCallback;
    private static readonly LowLevelProc KeyboardProc = KeyboardHookCallback;
    private static IntPtr mouseHook = IntPtr.Zero;
    private static IntPtr keyboardHook = IntPtr.Zero;
    private static Timer longPressTimer;
    private static Timer clickTimer;
    private static readonly object Gate = new object();

    private static bool isMouseDown;
    private static bool longPressCanceled;
    private static bool longPressReported;
    private static int downX;
    private static int downY;
    private static int clickX;
    private static int clickY;
    private static int clickInterval;

    private const int LongPressMs = 1200;
    private const int MoveThreshold = 8;

    public static void Run()
    {
      mouseHook = SetHook(WH_MOUSE_LL, MouseProc);
      keyboardHook = SetHook(WH_KEYBOARD_LL, KeyboardProc);

      var inputThread = new Thread(ReadCommands);
      inputThread.IsBackground = true;
      inputThread.Start();

      MSG msg;
      while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0)
      {
        TranslateMessage(ref msg);
        DispatchMessage(ref msg);
      }

      Cleanup();
    }

    private static void ReadCommands()
    {
      string line;
      while ((line = Console.ReadLine()) != null)
      {
        var parts = line.Trim().Split(' ');
        if (parts.Length == 0) continue;

        if (parts[0].Equals("START", StringComparison.OrdinalIgnoreCase) && parts.Length >= 4)
        {
          int x;
          int y;
          int interval;
          if (int.TryParse(parts[1], out x) && int.TryParse(parts[2], out y) && int.TryParse(parts[3], out interval))
          {
            StartClicking(x, y, interval);
          }
        }
        else if (parts[0].Equals("STOP", StringComparison.OrdinalIgnoreCase))
        {
          StopClicking(true);
        }
        else if (parts[0].Equals("EXIT", StringComparison.OrdinalIgnoreCase))
        {
          StopClicking(false);
          PostQuitMessage(0);
          return;
        }
      }
    }

    private static IntPtr SetHook(int hookId, LowLevelProc proc)
    {
      using (var curProcess = System.Diagnostics.Process.GetCurrentProcess())
      using (var curModule = curProcess.MainModule)
      {
        return SetWindowsHookEx(hookId, proc, GetModuleHandle(curModule.ModuleName), 0);
      }
    }

    private static IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
      if (nCode >= 0)
      {
        int message = wParam.ToInt32();
        var hook = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));

        if (message == WM_LBUTTONDOWN)
        {
          lock (Gate)
          {
            isMouseDown = true;
            longPressCanceled = false;
            longPressReported = false;
            downX = hook.pt.x;
            downY = hook.pt.y;
            if (longPressTimer != null) longPressTimer.Dispose();
            longPressTimer = new Timer(OnLongPressTimer, null, LongPressMs, Timeout.Infinite);
          }
        }
        else if (message == WM_MOUSEMOVE)
        {
          lock (Gate)
          {
            if (isMouseDown && (Math.Abs(hook.pt.x - downX) > MoveThreshold || Math.Abs(hook.pt.y - downY) > MoveThreshold))
            {
              longPressCanceled = true;
              if (longPressTimer != null) longPressTimer.Change(Timeout.Infinite, Timeout.Infinite);
            }
          }
        }
        else if (message == WM_LBUTTONUP)
        {
          lock (Gate)
          {
            isMouseDown = false;
            if (longPressTimer != null) longPressTimer.Change(Timeout.Infinite, Timeout.Infinite);
          }
        }
      }

      return CallNextHookEx(mouseHook, nCode, wParam, lParam);
    }

    private static IntPtr KeyboardHookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
      if (nCode >= 0 && wParam.ToInt32() == WM_KEYDOWN)
      {
        int vkCode = Marshal.ReadInt32(lParam);
        if (vkCode == VK_ESCAPE)
        {
          StopClicking(true);
        }
      }

      return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
    }

    private static void OnLongPressTimer(object state)
    {
      int x;
      int y;
      lock (Gate)
      {
        if (!isMouseDown || longPressCanceled || longPressReported) return;
        longPressReported = true;
        x = downX;
        y = downY;
      }

      Console.WriteLine("LONG_PRESS " + x + " " + y);
      Console.Out.Flush();
    }

    private static void StartClicking(int x, int y, int interval)
    {
      lock (Gate)
      {
        clickX = x;
        clickY = y;
        clickInterval = Math.Max(50, interval);
        if (clickTimer != null) clickTimer.Dispose();
        clickTimer = new Timer(_ => DoClick(), null, 0, clickInterval);
      }
      Console.WriteLine("CLICKING_STARTED " + x + " " + y + " " + interval);
      Console.Out.Flush();
    }

    private static void StopClicking(bool notify)
    {
      lock (Gate)
      {
        if (clickTimer == null) return;
        clickTimer.Dispose();
        clickTimer = null;
      }
      if (notify)
      {
        Console.WriteLine("CLICKING_STOPPED");
        Console.Out.Flush();
      }
    }

    private static void DoClick()
    {
      int x;
      int y;
      lock (Gate)
      {
        x = clickX;
        y = clickY;
      }

      SetCursorPos(x, y);
      var inputs = new INPUT[2];
      inputs[0].type = INPUT_MOUSE;
      inputs[0].mi.dwFlags = MOUSEEVENTF_LEFTDOWN;
      inputs[1].type = INPUT_MOUSE;
      inputs[1].mi.dwFlags = MOUSEEVENTF_LEFTUP;
      SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    private static void Cleanup()
    {
      StopClicking(false);
      if (longPressTimer != null) longPressTimer.Dispose();
      if (mouseHook != IntPtr.Zero) UnhookWindowsHookEx(mouseHook);
      if (keyboardHook != IntPtr.Zero) UnhookWindowsHookEx(keyboardHook);
    }

    private delegate IntPtr LowLevelProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int x; public int y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSLLHOOKSTRUCT
    {
      public POINT pt;
      public uint mouseData;
      public uint flags;
      public uint time;
      public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG
    {
      public IntPtr hwnd;
      public uint message;
      public UIntPtr wParam;
      public IntPtr lParam;
      public uint time;
      public POINT pt;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
      public uint type;
      public MOUSEINPUT mi;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT
    {
      public int dx;
      public int dy;
      public uint mouseData;
      public uint dwFlags;
      public uint time;
      public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll")]
    private static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage([In] ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage([In] ref MSG lpmsg);

    [DllImport("user32.dll")]
    private static extern void PostQuitMessage(int nExitCode);

    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  }
}
'@

[FlowPilotAutoClicker.Program]::Run()
