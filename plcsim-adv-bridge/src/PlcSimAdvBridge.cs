using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Net;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using Sharp7;
using Siemens.Simatic.Simulation.Runtime;

namespace TiaMcp.PlcSimAdvBridge
{
    internal sealed class BridgeRuntimeException : Exception
    {
        public string ErrorCode { get; private set; }
        public int NumericCode { get; private set; }

        public BridgeRuntimeException(string message, ERuntimeErrorCode code) : base(message)
        {
            ErrorCode = code.ToString();
            NumericCode = (int)code;
        }
    }

    internal static class Program
    {
        private static readonly string DefaultPlcSimApiPath =
            @"C:\Program Files (x86)\Common Files\Siemens\PLCSIMADV\API\7.0\Siemens.Simatic.Simulation.Runtime.Api.x64.dll";

        private static readonly string DefaultSharp7FallbackPath =
            @"D:\TIA_MCP\delivery\TIA-MCP-Gateway-D-v1.4.3\upstreams\b\runtime\v20\Sharp7.dll";

        private static readonly string DefaultPipeName = "tia_mcp_plcsim_adv_v7";
        private static readonly object ApiSync = new object();

        private static readonly JavaScriptSerializer Json = CreateSerializer();

        private static JavaScriptSerializer CreateSerializer()
        {
            var s = new JavaScriptSerializer();
            s.MaxJsonLength = 32 * 1024 * 1024;
            return s;
        }

        [STAThread]
        private static int Main(string[] args)
        {
            try
            {
                Console.InputEncoding = Encoding.UTF8;
                Console.OutputEncoding = Encoding.UTF8;
            }
            catch { }

            RegisterAssemblyResolver();

            try
            {
                return RunMain(args);
            }
            catch (Exception ex)
            {
                WriteErrorPayload(args != null && args.Length > 0 ? args[0] : "", ex.Message, ex.GetType().Name, -1);
                return 1;
            }
        }

