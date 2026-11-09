# RAW ESC/POS through the Windows spooler. Does not create a job until Send.
if (-not ('MordomeRawPrinter' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public sealed class MordomeRawPrinter : IDisposable {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    struct Doc { public string name; public string output; public string type; }
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern uint StartDocPrinter(IntPtr handle, uint level, ref Doc doc);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool StartPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool WritePrinter(IntPtr h, byte[] bytes, int count, out int written);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool EndPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool AbortPrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool ClosePrinter(IntPtr h);
    IntPtr handle;
    static void Check(bool ok) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    public MordomeRawPrinter(string name) { Check(OpenPrinter(name, out handle, IntPtr.Zero)); }
    public uint Send(byte[] bytes, string title) {
        var doc = new Doc { name=title, type="RAW", output=null };
        uint id = StartDocPrinter(handle, 1, ref doc);
        Check(id != 0);
        try {
            Check(StartPagePrinter(handle));
            int written;
            Check(WritePrinter(handle, bytes, bytes.Length, out written));
            if (written != bytes.Length) throw new InvalidOperationException("Envio parcial para impressora; conferir antes de reimprimir.");
            Check(EndPagePrinter(handle));
            Check(EndDocPrinter(handle));
            return id;
        } catch { AbortPrinter(handle); throw; }
    }
    public void Dispose() { if (handle != IntPtr.Zero) { ClosePrinter(handle); handle=IntPtr.Zero; } }
}
'@
}