        [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
        private static int RunMain(string[] args)
        {
            try
            {
                if (args == null || args.Length == 0)
                {
                    PrintHelp();
                    return 0;
                }

                string cmd = (args[0] ?? string.Empty).Trim().ToLowerInvariant();
                if (cmd == "--help" || cmd == "-h" || cmd == "help")
                {
                    PrintHelp();
                    return 0;
                }

                if (cmd == "--mcp" || cmd == "mcp")
                {
                    return RunMcpServer();
                }

                var opts = ParseOptions(args, 1);

                if (cmd == "serve")
                {
                    return RunPipeDaemon(opts);
                }

                string pipeName = OptStr(opts, "pipe", DefaultPipeName).Trim();
                bool noDaemon = OptBool(opts, "no-daemon", false);
                bool shouldAutoStartDaemon = !noDaemon && (cmd == "create" || cmd == "ensure");

                if (!noDaemon)
                {
                    string forwardedJson = TryForwardViaPipe(cmd, opts, pipeName, shouldAutoStartDaemon);
                    if (forwardedJson != null)
                    {
                        Console.Out.WriteLine(forwardedJson);
                        Dictionary<string, object> parsed = null;
                        try { parsed = Json.Deserialize<Dictionary<string, object>>(forwardedJson); } catch { }
                        if (parsed != null && parsed.ContainsKey("ok") && parsed["ok"] is bool && !(bool)parsed["ok"])
                        {
                            return parsed.ContainsKey("numericCode") && parsed["numericCode"] is int && (int)parsed["numericCode"] != -1 ? 2 : 1;
                        }
                        return 0;
                    }
                }

                if (cmd == "daemon-stop")
                {
                    var resStop = new Dictionary<string, object>();
                    resStop["stopped"] = false;
                    resStop["reason"] = "daemon not running";
                    var pStop = new Dictionary<string, object>();
                    pStop["ok"] = true;
                    pStop["command"] = cmd;
                    pStop["data"] = resStop;
                    Console.Out.WriteLine(Json.Serialize(pStop));
                    return 0;
                }

                object result;
                lock (ApiSync)
                {
                    result = DispatchCommand(cmd, opts);
                }
                var payload = new Dictionary<string, object>();
                payload["ok"] = true;
                payload["command"] = cmd;
                payload["data"] = result;
                Console.Out.WriteLine(Json.Serialize(payload));
                return 0;
            }
            catch (SimulationRuntimeException simEx)
            {
                WriteErrorPayload(args != null && args.Length > 0 ? args[0] : "", simEx.Message, simEx.RuntimeErrorCode.ToString(), (int)simEx.RuntimeErrorCode);
                return 2;
            }
            catch (BridgeRuntimeException bEx)
            {
                WriteErrorPayload(args != null && args.Length > 0 ? args[0] : "", bEx.Message, bEx.ErrorCode, bEx.NumericCode);
                return 2;
            }
            catch (Exception ex)
            {
                Exception root = ex is TargetInvocationException && ex.InnerException != null ? ex.InnerException : ex;
                var simEx = root as SimulationRuntimeException;
                if (simEx != null)
                {
                    WriteErrorPayload(args != null && args.Length > 0 ? args[0] : "", simEx.Message, simEx.RuntimeErrorCode.ToString(), (int)simEx.RuntimeErrorCode);
                    return 2;
                }
                WriteErrorPayload(args != null && args.Length > 0 ? args[0] : "", root.Message, root.GetType().Name, -1);
                return 1;
            }
        }

        private static void WriteErrorPayload(string command, string message, string errorCode, int numericCode)
        {
            var err = new Dictionary<string, object>();
            err["ok"] = false;
            err["command"] = command ?? string.Empty;
            err["error"] = message ?? "Unknown error";
            err["errorCode"] = errorCode ?? string.Empty;
            err["numericCode"] = numericCode;
            Console.Out.WriteLine(Json.Serialize(err));
        }

        private static void RegisterAssemblyResolver()
        {
            AppDomain.CurrentDomain.AssemblyResolve += delegate(object sender, ResolveEventArgs e)
            {
                string simpleName = new AssemblyName(e.Name).Name;
                if (string.Equals(simpleName, "Siemens.Simatic.Simulation.Runtime.Api.x64", StringComparison.OrdinalIgnoreCase))
                {
                    string custom = Environment.GetEnvironmentVariable("PLCSIM_ADV_API_DLL");
                    string candidate = !string.IsNullOrEmpty(custom) && File.Exists(custom) ? custom : DefaultPlcSimApiPath;
                    if (File.Exists(candidate))
                    {
                        return Assembly.LoadFrom(candidate);
                    }
                }
                if (string.Equals(simpleName, "Sharp7", StringComparison.OrdinalIgnoreCase))
                {
                    string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                    string sibling = Path.Combine(baseDir, "Sharp7.dll");
                    if (File.Exists(sibling))
                    {
                        return Assembly.LoadFrom(sibling);
                    }
                    string customS7 = Environment.GetEnvironmentVariable("SHARP7_DLL");
                    if (!string.IsNullOrEmpty(customS7) && File.Exists(customS7))
                    {
                        return Assembly.LoadFrom(customS7);
                    }
                    if (File.Exists(DefaultSharp7FallbackPath))
                    {
                        return Assembly.LoadFrom(DefaultSharp7FallbackPath);
                    }
                }
                return null;
            };
        }

        private static Dictionary<string, string> ParseOptions(string[] args, int startIndex)
        {
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (int i = startIndex; i < args.Length; i++)
            {
                string raw = args[i] ?? string.Empty;
                if (!raw.StartsWith("--"))
                {
                    continue;
                }
                string key = raw.Substring(2);
                int eqIdx = key.IndexOf('=');
                if (eqIdx > 0)
                {
                    map[key.Substring(0, eqIdx)] = key.Substring(eqIdx + 1);
                    continue;
                }
                if (i + 1 < args.Length && !(args[i + 1] ?? string.Empty).StartsWith("--"))
                {
                    map[key] = args[++i];
                }
                else
                {
                    map[key] = "true";
                }
            }
            return map;
        }

        private static string OptStr(Dictionary<string, string> opts, string key, string fallback)
        {
            string val;
            if (opts != null && opts.TryGetValue(key, out val) && val != null)
            {
                return val;
            }
            return fallback;
        }

        private static string RequireOptStr(Dictionary<string, string> opts, string key)
        {
            string val = OptStr(opts, key, string.Empty).Trim();
            if (string.IsNullOrEmpty(val))
            {
                throw new ArgumentException("Missing required option --" + key);
            }
            return val;
        }

        private static bool OptBool(Dictionary<string, string> opts, string key, bool fallback)
        {
            string raw = OptStr(opts, key, string.Empty).Trim();
            if (string.IsNullOrEmpty(raw)) return fallback;
            bool parsed;
            if (bool.TryParse(raw, out parsed)) return parsed;
            if (raw == "1") return true;
            if (raw == "0") return false;
            throw new ArgumentException("Invalid boolean for --" + key + ": " + raw);
        }

        private static int OptInt(Dictionary<string, string> opts, string key, int fallback)
        {
            string raw = OptStr(opts, key, string.Empty).Trim();
            if (string.IsNullOrEmpty(raw)) return fallback;
            int parsed;
            if (int.TryParse(raw, out parsed)) return parsed;
            throw new ArgumentException("Invalid integer for --" + key + ": " + raw);
        }

        private static uint OptUInt(Dictionary<string, string> opts, string key, uint fallback)
        {
            string raw = OptStr(opts, key, string.Empty).Trim();
            if (string.IsNullOrEmpty(raw)) return fallback;
            uint parsed;
            if (uint.TryParse(raw, out parsed)) return parsed;
            throw new ArgumentException("Invalid unsigned integer for --" + key + ": " + raw);
        }

        private static object DispatchCommand(string cmd, Dictionary<string, string> opts)
        {
            switch (cmd)
            {
                case "status":
                    return CmdStatus();
                case "list":
                    return CmdListInstances();
                case "net-interfaces":
                    return CmdNetInterfaces();
                case "network-mode":
                    return CmdNetworkMode(opts);
                case "create":
                case "ensure":
                    return CmdCreateInstance(opts);
                case "power-on":
                    return CmdPowerOn(opts);
                case "run":
                    return CmdRun(opts);
                case "stop":
                    return CmdStop(opts);
                case "memory-reset":
                    return CmdMemoryReset(opts);
                case "power-off":
                    return CmdPowerOff(opts);
                case "set-ip":
                    return CmdSetIp(opts);
                case "wait-state":
                    return CmdWaitState(opts);
                case "cleanup":
                case "unregister":
                    return CmdCleanup(opts);
                case "s7-read-db":
                    return CmdS7ReadDb(opts);
                case "plcsim-read-tags":
                    return CmdPlcSimReadTags(opts);
                default:
                    throw new ArgumentException("Unknown command: " + cmd);
            }
        }

        private static object CmdStatus()
        {
            var res = new Dictionary<string, object>();
            res["isInitialized"] = SimulationRuntimeManager.IsInitialized;
            res["isRuntimeManagerAvailable"] = SimulationRuntimeManager.IsRuntimeManagerAvailable;
            res["version"] = SimulationRuntimeManager.Version;
            res["networkMode"] = SimulationRuntimeManager.NetworkMode.ToString();
            res["defaultStoragePath"] = SafeGetDefaultStoragePath();
            res["port"] = SafeGetPort();
            res["registeredInstances"] = DescribeAllInstances();
            res["netInterfaces"] = DescribeNetInterfaces();
            return res;
        }

        private static string SafeGetDefaultStoragePath()
        {
            try { return SimulationRuntimeManager.DefaultStoragePath ?? string.Empty; }
            catch { return string.Empty; }
        }

        private static int SafeGetPort()
        {
            try { return (int)SimulationRuntimeManager.Port; }
            catch { return 0; }
        }

        private static object CmdListInstances()
        {
            var res = new Dictionary<string, object>();
            res["networkMode"] = SimulationRuntimeManager.NetworkMode.ToString();
            res["instances"] = DescribeAllInstances();
            return res;
        }

        private static List<Dictionary<string, object>> DescribeAllInstances()
        {
            var list = new List<Dictionary<string, object>>();
            SInstanceInfo[] infos = SimulationRuntimeManager.RegisteredInstanceInfo ?? new SInstanceInfo[0];
            foreach (SInstanceInfo info in infos)
            {
                list.Add(SafeDescribeInstanceByName(info.Name, info.ID));
            }
            return list;
        }

        private static Dictionary<string, object> SafeDescribeInstanceByName(string name, int fallbackId)
        {
            try
            {
                IInstance inst = SimulationRuntimeManager.CreateInterface(name);
                return DescribeInstance(inst);
            }
            catch (Exception ex)
            {
                var d = new Dictionary<string, object>();
                d["id"] = fallbackId;
                d["name"] = name;
                d["error"] = ex.Message;
                return d;
            }
        }

        private static Dictionary<string, object> DescribeInstance(IInstance inst)
        {
            var d = new Dictionary<string, object>();
            d["id"] = inst.ID;
            d["name"] = inst.Name ?? string.Empty;
            d["cpuType"] = inst.CPUType.ToString();
            d["articleNumber"] = SafeString(delegate { return inst.ArticleNumber; });
            d["controllerName"] = SafeString(delegate { return inst.ControllerName; });
            d["controllerShortDesignation"] = SafeString(delegate { return inst.ControllerShortDesignation; });
            d["operatingState"] = inst.OperatingState.ToString();
            d["operatingMode"] = SafeString(delegate { return inst.OperatingMode.ToString(); });
            d["communicationInterface"] = inst.CommunicationInterface.ToString();
            d["licenseStatus"] = SafeString(delegate { return inst.LicenseStatus.ToString(); });
            d["storagePath"] = SafeString(delegate { return inst.StoragePath; });

            var ips = new List<string>();
            try
            {
                if (inst.ControllerIP != null)
                {
                    foreach (string ip in inst.ControllerIP)
                    {
                        if (!string.IsNullOrEmpty(ip)) ips.Add(ip);
                    }
                }
            }
            catch { }
            d["controllerIP"] = ips;

            var suites = new List<Dictionary<string, object>>();
            try
            {
                if (inst.ControllerIPSuite4 != null)
                {
                    foreach (SIPSuite4 suite in inst.ControllerIPSuite4)
                    {
                        var s = new Dictionary<string, object>();
                        s["ipAddress"] = suite.IPAddress.IPString ?? string.Empty;
                        s["subnetMask"] = suite.SubnetMask.IPString ?? string.Empty;
                        s["defaultGateway"] = suite.DefaultGateway.IPString ?? string.Empty;
                        suites.Add(s);
                    }
                }
            }
            catch { }
            d["controllerIPSuite4"] = suites;
            return d;
        }

        private delegate string StringGetter();

        private static string SafeString(StringGetter getter)
        {
            try { return getter() ?? string.Empty; }
            catch { return string.Empty; }
        }

        private static object CmdNetInterfaces()
        {
            var res = new Dictionary<string, object>();
            res["networkMode"] = SimulationRuntimeManager.NetworkMode.ToString();
            res["netInterfaces"] = DescribeNetInterfaces();
            return res;
        }

        private static List<Dictionary<string, object>> DescribeNetInterfaces()
        {
            var list = new List<Dictionary<string, object>>();
            SNetInterfaceInfo[] nics = SimulationRuntimeManager.NetInterfaces ?? new SNetInterfaceInfo[0];
            foreach (SNetInterfaceInfo nic in nics)
            {
                var d = new Dictionary<string, object>();
                d["interfaceIndex"] = nic.interfaceIndex;
                d["interfaceName"] = nic.interfaceName ?? string.Empty;
                d["interfaceDescription"] = nic.interfaceDescription ?? string.Empty;
                d["macAddress"] = nic.MACAddress.ToString();
                d["vSwitchBindingEnabled"] = nic.vSwitchBindingEnabled;
                d["isConnected"] = nic.isConnected;
                list.Add(d);
            }
            return list;
        }

        private static object CmdNetworkMode(Dictionary<string, string> opts)
        {
            string setRaw = OptStr(opts, "set", string.Empty).Trim();
            string previous = SimulationRuntimeManager.NetworkMode.ToString();
            if (!string.IsNullOrEmpty(setRaw))
            {
                ENetworkMode target = ParseNetworkMode(setRaw);
                if (SimulationRuntimeManager.NetworkMode != target)
                {
                    SimulationRuntimeManager.NetworkMode = target;
                }
                if (target == ENetworkMode.TCPIPSingleAdapter || target == ENetworkMode.TCPIPMultipleAdapter)
                {
                    string bindIdxRaw = OptStr(opts, "bind-index", string.Empty).Trim();
                    if (!string.IsNullOrEmpty(bindIdxRaw))
                    {
                        uint idx;
                        if (!uint.TryParse(bindIdxRaw, out idx))
                        {
                            throw new ArgumentException("Invalid --bind-index: " + bindIdxRaw);
                        }
                        SimulationRuntimeManager.SetNetInterfaceBindings(idx);
                    }
                }
            }

            var res = new Dictionary<string, object>();
            res["previous"] = previous;
            res["current"] = SimulationRuntimeManager.NetworkMode.ToString();
            return res;
        }

        private static ENetworkMode ParseNetworkMode(string raw)
        {
            string norm = (raw ?? string.Empty).Trim().Replace("_", "").Replace("-", "").Replace("/", "").ToLowerInvariant();
            if (norm == "softbus" || norm == "plcsim") return ENetworkMode.Softbus;
            if (norm == "tcpipsingleadapter" || norm == "tcpip" || norm == "single") return ENetworkMode.TCPIPSingleAdapter;
            if (norm == "tcpipmultipleadapter" || norm == "multiple") return ENetworkMode.TCPIPMultipleAdapter;
            ENetworkMode parsed;
            if (Enum.TryParse<ENetworkMode>(raw, true, out parsed)) return parsed;
            throw new ArgumentException("Unsupported ENetworkMode: " + raw);
        }

        private static ECPUType ParseCpuType(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return ECPUType.CPU1500_Unspecified;
            string trimmed = raw.Trim();
            ECPUType parsed;
            if (Enum.TryParse<ECPUType>(trimmed, true, out parsed)) return parsed;
            if (!trimmed.StartsWith("CPU", StringComparison.OrdinalIgnoreCase))
            {
                if (Enum.TryParse<ECPUType>("CPU" + trimmed, true, out parsed)) return parsed;
            }
            throw new ArgumentException("Unsupported ECPUType: " + raw);
        }

        private static IInstance FindExistingInstance(string name)
        {
            SInstanceInfo[] infos = SimulationRuntimeManager.RegisteredInstanceInfo ?? new SInstanceInfo[0];
            foreach (SInstanceInfo info in infos)
            {
                if (string.Equals(info.Name, name, StringComparison.OrdinalIgnoreCase))
                {
                    return SimulationRuntimeManager.CreateInterface(info.Name);
                }
            }
            return null;
        }

        private static IInstance RequireInstance(string name)
        {
            IInstance inst = FindExistingInstance(name);
            if (inst == null)
            {
                throw new BridgeRuntimeException("PLCSIM instance does not exist: " + name, ERuntimeErrorCode.DoesNotExist);
            }
            return inst;
        }

        private static object CmdCreateInstance(Dictionary<string, string> opts)
        {
            string name = RequireOptStr(opts, "name");
            string cpuRaw = OptStr(opts, "cpu", "CPU1500_Unspecified");
            string storage = OptStr(opts, "storage", string.Empty).Trim();
            string modeRaw = OptStr(opts, "network-mode", string.Empty).Trim();
            string ip = OptStr(opts, "ip", string.Empty).Trim();
            string mask = OptStr(opts, "mask", "255.255.255.0").Trim();
            string gw = OptStr(opts, "gw", "0.0.0.0").Trim();
            uint ifaceId = OptUInt(opts, "interface-id", 0);
            bool persistent = OptBool(opts, "persistent", true);
            bool doPowerOn = OptBool(opts, "power-on", false);
            bool doRun = OptBool(opts, "run", false);
            uint timeoutMs = OptUInt(opts, "timeout", 45000);

            if (!string.IsNullOrEmpty(modeRaw))
            {
                ENetworkMode desiredMode = ParseNetworkMode(modeRaw);
                if (SimulationRuntimeManager.NetworkMode != desiredMode)
                {
                    SimulationRuntimeManager.NetworkMode = desiredMode;
                }
            }

            IInstance inst = FindExistingInstance(name);
            bool created = false;
            if (inst == null)
            {
                ECPUType cpuType = ParseCpuType(cpuRaw);
                inst = SimulationRuntimeManager.RegisterInstance(cpuType, name);
                created = true;
            }

            if (!string.IsNullOrEmpty(storage))
            {
                Directory.CreateDirectory(storage);
                if (inst.OperatingState == EOperatingState.Off)
                {
                    inst.StoragePath = storage;
                }
            }

            if (doPowerOn || doRun)
            {
                EnsurePoweredOn(inst, timeoutMs);
            }

            if (!string.IsNullOrEmpty(ip))
            {
                ApplyIpSuiteWithWait(inst, ifaceId, ip, mask, gw, persistent, timeoutMs);
            }

            if (doRun)
            {
                EnsureRunning(inst, timeoutMs);
            }

            var res = new Dictionary<string, object>();
            res["created"] = created;
            res["instance"] = DescribeInstance(inst);
            return res;
        }

        private static void EnsurePoweredOn(IInstance inst, uint timeoutMs)
        {
            if (inst.OperatingState == EOperatingState.Off)
            {
                ERuntimeErrorCode rc = inst.PowerOn(timeoutMs);
                if ((int)rc < 0)
                {
                    throw new BridgeRuntimeException("PowerOn failed: " + rc.ToString(), rc);
                }
            }
            WaitForPredicate(
                delegate
                {
                    EOperatingState s = inst.OperatingState;
                    return s != EOperatingState.Off && s != EOperatingState.Booting && s != EOperatingState.InvalidOperatingState;
                },
                (int)timeoutMs,
                "Timeout waiting for PLCSIM PowerOn to complete (state=" + inst.OperatingState.ToString() + ")");
        }

        private static void EnsureRunning(IInstance inst, uint timeoutMs)
        {
            EnsurePoweredOn(inst, timeoutMs);
            if (inst.OperatingState != EOperatingState.Run)
            {
                inst.Run(timeoutMs);
            }
            WaitForStateInternal(inst, new EOperatingState[] { EOperatingState.Run }, (int)timeoutMs);
        }

        private static void EnsureStopped(IInstance inst, uint timeoutMs)
        {
            EnsurePoweredOn(inst, timeoutMs);
            if (inst.OperatingState != EOperatingState.Stop)
            {
                inst.Stop(timeoutMs);
            }
            WaitForStateInternal(inst, new EOperatingState[] { EOperatingState.Stop }, (int)timeoutMs);
        }

        private static void ApplyIpSuiteWithWait(IInstance inst, uint interfaceId, string ip, string mask, string gw, bool persistent, uint timeoutMs)
        {
            var suite = new SIPSuite4(ip, mask, gw);
            int deadline = Environment.TickCount + (int)Math.Min(timeoutMs, 15000);
            while (true)
            {
                try
                {
                    inst.SetIPSuite(interfaceId, suite, persistent);
                    return;
                }
                catch (SimulationRuntimeException ex)
                {
                    if (ex.RuntimeErrorCode == ERuntimeErrorCode.WrongArgument || Environment.TickCount - deadline >= 0)
                    {
                        throw;
                    }
                    Thread.Sleep(250);
                }
            }
        }

        private delegate bool PollPredicate();

        private static void WaitForPredicate(PollPredicate predicate, int timeoutMs, string timeoutMessage)
        {
            var sw = Stopwatch.StartNew();
            while (true)
            {
                if (predicate()) return;
                if (sw.ElapsedMilliseconds >= timeoutMs)
                {
                    throw new TimeoutException(timeoutMessage);
                }
                Thread.Sleep(150);
            }
        }

        private static void WaitForStateInternal(IInstance inst, EOperatingState[] targets, int timeoutMs)
        {
            WaitForPredicate(
                delegate
                {
                    EOperatingState cur = inst.OperatingState;
                    for (int i = 0; i < targets.Length; i++)
                    {
                        if (cur == targets[i]) return true;
                    }
                    return false;
                },
                timeoutMs,
                "Timeout waiting for operating state (current=" + inst.OperatingState.ToString() + ")");
        }

        private static object CmdPowerOn(Dictionary<string, string> opts)
        {
            string name = RequireOptStr(opts, "name");
            uint timeoutMs = OptUInt(opts, "timeout", 45000);
            IInstance inst = RequireInstance(name);
            EnsurePoweredOn(inst, timeoutMs);
            return DescribeInstance(inst);
        }

        private static object CmdRun(Dictionary<string, string> opts)
        {
            string name = RequireOptStr(opts, "name");
            uint timeoutMs = OptUInt(opts, "timeout", 30000);
            IInstance inst = RequireInstance(name);
            EnsureRunning(inst, timeoutMs);
            return DescribeInstance(inst);
        }

        private static object CmdStop(Dictionary<string, string> opts)
        {
            string name = RequireOptStr(opts, "name");
            uint timeoutMs = OptUInt(opts, "timeout", 20000);
            IInstance inst = RequireInstance(name);
            EnsureStopped(inst, timeoutMs);
            return DescribeInstance(inst);
        }

        private static object CmdMemoryReset(Dictionary<string, string> opts)
        {
            string name = RequireOptStr(opts, "name");
            uint timeoutMs = OptUInt(opts, "timeout", 30000);
            IInstance inst = RequireInstance(name);
            EnsurePoweredOn(inst, timeoutMs);
            inst.MemoryReset(timeoutMs);
            WaitForStateInternal(inst, new EOperatingState[] { EOperatingState.Stop, EOperatingState.Run }, (int)timeoutMs);
            return DescribeInstance(inst);
        }

        private static object CmdPowerOff(Dictionary<string, string> opts)
        {
            string name = RequireOptStr(opts, "name");
            uint timeoutMs = OptUInt(opts, "timeout", 20000);
            IInstance inst = RequireInstance(name);
            if (inst.OperatingState != EOperatingState.Off)
            {
                inst.PowerOff(timeoutMs);
                WaitForStateInternal(inst, new EOperatingState[] { EOperatingState.Off }, (int)timeoutMs);
            }
            return DescribeInstance(inst);
        }

        private static object CmdSetIp(Dictionary<string, string> opts)
        {
            string name = RequireOptStr(opts, "name");
            string ip = RequireOptStr(opts, "ip");
            string mask = OptStr(opts, "mask", "255.255.255.0").Trim();
            string gw = OptStr(opts, "gw", "0.0.0.0").Trim();
            uint ifaceId = OptUInt(opts, "interface-id", 0);
            bool persistent = OptBool(opts, "persistent", true);
            uint timeoutMs = OptUInt(opts, "timeout", 15000);

            IInstance inst = RequireInstance(name);
            ApplyIpSuiteWithWait(inst, ifaceId, ip, mask, gw, persistent, timeoutMs);
            return DescribeInstance(inst);
        }

        private static object CmdWaitState(Dictionary<string, string> opts)
        {
            string name = RequireOptStr(opts, "name");
            string stateRaw = RequireOptStr(opts, "state");
            int timeoutMs = OptInt(opts, "timeout", 20000);
            EOperatingState target;
            if (!Enum.TryParse<EOperatingState>(stateRaw, true, out target))
            {
                throw new ArgumentException("Unknown EOperatingState: " + stateRaw);
            }
            IInstance inst = RequireInstance(name);
            WaitForStateInternal(inst, new EOperatingState[] { target }, timeoutMs);
            return DescribeInstance(inst);
        }

        private static object CmdCleanup(Dictionary<string, string> opts)
        {
            string name = RequireOptStr(opts, "name");
            bool deleteStorage = OptBool(opts, "delete-storage", true);
            uint timeoutMs = OptUInt(opts, "timeout", 20000);

            var res = new Dictionary<string, object>();
            res["name"] = name;

            IInstance inst = FindExistingInstance(name);
            if (inst == null)
            {
                res["existed"] = false;
                res["unregistered"] = false;
                res["storageCleaned"] = false;
                return res;
            }

            res["existed"] = true;
            string storagePath = SafeString(delegate { return inst.StoragePath; });
            res["storagePath"] = storagePath;

            if (inst.OperatingState != EOperatingState.Off)
            {
                try
                {
                    inst.PowerOff(timeoutMs);
                    WaitForStateInternal(inst, new EOperatingState[] { EOperatingState.Off }, (int)timeoutMs);
                }
                catch
                {
                    // Continue to unregister even if PowerOff timed out
                }
            }

            if (deleteStorage)
            {
                try
                {
                    inst.CleanupStoragePath();
                    res["storageCleaned"] = true;
                }
                catch
                {
                    res["storageCleaned"] = false;
                }
            }
            else
            {
                res["storageCleaned"] = false;
            }

            inst.UnregisterInstance();
            res["unregistered"] = true;
            return res;
        }

        private static object CmdS7ReadDb(Dictionary<string, string> opts)
        {
            string ip = RequireOptStr(opts, "ip");
            int db = OptInt(opts, "db", 0);
            if (db <= 0) throw new ArgumentException("--db must be a positive integer");
            int offset = OptInt(opts, "offset", 0);
            int size = OptInt(opts, "size", 62);
            int rack = OptInt(opts, "rack", 0);
            int slot = OptInt(opts, "slot", 1);
            int retries = OptInt(opts, "retries", 3);
            bool parseSummary = OptBool(opts, "parse-summary", false);

            var buffer = new byte[size];
            Exception lastFailure = null;
            int lastCode = 0;

            for (int attempt = 0; attempt < Math.Max(1, retries); attempt++)
            {
                var client = new S7Client();
                try
                {
                    int connRc = client.ConnectTo(ip, rack, slot);
                    if (connRc != 0)
                    {
                        lastCode = connRc;
                        lastFailure = new IOException("S7 ConnectTo(" + ip + ", rack=" + rack + ", slot=" + slot + ") failed: [" + connRc + "] " + client.ErrorText(connRc));
                        Thread.Sleep(150);
                        continue;
                    }

                    int readRc = client.DBRead(db, offset, size, buffer);
                    if (readRc != 0)
                    {
                        lastCode = readRc;
                        lastFailure = new IOException("S7 DBRead(DB" + db + ", offset=" + offset + ", size=" + size + ") failed: [" + readRc + "] " + client.ErrorText(readRc));
                        Thread.Sleep(150);
                        continue;
                    }

                    int cpuStatus = -1;
                    try { client.PlcGetStatus(ref cpuStatus); } catch { }

                    var d = new Dictionary<string, object>();
                    d["ip"] = ip;
                    d["db"] = db;
                    d["offset"] = offset;
                    d["size"] = size;
                    d["rack"] = rack;
                    d["slot"] = slot;
                    d["cpuStatus"] = cpuStatus;
                    d["base64"] = Convert.ToBase64String(buffer);
                    d["hex"] = BitConverter.ToString(buffer).Replace("-", "");
                    if (parseSummary && offset == 0 && size >= 62)
                    {
                        d["summary"] = DecodeTestSummary62(buffer);
                    }
                    return d;
                }
                finally
                {
                    try { client.Disconnect(); } catch { }
                }
            }

            if (lastFailure != null)
            {
                throw new IOException(lastFailure.Message + " (code=" + lastCode + ")", lastFailure);
            }
            throw new IOException("S7 read failed for unknown reason");
        }

        private static Dictionary<string, object> DecodeTestSummary62(byte[] b)
        {
            var s = new Dictionary<string, object>();
            s["done"] = (b[0] & 0x01) != 0;
            s["passed"] = (b[0] & 0x02) != 0;
            s["running"] = (b[0] & 0x04) != 0;
            s["hasError"] = (b[0] & 0x08) != 0;
            s["totalCases"] = ReadInt16BE(b, 2);
            s["executedCases"] = ReadInt16BE(b, 4);
            s["passedCases"] = ReadInt16BE(b, 6);
            s["failedCases"] = ReadInt16BE(b, 8);
            s["skippedCases"] = ReadInt16BE(b, 10);
            s["currentCaseIndex"] = ReadInt16BE(b, 12);
            s["currentStepIndex"] = ReadInt16BE(b, 14);
            s["firstFailCase"] = ReadInt16BE(b, 16);
            s["firstFailStep"] = ReadInt16BE(b, 18);
            s["firstFailFieldIndex"] = ReadInt16BE(b, 20);
            s["firstFailIsHmi"] = (b[22] & 0x01) != 0;
            s["firstFailMask"] = ReadUInt32BE(b, 24);
            ushort statusCode = ReadUInt16BE(b, 28);
            s["statusCode"] = statusCode;
            s["statusCodeHex"] = "0x" + statusCode.ToString("X4");
            s["totalStepsExecuted"] = ReadInt32BE(b, 32);
            s["failedStepsCount"] = ReadInt32BE(b, 36);
            s["firstFailActualReal"] = ReadFloatBE(b, 40);
            s["firstFailExpectedReal"] = ReadFloatBE(b, 44);
            s["firstFailActualDInt"] = ReadInt32BE(b, 48);
            s["firstFailExpectedDInt"] = ReadInt32BE(b, 52);
            s["firstFailActualWord"] = ReadUInt16BE(b, 56);
            s["firstFailExpectedWord"] = ReadUInt16BE(b, 58);
            s["firstFailActualBool"] = (b[60] & 0x01) != 0;
            s["firstFailExpectedBool"] = (b[60] & 0x02) != 0;
            return s;
        }

        private static short ReadInt16BE(byte[] b, int offset)
        {
            return (short)((b[offset] << 8) | b[offset + 1]);
        }

        private static ushort ReadUInt16BE(byte[] b, int offset)
        {
            return (ushort)((b[offset] << 8) | b[offset + 1]);
        }

        private static int ReadInt32BE(byte[] b, int offset)
        {
            return (b[offset] << 24) | (b[offset + 1] << 16) | (b[offset + 2] << 8) | b[offset + 3];
        }

        private static uint ReadUInt32BE(byte[] b, int offset)
        {
            return ((uint)b[offset] << 24) | ((uint)b[offset + 1] << 16) | ((uint)b[offset + 2] << 8) | b[offset + 3];
        }

        private static float ReadFloatBE(byte[] b, int offset)
        {
            var tmp = new byte[] { b[offset + 3], b[offset + 2], b[offset + 1], b[offset] };
            return BitConverter.ToSingle(tmp, 0);
        }

        private static object CmdPlcSimReadTags(Dictionary<string, string> opts)
        {
            string name = RequireOptStr(opts, "name");
            string dbFilter = OptStr(opts, "db", string.Empty).Trim();
            string prefix = OptStr(opts, "prefix", string.Empty).Trim();
            IInstance inst = RequireInstance(name);

            if (!string.IsNullOrEmpty(dbFilter))
            {
                inst.UpdateTagList(ETagListDetails.DB, false, dbFilter);
            }
            else
            {
                inst.UpdateTagList(ETagListDetails.IOMCTDB);
            }

            STagInfo[] infos = inst.TagInfos ?? new STagInfo[0];
            var items = new List<Dictionary<string, object>>();
            var batch = new List<SDataValueByName>();

            foreach (STagInfo t in infos)
            {
                string tName = t.Name ?? string.Empty;
                if (!string.IsNullOrEmpty(prefix) && !tName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                if (t.PrimitiveDataType == EPrimitiveDataType.Unspecific || t.PrimitiveDataType == EPrimitiveDataType.Struct)
                {
                    continue;
                }
                var entry = new SDataValueByName();
                entry.Name = tName;
                batch.Add(entry);
            }

            if (batch.Count > 0)
            {
                SDataValueByName[] arr = batch.ToArray();
                inst.ReadSignals(ref arr);
                for (int i = 0; i < arr.Length; i++)
                {
                    var d = new Dictionary<string, object>();
                    d["name"] = arr[i].Name;
                    d["type"] = arr[i].DataValue.Type.ToString();
                    d["errorCode"] = arr[i].ErrorCode.ToString();
                    d["value"] = ExtractSDataValue(arr[i].DataValue);
                    items.Add(d);
                }
            }

            var res = new Dictionary<string, object>();
            res["instance"] = name;
            res["tagCount"] = infos.Length;
            res["readCount"] = items.Count;
            res["tags"] = items;
            return res;
        }

        private static object ExtractSDataValue(SDataValue v)
        {
            switch (v.Type)
            {
                case EPrimitiveDataType.Bool: return v.Bool;
                case EPrimitiveDataType.Int8: return v.Int8;
                case EPrimitiveDataType.Int16: return v.Int16;
                case EPrimitiveDataType.Int32: return v.Int32;
                case EPrimitiveDataType.Int64: return v.Int64;
                case EPrimitiveDataType.UInt8: return v.UInt8;
                case EPrimitiveDataType.UInt16: return v.UInt16;
                case EPrimitiveDataType.UInt32: return v.UInt32;
                case EPrimitiveDataType.UInt64: return v.UInt64;
                case EPrimitiveDataType.Float: return v.Float;
                case EPrimitiveDataType.Double: return v.Double;
                case EPrimitiveDataType.Char: return v.Char;
                case EPrimitiveDataType.WChar: return v.WChar;
                default: return v.UInt64;
            }
        }

        private static int RunMcpServer()
        {
            while (true)
            {
                string line = Console.In.ReadLine();
                if (line == null) break;
                string trimmed = line.Trim();
                if (string.IsNullOrEmpty(trimmed)) continue;

                Dictionary<string, object> req;
                try
                {
                    req = Json.Deserialize<Dictionary<string, object>>(trimmed);
                }
                catch
                {
                    continue;
                }
                if (req == null) continue;

                object idObj = null;
                req.TryGetValue("id", out idObj);
                string method = req.ContainsKey("method") && req["method"] != null ? req["method"].ToString() : string.Empty;
                Dictionary<string, object> paramsObj = req.ContainsKey("params") ? req["params"] as Dictionary<string, object> : null;

                // Notifications (no id) require no response in JSON-RPC 2.0
                if (idObj == null && method.StartsWith("notifications/", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                try
                {
                    object result = HandleMcpMethod(method, paramsObj);
                    WriteMcpResult(idObj, result);
                }
                catch (Exception ex)
                {
                    WriteMcpError(idObj, -32603, ex.Message);
                }
            }
            return 0;
        }

        private static object HandleMcpMethod(string method, Dictionary<string, object> p)
        {
            if (method == "initialize")
            {
                var caps = new Dictionary<string, object>();
                caps["tools"] = new Dictionary<string, object>();
                var info = new Dictionary<string, object>();
                info["name"] = "plcsim-adv-bridge";
                info["version"] = "1.0.0";
                var initRes = new Dictionary<string, object>();
                initRes["protocolVersion"] = "2024-11-05";
                initRes["capabilities"] = caps;
                initRes["serverInfo"] = info;
                return initRes;
            }
            if (method == "ping")
            {
                return new Dictionary<string, object>();
            }
            if (method == "tools/list")
            {
                var res = new Dictionary<string, object>();
                res["tools"] = BuildMcpToolDefinitions();
                return res;
            }
            if (method == "tools/call")
            {
                string toolName = p != null && p.ContainsKey("name") && p["name"] != null ? p["name"].ToString() : string.Empty;
                Dictionary<string, object> args = p != null && p.ContainsKey("arguments") ? p["arguments"] as Dictionary<string, object> : null;
                var opts = ConvertArgsToOpts(args);
                string cliCmd = MapMcpToolToCommand(toolName);
                try
                {
                    object data;
                    lock (ApiSync)
                    {
                        data = DispatchCommand(cliCmd, opts);
                    }
                    var payload = new Dictionary<string, object>();
                    payload["ok"] = true;
                    payload["tool"] = toolName;
                    payload["data"] = data;
                    return MakeMcpTextContent(Json.Serialize(payload), false);
                }
                catch (Exception ex)
                {
                    var errPayload = new Dictionary<string, object>();
                    errPayload["ok"] = false;
                    errPayload["tool"] = toolName;
                    errPayload["error"] = ex.Message;
                    return MakeMcpTextContent(Json.Serialize(errPayload), true);
                }
            }
            throw new InvalidOperationException("Unsupported MCP method: " + method);
        }

        private static Dictionary<string, object> MakeMcpTextContent(string text, bool isError)
        {
            var item = new Dictionary<string, object>();
            item["type"] = "text";
            item["text"] = text;
            var res = new Dictionary<string, object>();
            res["content"] = new object[] { item };
            if (isError) res["isError"] = true;
            return res;
        }

        private static void WriteMcpResult(object id, object result)
        {
            var msg = new Dictionary<string, object>();
            msg["jsonrpc"] = "2.0";
            msg["id"] = id;
            msg["result"] = result;
            Console.Out.WriteLine(Json.Serialize(msg));
            Console.Out.Flush();
        }

        private static void WriteMcpError(object id, int code, string message)
        {
            var err = new Dictionary<string, object>();
            err["code"] = code;
            err["message"] = message ?? "Internal error";
            var msg = new Dictionary<string, object>();
            msg["jsonrpc"] = "2.0";
            msg["id"] = id;
            msg["error"] = err;
            Console.Out.WriteLine(Json.Serialize(msg));
            Console.Out.Flush();
        }

        private static Dictionary<string, string> ConvertArgsToOpts(Dictionary<string, object> args)
        {
            var opts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (args == null) return opts;
            foreach (KeyValuePair<string, object> kv in args)
            {
                if (kv.Value == null) continue;
                string key = kv.Key.Replace("_", "-");
                opts[key] = kv.Value.ToString();
            }
            return opts;
        }

        private static string MapMcpToolToCommand(string toolName)
        {
            switch (toolName)
            {
                case "plcsim_status": return "status";
                case "plcsim_list_instances": return "list";
                case "plcsim_set_network_mode": return "network-mode";
                case "plcsim_create_instance": return "create";
                case "plcsim_power_on": return "power-on";
                case "plcsim_run": return "run";
                case "plcsim_stop": return "stop";
                case "plcsim_memory_reset": return "memory-reset";
                case "plcsim_power_off": return "power-off";
                case "plcsim_set_ip": return "set-ip";
                case "plcsim_cleanup": return "cleanup";
                case "plcsim_read_db": return "s7-read-db";
                case "plcsim_read_tags": return "plcsim-read-tags";
                default: throw new ArgumentException("Unknown MCP tool: " + toolName);
            }
        }

        private static List<Dictionary<string, object>> BuildMcpToolDefinitions()
        {
            var tools = new List<Dictionary<string, object>>();
            tools.Add(McpTool("plcsim_status", "Get PLCSIM Advanced V7.0 runtime status, network mode, interfaces, and registered instances.", new string[0], new string[0]));
            tools.Add(McpTool("plcsim_list_instances", "List all registered PLCSIM Advanced V7.0 virtual PLC instances.", new string[0], new string[0]));
            tools.Add(McpTool("plcsim_set_network_mode", "Get or set PLCSIM Advanced NetworkMode (Softbus, TCPIPSingleAdapter, TCPIPMultipleAdapter).", new string[] { "set", "bind-index" }, new string[0]));
            tools.Add(McpTool("plcsim_create_instance", "Create/register an isolated virtual PLC instance, optionally configure storage/IP, power on, and switch to RUN.", new string[] { "name", "cpu", "storage", "network-mode", "ip", "mask", "gw", "power-on", "run", "timeout" }, new string[] { "name" }));
            tools.Add(McpTool("plcsim_power_on", "Power on a PLCSIM Advanced virtual PLC instance.", new string[] { "name", "timeout" }, new string[] { "name" }));
            tools.Add(McpTool("plcsim_run", "Switch a PLCSIM Advanced virtual PLC instance to RUN mode.", new string[] { "name", "timeout" }, new string[] { "name" }));
            tools.Add(McpTool("plcsim_stop", "Switch a PLCSIM Advanced virtual PLC instance to STOP mode.", new string[] { "name", "timeout" }, new string[] { "name" }));
            tools.Add(McpTool("plcsim_memory_reset", "Memory-reset a PLCSIM Advanced virtual PLC instance.", new string[] { "name", "timeout" }, new string[] { "name" }));
            tools.Add(McpTool("plcsim_power_off", "Power off a PLCSIM Advanced virtual PLC instance.", new string[] { "name", "timeout" }, new string[] { "name" }));
            tools.Add(McpTool("plcsim_set_ip", "Set IPv4 suite (ip, mask, gw) on a PLCSIM Advanced instance.", new string[] { "name", "ip", "mask", "gw", "interface-id", "persistent" }, new string[] { "name", "ip" }));
            tools.Add(McpTool("plcsim_cleanup", "Power off, cleanup storage, and unregister a specific temporary PLCSIM Advanced instance.", new string[] { "name", "delete-storage", "timeout" }, new string[] { "name" }));
            tools.Add(McpTool("plcsim_read_db", "Read raw bytes from an S7 DB over TCP port 102 using Sharp7 (optionally decoding 62-byte DB_TestSummary).", new string[] { "ip", "db", "offset", "size", "rack", "slot", "parse-summary" }, new string[] { "ip", "db" }));
            tools.Add(McpTool("plcsim_read_tags", "Update tag list and read DB/PLC tags via PLCSIM Advanced native Runtime API.", new string[] { "name", "db", "prefix" }, new string[] { "name" }));
            return tools;
        }

        private static Dictionary<string, object> McpTool(string name, string desc, string[] propNames, string[] required)
        {
            var props = new Dictionary<string, object>();
            for (int i = 0; i < propNames.Length; i++)
            {
                var p = new Dictionary<string, object>();
                p["type"] = "string";
                props[propNames[i]] = p;
            }
            var schema = new Dictionary<string, object>();
            schema["type"] = "object";
            schema["properties"] = props;
            schema["required"] = required;

            var tool = new Dictionary<string, object>();
            tool["name"] = name;
            tool["description"] = desc;
            tool["inputSchema"] = schema;
            return tool;
        }

        private static string TryForwardViaPipe(string cmd, Dictionary<string, string> opts, string pipeName, bool startIfMissing)
        {
            string resp = SendPipeRequestOnce(cmd, opts, pipeName, 120);
            if (resp != null) return resp;
            if (!startIfMissing) return null;

            string exePath = Assembly.GetExecutingAssembly().Location;
            var psi = new ProcessStartInfo();
            psi.FileName = exePath;
            psi.Arguments = string.Format("serve --auto-exit --pipe \"{0}\"", pipeName.Replace("\"", ""));
            psi.UseShellExecute = true;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            Process.Start(psi);

            var sw = Stopwatch.StartNew();
            while (sw.ElapsedMilliseconds < 8000)
            {
                Thread.Sleep(150);
                resp = SendPipeRequestOnce(cmd, opts, pipeName, 500);
                if (resp != null) return resp;
            }
            return null;
        }

        private static string SendPipeRequestOnce(string cmd, Dictionary<string, string> opts, string pipeName, int connectTimeoutMs)
        {
            try
            {
                using (var client = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut))
                {
                    client.Connect(connectTimeoutMs);
                    var req = new Dictionary<string, object>();
                    req["cmd"] = cmd;
                    req["opts"] = opts;
                    string line = Json.Serialize(req);
                    var writer = new StreamWriter(client, new UTF8Encoding(false));
                    writer.AutoFlush = true;
                    writer.WriteLine(line);
                    var reader = new StreamReader(client, Encoding.UTF8);
                    return reader.ReadLine();
                }
            }
            catch (TimeoutException)
            {
                return null;
            }
            catch (IOException)
            {
                return null;
            }
        }

        private static int RunPipeDaemon(Dictionary<string, string> opts)
        {
            string pipeName = OptStr(opts, "pipe", DefaultPipeName).Trim();
            bool autoExit = OptBool(opts, "auto-exit", false);

            // Warm SimulationRuntimeManager so COM manager stays alive for the daemon's lifetime
            bool unused = SimulationRuntimeManager.IsInitialized;
            if (!unused) { }

            while (true)
            {
                bool shouldExit = false;
                try
                {
                    using (var server = new NamedPipeServerStream(pipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.None))
                    {
                        server.WaitForConnection();
                        var reader = new StreamReader(server, Encoding.UTF8);
                        var writer = new StreamWriter(server, new UTF8Encoding(false));
                        writer.AutoFlush = true;

                        string line = reader.ReadLine();
                        if (!string.IsNullOrEmpty(line))
                        {
                            Dictionary<string, object> req = Json.Deserialize<Dictionary<string, object>>(line);
                            string cmd = req != null && req.ContainsKey("cmd") && req["cmd"] != null ? req["cmd"].ToString().ToLowerInvariant() : string.Empty;
                            var reqOpts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                            Dictionary<string, object> rawOpts = req != null && req.ContainsKey("opts") ? req["opts"] as Dictionary<string, object> : null;
                            if (rawOpts != null)
                            {
                                foreach (KeyValuePair<string, object> kv in rawOpts)
                                {
                                    if (kv.Value != null) reqOpts[kv.Key] = kv.Value.ToString();
                                }
                            }

                            if (cmd == "daemon-stop")
                            {
                                var stopData = new Dictionary<string, object>();
                                stopData["stopped"] = true;
                                var okResp = new Dictionary<string, object>();
                                okResp["ok"] = true;
                                okResp["command"] = cmd;
                                okResp["data"] = stopData;
                                writer.WriteLine(Json.Serialize(okResp));
                                shouldExit = true;
                            }
                            else
                            {
                                try
                                {
                                    object data;
                                    lock (ApiSync)
                                    {
                                        data = DispatchCommand(cmd, reqOpts);
                                    }
                                    var okResp = new Dictionary<string, object>();
                                    okResp["ok"] = true;
                                    okResp["command"] = cmd;
                                    okResp["data"] = data;
                                    writer.WriteLine(Json.Serialize(okResp));

                                    if (autoExit && (cmd == "cleanup" || cmd == "unregister"))
                                    {
                                        lock (ApiSync)
                                        {
                                            SInstanceInfo[] left = SimulationRuntimeManager.RegisteredInstanceInfo ?? new SInstanceInfo[0];
                                            if (left.Length == 0) shouldExit = true;
                                        }
                                    }
                                }
                                catch (SimulationRuntimeException simEx)
                                {
                                    var errResp = new Dictionary<string, object>();
                                    errResp["ok"] = false;
                                    errResp["command"] = cmd;
                                    errResp["error"] = simEx.Message;
                                    errResp["errorCode"] = simEx.RuntimeErrorCode.ToString();
                                    errResp["numericCode"] = (int)simEx.RuntimeErrorCode;
                                    writer.WriteLine(Json.Serialize(errResp));
                                }
                                catch (BridgeRuntimeException bEx)
                                {
                                    var errResp = new Dictionary<string, object>();
                                    errResp["ok"] = false;
                                    errResp["command"] = cmd;
                                    errResp["error"] = bEx.Message;
                                    errResp["errorCode"] = bEx.ErrorCode;
                                    errResp["numericCode"] = bEx.NumericCode;
                                    writer.WriteLine(Json.Serialize(errResp));
                                }
                                catch (Exception ex)
                                {
                                    var errResp = new Dictionary<string, object>();
                                    errResp["ok"] = false;
                                    errResp["command"] = cmd;
                                    errResp["error"] = ex.Message;
                                    errResp["errorCode"] = ex.GetType().Name;
                                    errResp["numericCode"] = -1;
                                    writer.WriteLine(Json.Serialize(errResp));
                                }
                            }
                        }
                        server.WaitForPipeDrain();
                    }
                }
                catch
                {
                    // Continue serving on transient pipe errors unless asked to exit
                }
                if (shouldExit) break;
            }
            return 0;
        }

        private static void PrintHelp()
        {
            Console.WriteLine("plcsim-adv-bridge — PLCSIM Advanced V7.0 CLI + MCP bridge + S7 DB reader");
            Console.WriteLine("Usage: plcsim-adv-bridge.exe <command> [--key value ...]");
            Console.WriteLine("Commands:");
            Console.WriteLine("  status | list | net-interfaces");
            Console.WriteLine("  network-mode [--set Softbus|TCPIPSingleAdapter|TCPIPMultipleAdapter] [--bind-index N]");
            Console.WriteLine("  create --name N [--cpu CPU1500_Unspecified|CPU1513|CPU1515] [--storage DIR] [--network-mode M] [--ip IP] [--mask M] [--gw GW] [--power-on] [--run]");
            Console.WriteLine("  power-on --name N [--timeout 45000]");
            Console.WriteLine("  run --name N [--timeout 30000]");
            Console.WriteLine("  stop --name N [--timeout 20000]");
            Console.WriteLine("  memory-reset --name N [--timeout 30000]");
            Console.WriteLine("  power-off --name N [--timeout 20000]");
            Console.WriteLine("  set-ip --name N --ip IP [--mask 255.255.255.0] [--gw 0.0.0.0] [--persistent true]");
            Console.WriteLine("  wait-state --name N --state Run|Stop|Off [--timeout 20000]");
            Console.WriteLine("  cleanup --name N [--delete-storage true]");
            Console.WriteLine("  s7-read-db --ip IP --db NUM [--offset 0] [--size 62] [--rack 0] [--slot 1] [--parse-summary]");
            Console.WriteLine("  plcsim-read-tags --name N [--db DB_TestSummary] [--prefix STR]");
            Console.WriteLine("  serve [--pipe NAME] [--auto-exit] | daemon-stop [--pipe NAME]");
            Console.WriteLine("  --mcp                     Run stdio JSON-RPC MCP server");
        }
    }
}
