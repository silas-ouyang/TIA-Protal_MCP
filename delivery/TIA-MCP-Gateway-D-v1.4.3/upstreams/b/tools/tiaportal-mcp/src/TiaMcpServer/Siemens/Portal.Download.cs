using Microsoft.Extensions.Logging;
using Siemens.Engineering;
using Siemens.Engineering.Cax;
using Siemens.Engineering.Compiler;
using Siemens.Engineering.Connection;
using Siemens.Engineering.Download;
using Siemens.Engineering.Download.Configurations;
using Siemens.Engineering.Hmi;
using Siemens.Engineering.Online;
using Siemens.Engineering.Online.Configurations;
using Siemens.Engineering.SW.Alarm;
using Siemens.Engineering.SW.OpcUa;
using Siemens.Engineering.HmiUnified;
using Siemens.Engineering.HW;
using Siemens.Engineering.HW.Features;
using Siemens.Engineering.Multiuser;
using Siemens.Engineering.Safety;
using Siemens.Engineering.SW;
using Siemens.Engineering.SW.Blocks;
using Siemens.Engineering.SW.Types;
using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Security;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Text.Json.Nodes;
using System.Xml.Linq;
using TiaMcpServer.ModelContextProtocol;

namespace TiaMcpServer.Siemens
{
    // Partial: download. Extracted from Portal.cs (god-file split); behavior unchanged.
    public partial class Portal
    {
        #region download

        public ResponseDownload DownloadToPlc(
            string softwarePath,
            bool consistentBlocksOnly = true,
            bool keepActualValues = true,
            bool startAfterDownload = true,
            bool stopBeforeDownload = true,
            string? password = null,
            string? pgPcInterface = null,
            string? targetIpAddress = null,
            bool abortActiveTests = false,
            string downloadMode = "software",
            bool includeHardware = false,
            string? confidentialPassword = null,
            bool allowProtectionDowngrade = false,
            bool acceptUnencryptedSensitiveData = true)
        {
            _logger?.LogInformation(
                "DownloadToPlc: softwarePath={SoftwarePath} consistentOnly={C} keepDB={K} start={S} stop={T} hasPassword={P} hasConfPwd={CP} pgPc={I} targetIp={A} mode={M} includeHw={H}",
                softwarePath, consistentBlocksOnly, keepActualValues, startAfterDownload, stopBeforeDownload, !string.IsNullOrEmpty(password), !string.IsNullOrEmpty(confidentialPassword), pgPcInterface, targetIpAddress, downloadMode, includeHardware);

            var modeResolution = DownloadPromptPolicy.ResolveDownloadMode(downloadMode, includeHardware);
            if (modeResolution.Error != null)
                return new ResponseDownload
                {
                    Ok = false,
                    Message = modeResolution.Error,
                    Errors = new[] { modeResolution.Error }
                };

            DownloadOptions downloadOptions = 0;
            if ((modeResolution.Flags & DownloadOptionFlags.Hardware) != 0) downloadOptions |= DownloadOptions.Hardware;
            if ((modeResolution.Flags & DownloadOptionFlags.Software) != 0) downloadOptions |= DownloadOptions.Software;
            if ((modeResolution.Flags & DownloadOptionFlags.SoftwareOnlyChanges) != 0) downloadOptions |= DownloadOptions.SoftwareOnlyChanges;
            bool includesHardware = (downloadOptions & DownloadOptions.Hardware) != 0;

            if (IsProjectNull())
                return new ResponseDownload { Ok = false, Message = "No project open." };

            var plcSoftware = GetPlcSoftware(softwarePath);
            if (plcSoftware == null)
                return new ResponseDownload { Ok = false, Message = $"PLC software not found: '{softwarePath}'." };

            // Declared outside the try so the catch can report which PG/PC route was used,
            // and which download prompts had been answered before it failed.
            DownloadRouteSelection? routeDiagnostics = null;
            var prompts = new JsonArray();

            try
            {
                var downloadProvider = ResolveDownloadProviderForMode(softwarePath, plcSoftware, includesHardware);
                if (downloadProvider == null)
                    return new ResponseDownload
                    {
                        Ok = false,
                        Message = "DownloadProvider service not available for this PLC. Ensure hardware configuration has network settings."
                    };

                object? configuration = downloadProvider.Configuration;
                if (configuration == null)
                    return new ResponseDownload
                    {
                        Ok = false,
                        Message = "No connection configuration found. Configure the PLC's PROFINET/IP address in hardware configuration first."
                    };

                using var passwordScope = AttachPasswordHandler(configuration, password);
                using var accessSecret = CreateSecureString(password);
                using var masterSecret = CreateSecureString(!string.IsNullOrWhiteSpace(confidentialPassword) ? confidentialPassword : password);

                var promptOptions = new DownloadPromptOptions
                {
                    KeepActualValues = keepActualValues,
                    StartAfterDownload = startAfterDownload,
                    StopBeforeDownload = stopBeforeDownload,
                    ConsistentBlocksOnly = consistentBlocksOnly,
                    AbortActiveTests = abortActiveTests,
                    IncludesHardware = includesHardware,
                    AllowProtectionDowngrade = allowProtectionDowngrade,
                    AcceptUnencryptedSensitiveData = acceptUnencryptedSensitiveData,
                };

                // Both phases get the same answers. The manual's own example answers StartModules in
                // the POST-download delegate ("sets PLC in RUN mode"); this used to be an empty
                // lambda, so startAfterDownload=true could leave the CPU in STOP.
                DownloadConfigurationDelegate preDelegate = config => AnswerDownloadPrompt(config, promptOptions, accessSecret, masterSecret, "pre", prompts);
                DownloadConfigurationDelegate postDelegate = config => AnswerDownloadPrompt(config, promptOptions, accessSecret, masterSecret, "post", prompts);

                // V21 fix: ConnectionConfiguration does NOT implement IConfiguration, but a
                // ConfigurationTargetInterface (Modes -> PcInterfaces -> TargetInterfaces) DOES.
                // Select a target interface (applying its route) and pass THAT to Download();
                // fall back to the raw configuration if no route is selectable.
                string? explicitTargetIp = string.IsNullOrWhiteSpace(targetIpAddress) ? null : targetIpAddress!.Trim();
                string? projectTargetIp = explicitTargetIp ?? TryResolveProjectIpAddress(softwarePath);
                string? effectiveTargetIp = explicitTargetIp ?? projectTargetIp;

                routeDiagnostics = SelectDownloadRoute(configuration, pgPcInterface, effectiveTargetIp);
                if (routeDiagnostics.Error != null && explicitTargetIp == null && projectTargetIp != null)
                {
                    // Implicit project IP should not break V21/Softbus route lookup when no route lists that IP.
                    routeDiagnostics = SelectDownloadRoute(configuration, pgPcInterface, null);
                }
                if (routeDiagnostics.Error != null)
                    return new ResponseDownload
                    {
                        Ok = false,
                        Message = routeDiagnostics.Error,
                        Errors = new[] { routeDiagnostics.Error }
                    };

                promptOptions.IsPlcsimTarget =
                    (!string.IsNullOrWhiteSpace(pgPcInterface) && pgPcInterface!.IndexOf("PLCSIM", StringComparison.OrdinalIgnoreCase) >= 0)
                    || routeDiagnostics.Description.IndexOf("PLCSIM", StringComparison.OrdinalIgnoreCase) >= 0;

                object? downloadConfig = routeDiagnostics.Configuration ?? configuration;
                _logger?.LogInformation("DownloadToPlc: PG/PC route = {Route}", routeDiagnostics.Description);

                // Resolve the 4-arg overload Download(IConfiguration, pre, post, DownloadOptions)
                // and invoke via reflection (the parameter is typed IConfiguration).
                var downloadMethod = downloadProvider.GetType()
                    .GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .FirstOrDefault(m =>
                    {
                        if (m.Name != "Download") return false;
                        var p = m.GetParameters();
                        return p.Length == 4
                            && p[1].ParameterType.Name == "DownloadConfigurationDelegate";
                    });

                if (downloadMethod == null)
                    return new ResponseDownload
                    {
                        Ok = false,
                        Message = "Download(IConfiguration,…) method not found on DownloadProvider. TIA Portal version mismatch?"
                    };

                var rawResult = InvokeV20AwareDownload(
                    downloadProvider,
                    downloadMethod,
                    configuration,
                    downloadConfig!,
                    effectiveTargetIp,
                    preDelegate,
                    postDelegate,
                    downloadOptions,
                    prompts,
                    routeDiagnostics);

                if (rawResult is not DownloadResult result)
                    return new ResponseDownload { Ok = false, Message = "Download returned an unexpected result type." };

                return BuildDownloadResponse(result, softwarePath, routeDiagnostics, prompts, modeResolution.Label);
            }
            catch (Exception ex)
            {
                // The Download call is invoked via reflection, so a real failure arrives wrapped in
                // TargetInvocationException ("调用的目标发生了异常"). Unwrap it so the caller sees the
                // actual reason (connection/route error, not-reachable CPU, etc.).
                var real = ex is System.Reflection.TargetInvocationException tie && tie.InnerException != null
                    ? tie.InnerException : ex;
                _logger?.LogError(real, "DownloadToPlc failed for {SoftwarePath}", softwarePath);

                // A connection failure is usually the wrong PG/PC adapter on a multi-NIC PC, so
                // always show which route was used and what else was available (issue #14).
                var routeHint = routeDiagnostics == null
                    ? string.Empty
                    : $" Route used: {routeDiagnostics.Description}."
                      + (routeDiagnostics.Candidates.Count > 1
                          ? $" Available routes: {DescribeRoutes(routeDiagnostics.Candidates)}."
                            + " Pass pgPcInterface / targetIpAddress to DownloadToPlc to pick one explicitly."
                          : string.Empty);

                return new ResponseDownload
                {
                    Ok = false,
                    Message = $"Download failed: {real.Message}{routeHint}{ActiveTestHint(prompts)}",
                    Errors = new[] { real.Message },
                    Meta = new JsonObject
                    {
                        ["softwarePath"] = softwarePath,
                        ["downloadOptions"] = modeResolution.Label,
                        ["downloadPrompts"] = prompts.DeepClone()
                    }
                };
            }
        }

        private DownloadProvider? ResolveDownloadProviderForMode(string softwarePath, PlcSoftware plcSoftware, bool includesHardware)
        {
            if (!includesHardware)
                return ResolvePlcService<DownloadProvider>(softwarePath, plcSoftware);

            DownloadProvider? fallback = null;
            var sc = GetSoftwareContainer(softwarePath);
            var di = sc?.Parent as DeviceItem;
            while (di != null)
            {
                var p = di.GetService<DownloadProvider>();
                if (p != null)
                {
                    if (p.Configuration != null) return p;
                    fallback ??= p;
                }
                di = di.Parent as DeviceItem;
            }

            var swProvider = plcSoftware.GetService<DownloadProvider>();
            if (swProvider != null && swProvider.Configuration != null) return swProvider;
            return fallback ?? swProvider;
        }

        /// <summary>Answers one download prompt per <see cref="DownloadPromptPolicy"/> and records what
        /// was asked and what was answered, so the caller can see why a download stopped.</summary>
        private void AnswerDownloadPrompt(
            DownloadConfiguration config,
            DownloadPromptOptions options,
            SecureString? accessSecret,
            SecureString? masterSecret,
            string phase,
            JsonArray log)
        {
            var typeName = config.GetType().Name;
            string? error = null;
            bool applied = false;
            string answerLabel;
            string why;

            if (config is DownloadPasswordConfiguration pwdCfg)
            {
                var secret = config is PlcMasterSecretPassword
                    ? (masterSecret ?? accessSecret)
                    : (accessSecret ?? masterSecret);

                if (secret != null)
                {
                    try
                    {
                        pwdCfg.SetPassword(secret);
                        applied = true;
                        answerLabel = "(password supplied)";
                        why = config is PlcMasterSecretPassword
                            ? "supplied confidential master secret password"
                            : "supplied download access password";
                    }
                    catch (Exception ex)
                    {
                        error = (ex.InnerException ?? ex).Message;
                        answerLabel = "(password failed)";
                        why = "SetPassword threw: " + error;
                    }
                }
                else
                {
                    answerLabel = "(missing password)";
                    why = "DownloadPasswordConfiguration requested a password, but none was supplied";
                }
            }
            else
            {
                var decision = DownloadPromptPolicy.Decide(typeName, options);
                if (decision.Selection != null)
                    applied = DownloadConfigSetSelection(config, decision.Selection, out error);
                else if (decision.Checked != null)
                    applied = DownloadConfigSetChecked(config, decision.Checked.Value, out error);

                answerLabel = decision.Selection ?? (decision.Checked.HasValue ? (decision.Checked.Value ? "Checked" : "Unchecked") : "(unanswered)");
                why = decision.Why;
            }

            string message = "";
            try { message = config.GetType().GetProperty("Message")?.GetValue(config) as string ?? ""; }
            catch { }

            _logger?.LogDebug("Download prompt ({Phase}) {Type}: {Answer} applied={Applied}", phase, typeName, answerLabel, applied);
            var entry = new JsonObject
            {
                ["phase"] = phase,
                ["type"] = typeName,
                ["message"] = message,
                ["answer"] = answerLabel,
                ["applied"] = applied,
                ["why"] = why,
            };
            if (error != null) entry["error"] = error;
            lock (log) log.Add(entry);
        }

        /// <summary>When the download stopped because active tests were left alone, say how to proceed.</summary>
        private static string ActiveTestHint(JsonArray prompts)
        {
            foreach (var p in prompts)
            {
                var type = p?["type"]?.GetValue<string>() ?? "";
                var answer = p?["answer"]?.GetValue<string>() ?? "";
                if ((type == "ActiveTestCanBeAborted" || type == "ActiveTestCanPreventDownload") && answer == "NoAction")
                    return " Test or commissioning functions are active on the CPU and were NOT cancelled. "
                         + "Confirm with the user that nobody is using them, then retry with abortActiveTests=true.";
            }
            return "";
        }

        // ---- PG/PC route selection (issue #14) --------------------------------------------------
        // V21: ConnectionConfiguration.ApplyConfiguration(ConfigurationTargetInterface) returns a
        // bool (whether the online route applied) — it does NOT return the IConfiguration. The
        // ConfigurationTargetInterface itself IS an IConfiguration (verified against the V21
        // PublicAPI), so we hand the target to Download().
        //
        // The route tree is Modes -> PcInterfaces -> TargetInterfaces. Picking the FIRST applicable
        // target was enough on a single-NIC PC, but on a multi-NIC PC (WLAN + VPN + PLCSIM virtual
        // adapter) TIA enumerates the wrong adapter first and ApplyConfiguration "succeeds" on it
        // too — it does not verify reachability. The download then leaves through an adapter that
        // cannot see the CPU and fails with "connection to the target module cannot be established".
        // So: enumerate every route, rank by IP proximity to the CPU, and apply the best one.

        // One flattened Modes -> PcInterfaces -> TargetInterfaces route, with the addresses on both
        // ends so the adapter facing the CPU can be identified (and reported back to the caller).
        private sealed class DownloadRoute
        {
            public object Target = null!;
            public string ModeName = string.Empty;
            public string PcInterfaceName = string.Empty;
            public int PcInterfaceNumber;
            public List<string> PcAddresses = new List<string>();
            public string TargetName = string.Empty;
            public List<string> TargetAddresses = new List<string>();
            public int Score;

            public string Describe() =>
                $"{ModeName} / {PcInterfaceName}"
                + (PcAddresses.Count > 0 ? $" [{string.Join(", ", PcAddresses)}]" : " [no IP]")
                + $" -> {TargetName}"
                + (TargetAddresses.Count > 0 ? $" [{string.Join(", ", TargetAddresses)}]" : string.Empty);
        }

        private sealed class DownloadRouteSelection
        {
            public object? Configuration;   // what to hand to Download(); null = fall back to the raw configuration
            public string Description = "(no route selected — raw connection configuration)";
            public string? Error;           // set when an explicit pgPcInterface/targetIpAddress filter matched nothing
            public bool Applied;            // ApplyConfiguration accepted the chosen route (false = best guess only)
            public List<DownloadRoute> Candidates = new List<DownloadRoute>();
        }

        private static List<DownloadRoute> EnumerateDownloadRoutes(object? connectionConfiguration)
        {
            var routes = new List<DownloadRoute>();
            if (connectionConfiguration == null) return routes;
            foreach (var mode in EnumerateReflectedProperty(connectionConfiguration, "Modes"))
                foreach (var pcInterface in EnumerateReflectedProperty(mode, "PcInterfaces"))
                    foreach (var target in EnumerateReflectedProperty(pcInterface, "TargetInterfaces"))
                    {
                        if (target == null) continue;
                        routes.Add(new DownloadRoute
                        {
                            Target = target,
                            ModeName = ReadReflectedString(mode, "Name"),
                            PcInterfaceName = ReadReflectedString(pcInterface, "Name"),
                            PcInterfaceNumber = ReadReflectedInt(pcInterface, "Number"),
                            PcAddresses = ReadConfigurationAddresses(pcInterface),
                            TargetName = ReadReflectedString(target, "Name"),
                            TargetAddresses = ReadConfigurationAddresses(target)
                        });
                    }
            return routes;
        }

        private static string ReadReflectedString(object? owner, string propertyName)
        {
            try { return owner?.GetType().GetProperty(propertyName)?.GetValue(owner)?.ToString() ?? string.Empty; }
            catch { return string.Empty; }
        }

        private static int ReadReflectedInt(object? owner, string propertyName)
        {
            try { return owner?.GetType().GetProperty(propertyName)?.GetValue(owner) is int number ? number : 0; }
            catch { return 0; }
        }

        // ConfigurationPcInterface.Addresses = the PG/PC adapter's own IPs.
        // ConfigurationTargetInterface.Addresses = the CPU interface's IPs.
        // Both are ConfigurationAddress compositions whose Address property holds the IP string.
        private static List<string> ReadConfigurationAddresses(object? owner)
        {
            var addresses = new List<string>();
            foreach (var address in EnumerateReflectedProperty(owner, "Addresses"))
            {
                var value = ReadReflectedString(address, "Address");
                if (!string.IsNullOrWhiteSpace(value)) addresses.Add(value);
            }
            return addresses;
        }

        // Rough "can these two adapters see each other" test. ConfigurationAddress exposes only the
        // address, never the mask, so /24 is an assumption — it holds for the usual 192.168.x.y /
        // 10.x.y.z engineering subnets, and it is only ever used to RANK candidates, never to reject
        // a download outright.
        private static bool SameIpv4Subnet24(string a, string b)
        {
            var left = a.Split('.');
            var right = b.Split('.');
            if (left.Length != 4 || right.Length != 4) return false;
            return left[0] == right[0] && left[1] == right[1] && left[2] == right[2];
        }

        private static void ScoreDownloadRoutes(List<DownloadRoute> routes, string? preferredTargetIp)
        {
            foreach (var route in routes)
            {
                var score = 0;
                if (!string.IsNullOrWhiteSpace(preferredTargetIp))
                {
                    if (route.TargetAddresses.Any(t => string.Equals(t, preferredTargetIp, StringComparison.OrdinalIgnoreCase)))
                        score += 8;
                    if (route.PcAddresses.Any(p => SameIpv4Subnet24(p, preferredTargetIp!)))
                        score += 4;
                }
                // No explicit target IP: the CPU address on the route itself is the reference point.
                // Prefer the adapter sitting in the same subnet as the CPU it has to reach — that is
                // exactly what separates the PLCSIM virtual adapter from a WLAN/VPN adapter.
                if (route.PcAddresses.Any(p => route.TargetAddresses.Any(t => SameIpv4Subnet24(p, t))))
                    score += 2;
                route.Score = score;
            }
        }

        private static string DescribeRoutes(IEnumerable<DownloadRoute> routes)
            => string.Join(" | ", routes.Select(r => r.Describe()));

        // Returns the IConfiguration to pass to Download(), or a selection carrying an Error when an
        // explicit filter matched nothing. Configuration stays null when no route exists at all —
        // the caller then falls back to the raw connection configuration (old behaviour).
        private static DownloadRouteSelection SelectDownloadRoute(
            object? connectionConfiguration,
            string? pgPcInterface,
            string? targetIpAddress)
        {
            var selection = new DownloadRouteSelection();
            if (connectionConfiguration == null) return selection;

            try
            {
                selection.Candidates = EnumerateDownloadRoutes(connectionConfiguration);
                if (selection.Candidates.Count == 0) return selection;

                var pool = selection.Candidates;

                if (!string.IsNullOrWhiteSpace(pgPcInterface))
                {
                    var byName = pool
                        .Where(r => r.PcInterfaceName.IndexOf(pgPcInterface, StringComparison.OrdinalIgnoreCase) >= 0)
                        .ToList();
                    if (byName.Count == 0)
                    {
                        selection.Error =
                            $"No PG/PC interface matches '{pgPcInterface}'. Available routes: {DescribeRoutes(pool)}";
                        return selection;
                    }
                    pool = byName;
                }

                List<HostNicInfo>? hostNics = null;
                if (!string.IsNullOrWhiteSpace(targetIpAddress))
                {
                    var byIp = pool
                        .Where(r => r.TargetAddresses.Any(t => string.Equals(t, targetIpAddress, StringComparison.OrdinalIgnoreCase)))
                        .ToList();
                    if (byIp.Count > 0)
                    {
                        pool = byIp;
                    }
                    else
                    {
                        // TIA V15-V20 leaves TargetAddresses empty on ConfigurationTargetInterface until
                        // a ConfigurationAddress is resolved/created or V21 pre-populates them.
                        hostNics = DownloadRoutePolicy.ReadHostIPv4Nics();
                        bool allPoolUnpopulated = pool.All(r => r.TargetAddresses.Count == 0);
                        var unpopulated = pool.Where(r => r.TargetAddresses.Count == 0).ToList();
                        var unpopulatedNames = unpopulated.Select(u => u.PcInterfaceName).ToList();
                        if (DownloadRoutePolicy.ShouldKeepUnpopulatedFallback(allPoolUnpopulated, unpopulatedNames, targetIpAddress, hostNics))
                        {
                            pool = unpopulated;
                        }
                        else
                        {
                            selection.Error =
                                $"No download route reaches target IP '{targetIpAddress}'. Available routes: {DescribeRoutes(pool)}";
                            return selection;
                        }
                    }
                }

                ScoreDownloadRoutes(pool, targetIpAddress);
                if (!string.IsNullOrWhiteSpace(targetIpAddress))
                {
                    hostNics ??= DownloadRoutePolicy.ReadHostIPv4Nics();
                    foreach (var route in pool)
                    {
                        route.Score += DownloadRoutePolicy.ComputeHostNicSubnetScore(route.PcInterfaceName, targetIpAddress, hostNics);
                        route.Score += ScoreSubnetOrPcAddresses(route.Target, targetIpAddress!);
                    }
                }

                var applyAddrMethod = connectionConfiguration.GetType()
                    .GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .FirstOrDefault(m => m.Name == "ApplyConfiguration"
                        && m.GetParameters().Length == 1
                        && m.GetParameters()[0].ParameterType.Name == "ConfigurationAddress");

                var applyMethod = connectionConfiguration.GetType()
                    .GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .FirstOrDefault(m => m.Name == "ApplyConfiguration"
                        && m.GetParameters().Length == 1
                        && m.GetParameters()[0].ParameterType.Name == "ConfigurationTargetInterface");

                // OrderByDescending is a stable sort, so equal scores keep the original enumeration
                // order — i.e. the old first-wins behaviour whenever nothing distinguishes adapters.
                var ranked = pool.OrderByDescending(r => r.Score).ToList();

                foreach (var route in ranked)
                {
                    if (!string.IsNullOrWhiteSpace(targetIpAddress)
                        && !IsPlcsimSoftbusRoute(route.Target)
                        && applyAddrMethod != null)
                    {
                        try
                        {
                            var addr = TryResolveOrCreateConfigurationAddress(route.Target, targetIpAddress!);
                            if (addr != null && applyAddrMethod.Invoke(connectionConfiguration, new object[] { addr }) is bool addrOk && addrOk)
                            {
                                selection.Configuration = route.Target;
                                selection.Description = $"{route.Describe()} [addr={targetIpAddress}]";
                                selection.Applied = true;
                                return selection;
                            }
                        }
                        catch { }
                    }

                    try
                    {
                        if (applyMethod?.Invoke(connectionConfiguration, new[] { route.Target }) is bool ok && ok)
                        {
                            selection.Configuration = route.Target;
                            selection.Description = route.Describe();
                            selection.Applied = true;
                            return selection;
                        }
                    }
                    catch { }
                }

                // Nothing applied cleanly — hand back the best-ranked target anyway (it IS an
                // IConfiguration). Mirrors the previous fallback to the first target.
                selection.Configuration = ranked[0].Target;
                selection.Description = ranked[0].Describe() + " (not confirmed by ApplyConfiguration)";
                return selection;
            }
            catch { }
            return selection;
        }

        private string? TryResolveProjectIpAddress(string softwarePath)
        {
            if (string.IsNullOrWhiteSpace(softwarePath))
                return null;

            try
            {
                var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var candidates = new List<string> { softwarePath.Trim() };
                int slash = softwarePath.IndexOf('/');
                if (slash > 0)
                    candidates.Add(softwarePath.Substring(0, slash).Trim());

                foreach (var candidate in candidates)
                {
                    if (!visited.Add(candidate)) continue;
                    var ipObj = GetDeviceIpAddress(candidate);
                    var found = ipObj["found"]?.GetValue<bool>() ?? false;
                    var ip = ipObj["ipAddress"]?.GetValue<string>();
                    if (found && !string.IsNullOrWhiteSpace(ip))
                        return ip!.Trim();
                }
            }
            catch { }
            return null;
        }

        private static bool IsPlcsimSoftbusRoute(object? targetObj)
        {
            try
            {
                var pc = (targetObj as ConfigurationTargetInterface)?.Parent as ConfigurationPcInterface;
                var mode = pc?.Parent as ConfigurationMode;
                return string.Equals(mode?.Name, "PLCSIM", StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        private static int ScoreSubnetOrPcAddresses(object? targetObj, string targetIp)
        {
            try
            {
                if ((targetObj as ConfigurationTargetInterface)?.Parent is not ConfigurationPcInterface pcIface)
                    return 0;

                foreach (var a in ReadConfigurationAddresses(pcIface))
                {
                    if (string.Equals(a, targetIp, StringComparison.OrdinalIgnoreCase))
                        return 120;
                }

                foreach (ConfigurationSubnet subnet in pcIface.Subnets)
                {
                    foreach (var a in ReadConfigurationAddresses(subnet))
                    {
                        if (string.Equals(a, targetIp, StringComparison.OrdinalIgnoreCase))
                            return 100;
                    }
                }
            }
            catch { }
            return 0;
        }

        private static ConfigurationAddress? TryFindOrCreateAddressInComposition(
            ConfigurationAddressComposition? composition,
            string targetIp,
            bool allowCreate = true)
        {
            if (composition == null || string.IsNullOrWhiteSpace(targetIp))
                return null;

            try
            {
                foreach (ConfigurationAddress addr in composition)
                {
                    if (string.Equals(addr.Address, targetIp, StringComparison.OrdinalIgnoreCase)
                        || string.Equals(addr.Name, targetIp, StringComparison.OrdinalIgnoreCase))
                        return addr;
                }
            }
            catch { }

            try
            {
                var existing = composition.Find(targetIp);
                if (existing != null)
                    return existing;
            }
            catch { }

            if (!allowCreate)
                return null;

            try
            {
                return composition.Create(targetIp);
            }
            catch
            {
                return null;
            }
        }

        private static ConfigurationAddress? TryResolveOrCreateConfigurationAddress(object? targetObj, string targetIp)
        {
            if (targetObj is not ConfigurationTargetInterface targetIface || string.IsNullOrWhiteSpace(targetIp))
                return null;

            var direct = TryFindOrCreateAddressInComposition(targetIface.Addresses, targetIp, allowCreate: true);
            if (direct != null)
                return direct;

            if (targetIface.Parent is ConfigurationPcInterface pcIface)
            {
                var onPc = TryFindOrCreateAddressInComposition(pcIface.Addresses, targetIp, allowCreate: false);
                if (onPc != null)
                    return onPc;

                try
                {
                    foreach (ConfigurationSubnet subnet in pcIface.Subnets)
                    {
                        var onSubnet = TryFindOrCreateAddressInComposition(subnet.Addresses, targetIp, allowCreate: false);
                        if (onSubnet != null)
                            return onSubnet;
                    }
                }
                catch { }
            }

            return null;
        }

        private static void TryReapplyConfiguration(object? connectionConfiguration, object? targetOrAddress)
        {
            if (connectionConfiguration == null || targetOrAddress == null)
                return;

            try
            {
                var method = connectionConfiguration.GetType()
                    .GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .FirstOrDefault(m => m.Name == "ApplyConfiguration"
                        && m.GetParameters().Length == 1
                        && m.GetParameters()[0].ParameterType.IsInstanceOfType(targetOrAddress));
                method?.Invoke(connectionConfiguration, new[] { targetOrAddress });
            }
            catch { }
        }

        private static ConfigurationAccessibleDevice? TryFindAccessibleDevice(object? targetObj, string targetIp)
        {
            try
            {
                if ((targetObj as ConfigurationTargetInterface)?.Parent is not ConfigurationPcInterface pcIface)
                    return null;

                var devices = pcIface.GetAccessibleDevices();
                if (devices == null)
                    return null;

                foreach (var dev in devices)
                {
                    if (string.Equals(dev.Address?.Trim(), targetIp.Trim(), StringComparison.OrdinalIgnoreCase))
                        return dev;
                }
            }
            catch { }
            return null;
        }

        private object? InvokeV20AwareDownload(
            object downloadProvider,
            MethodInfo download4Method,
            object? connectionConfiguration,
            object downloadConfig,
            string? effectiveTargetIp,
            DownloadConfigurationDelegate preDelegate,
            DownloadConfigurationDelegate postDelegate,
            DownloadOptions downloadOptions,
            JsonArray prompts,
            DownloadRouteSelection routeDiagnostics)
        {
            var download5Method = downloadProvider.GetType()
                .GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .FirstOrDefault(m =>
                {
                    if (m.Name != "Download") return false;
                    var p = m.GetParameters();
                    return p.Length == 5
                        && p[1].ParameterType.Name == "ConfigurationAddress"
                        && p[2].ParameterType.Name == "DownloadConfigurationDelegate";
                });

            bool softbus = IsPlcsimSoftbusRoute(downloadConfig);
            ConfigurationAddress? targetAddr = (!softbus && !string.IsNullOrWhiteSpace(effectiveTargetIp))
                ? TryResolveOrCreateConfigurationAddress(downloadConfig, effectiveTargetIp!)
                : null;

            bool prefer5Arg = download5Method != null && targetAddr != null && !softbus;

            object? InvokePrimary() => prefer5Arg
                ? download5Method!.Invoke(downloadProvider, new[] { downloadConfig, (object)targetAddr!, preDelegate, postDelegate, downloadOptions })
                : download4Method.Invoke(downloadProvider, new[] { downloadConfig, preDelegate, postDelegate, downloadOptions });

            var attemptErrors = new List<string>();
            Exception? lastException = null;

            Exception Unwrap(Exception ex) =>
                ex is TargetInvocationException tie && tie.InnerException != null ? tie.InnerException : ex;

            object? TryAttempt(string label, Func<object?> call, out bool stoppedAfterPrompts)
            {
                stoppedAfterPrompts = false;
                try
                {
                    var res = call();
                    if (!string.IsNullOrEmpty(label) && !routeDiagnostics.Description.Contains(label))
                        routeDiagnostics.Description += $" [{label}]";
                    return res;
                }
                catch (Exception ex)
                {
                    var inner = Unwrap(ex);
                    lastException = inner;
                    attemptErrors.Add($"{label}: {inner.Message}");
                    if (!DownloadPromptPolicy.ShouldRetryConnectionBeforePrompts(prompts.Count, inner))
                        stoppedAfterPrompts = true;
                    return null;
                }
            }

            bool stop;
            var primaryRes = TryAttempt(prefer5Arg ? "5arg-ip" : "4arg", InvokePrimary, out stop);
            if (primaryRes != null || stop)
            {
                if (primaryRes != null) return primaryRes;
                throw lastException!;
            }

            if (TryEnableLegacyCommunication(connectionConfiguration))
            {
                TryReapplyConfiguration(connectionConfiguration, downloadConfig);
                var legacyRes = TryAttempt(prefer5Arg ? "5arg-ip,legacy" : "4arg,legacy", InvokePrimary, out stop);
                if (legacyRes != null || stop)
                {
                    if (legacyRes != null) return legacyRes;
                    throw lastException!;
                }
            }

            if (prefer5Arg)
            {
                TryReapplyConfiguration(connectionConfiguration, downloadConfig);
                var res4Config = TryAttempt("4arg-targetIface", () =>
                    download4Method.Invoke(downloadProvider, new[] { downloadConfig, preDelegate, postDelegate, downloadOptions }), out stop);
                if (res4Config != null || stop)
                {
                    if (res4Config != null) return res4Config;
                    throw lastException!;
                }
            }

            // Note: Do NOT fall back to Download(targetAddr, ...) or Download(accessibleDevice, ...).
            // In TIA Openness V20, ConfigurationAddressWrapper and AccessibleDeviceWrapper return null
            // from get_ConnectionPoint(), causing OnlineAccessPathDlc.ApplyOnlineSettings to throw
            // ArgumentNullException("connectionPoint"), crash Siemens.Automation.Portal.exe, and mask
            // the real pre-prompt error from Attempt 1 / 4arg-targetIface.
            if (lastException != null) throw lastException!;

            throw new InvalidOperationException(
                $"{lastException?.Message ?? "Download failed"} (attempts: {string.Join("; ", attemptErrors)})",
                lastException);
        }

        // Read a property by name and materialize it as a sequence (Openness compositions are
        // IEnumerable). Materialized inside try/catch so a throwing enumerator can't escape.
        private static List<object?> EnumerateReflectedProperty(object? owner, string propertyName)
        {
            var items = new List<object?>();
            try
            {
                var value = owner?.GetType().GetProperty(propertyName)?.GetValue(owner);
                if (value is System.Collections.IEnumerable en)
                    foreach (var item in en) items.Add(item);
            }
            catch { }
            return items;
        }

        public ResponseCheckDownload CheckDownloadReadiness(string softwarePath)
        {
            var issues = new List<string>();

            if (IsProjectNull())
                return new ResponseCheckDownload { Ready = false, Issues = new[] { "No project open." } };

            var plcSoftware = GetPlcSoftware(softwarePath);
            if (plcSoftware == null)
                return new ResponseCheckDownload { Ready = false, Issues = new[] { $"PLC software not found: '{softwarePath}'." } };

            bool hasProvider = false;
            bool hasConfig = false;
            bool isConsistent = false;
            var routes = new List<DownloadRoute>();

            try
            {
                var provider = ResolvePlcService<DownloadProvider>(softwarePath, plcSoftware);
                hasProvider = provider != null;
                if (!hasProvider)
                    issues.Add("DownloadProvider service not available. Check hardware/network configuration.");
                else
                {
                    hasConfig = provider!.Configuration != null;
                    if (!hasConfig)
                        issues.Add("No network configuration for this PLC. Set the IP address in hardware configuration.");
                    else
                        // Read-only: enumerate the PG/PC routes WITHOUT applying any of them, so a
                        // multi-NIC PC can be diagnosed before touching the CPU (issue #14).
                        routes = EnumerateDownloadRoutes(provider.Configuration);
                }
            }
            catch (Exception ex)
            {
                issues.Add($"Error accessing DownloadProvider: {ex.Message}");
            }

            // Compile consistency, measured: read PlcBlock/PlcType.IsConsistent (documented in the
            // Openness manual) for everything in the program. This used to be hard-coded to true,
            // so an uncompiled program was reported ready for download.
            try
            {
                var blocks = new List<PlcBlock>();
                GetBlocksRecursive(plcSoftware.BlockGroup, blocks);
                var types = new List<PlcType>();
                GetTypesRecursive(plcSoftware.TypeGroup, types);

                var inconsistent = new List<string>();
                foreach (var b in blocks)
                {
                    bool ok;
                    try { ok = b.IsConsistent; } catch { ok = false; }
                    if (!ok) inconsistent.Add(b.Name);
                }
                foreach (var t in types)
                {
                    bool ok;
                    try { ok = t.IsConsistent; } catch { ok = false; }
                    if (!ok) inconsistent.Add(t.Name + " (type)");
                }

                isConsistent = inconsistent.Count == 0;
                if (!isConsistent)
                    issues.Add($"{inconsistent.Count} block(s)/type(s) are not compiled (IsConsistent=false): "
                        + string.Join(", ", inconsistent.Take(20)) + (inconsistent.Count > 20 ? ", ..." : "")
                        + ". Run CompileSoftware first.");
            }
            catch (Exception ex)
            {
                isConsistent = false;
                issues.Add($"Could not read block consistency ({ex.Message}); compile before downloading.");
            }

            ScoreDownloadRoutes(routes, null);
            var routesJson = new JsonArray();
            foreach (var route in routes.OrderByDescending(r => r.Score))
                routesJson.Add(new JsonObject
                {
                    ["mode"] = route.ModeName,
                    ["pgPcInterface"] = route.PcInterfaceName,
                    ["pgPcInterfaceNumber"] = route.PcInterfaceNumber,
                    ["pgPcAddresses"] = string.Join(", ", route.PcAddresses),
                    ["targetInterface"] = route.TargetName,
                    ["targetAddresses"] = string.Join(", ", route.TargetAddresses),
                    ["preferred"] = route.Score > 0
                });

            bool ready = hasProvider && hasConfig && issues.Count == 0;
            return new ResponseCheckDownload
            {
                Ready = ready,
                HasDownloadProvider = hasProvider,
                HasConfiguration = hasConfig,
                IsConsistent = isConsistent,
                Message = ready
                    ? $"PLC '{softwarePath}' is ready for download."
                    : $"PLC '{softwarePath}' has {issues.Count} readiness issue(s).",
                Issues = issues.Count > 0 ? issues.ToArray() : null,
                Meta = new JsonObject
                {
                    ["downloadRouteCount"] = routes.Count,
                    // Ordered best-first — the same ranking DownloadToPlc applies. preferred=true
                    // means the PG/PC adapter shares an IPv4 /24 with the CPU it has to reach.
                    ["downloadRoutes"] = routesJson,
                    ["note"] = "Override the automatic pick with DownloadToPlc(pgPcInterface:…) or DownloadToPlc(targetIpAddress:…)."
                }
            };
        }

        /// <summary>Sets CurrentSelection by enum member name. False (with the reason) when the
        /// configuration has no such property or the name is not one of its values. This used to be
        /// swallowed, which left the prompt unanswered and the download failing for no stated reason.</summary>
        private static bool DownloadConfigSetSelection(object config, string selectionName, out string? error)
        {
            error = null;
            try
            {
                var prop = config.GetType().GetProperty("CurrentSelection");
                if (prop == null) { error = "no CurrentSelection property"; return false; }
                var enumType = prop.PropertyType;
                if (!enumType.IsEnum) { error = "CurrentSelection is not an enum"; return false; }
                if (!Enum.GetNames(enumType).Any(n => string.Equals(n, selectionName, StringComparison.OrdinalIgnoreCase)))
                {
                    error = $"'{selectionName}' is not a {enumType.Name} value (valid: {string.Join(", ", Enum.GetNames(enumType))})";
                    return false;
                }
                prop.SetValue(config, Enum.Parse(enumType, selectionName, ignoreCase: true));
                return true;
            }
            catch (Exception ex)
            {
                error = (ex.InnerException ?? ex).Message;
                return false;
            }
        }

        private static bool DownloadConfigSetChecked(object config, bool value, out string? error)
        {
            error = null;
            try
            {
                var prop = config.GetType().GetProperty("Checked");
                if (prop == null) { error = "no Checked property"; return false; }
                prop.SetValue(config, value);
                return true;
            }
            catch (Exception ex)
            {
                error = (ex.InnerException ?? ex).Message;
                return false;
            }
        }

        private ResponseDownload BuildDownloadResponse(
            DownloadResult result,
            string softwarePath,
            DownloadRouteSelection? route,
            JsonArray prompts,
            string downloadOptionsLabel)
        {
            var errors = new List<string>();
            var warnings = new List<string>();
            CollectDownloadMessages(result.Messages, errors, warnings);

            bool ok = result.State == DownloadResultState.Success
                   || result.State == DownloadResultState.Information
                   || result.State == DownloadResultState.Warning;

            // DifferentTargetConfiguration is still accepted automatically. When TIA asked it, the
            // CPU at that address does not match the configured hardware (a wrong IP reaches another
            // machine's CPU the same way), so a success must not stay silent about it.
            string targetNote = "";
            foreach (var p in prompts)
                if (p?["type"]?.GetValue<string>() == "DifferentTargetConfiguration" && p?["answer"]?.GetValue<string>() == "AcceptAll")
                {
                    targetNote = " TIA reported that the online modules differ from the configured hardware and the download went ahead"
                               + " (Meta.downloadPrompts) - confirm with the user that this was the intended CPU.";
                    warnings.Add(targetNote.Trim());
                    break;
                }

            return new ResponseDownload
            {
                Ok = ok,
                Message = $"Download ({downloadOptionsLabel}) {result.State}: {result.ErrorCount} error(s), {result.WarningCount} warning(s)."
                          + targetNote
                          + (ok ? "" : ActiveTestHint(prompts)),
                State = result.State.ToString(),
                ErrorCount = result.ErrorCount,
                WarningCount = result.WarningCount,
                Errors = errors.Count > 0 ? errors.ToArray() : null,
                Warnings = warnings.Count > 0 ? warnings.ToArray() : null,
                Meta = new JsonObject
                {
                    ["softwarePath"] = softwarePath,
                    ["downloadOptions"] = downloadOptionsLabel,
                    ["timestamp"] = DateTime.Now,
                    ["downloadState"] = result.State.ToString(),
                    // Which PG/PC adapter the download actually left through — the thing you need
                    // to see first when a multi-NIC PC downloads "successfully" to the wrong place.
                    ["pgPcRoute"] = route?.Description ?? string.Empty,
                    ["pgPcRouteCandidates"] = route?.Candidates.Count ?? 0,
                    // Every question TIA asked and how it was answered: the only way to see that a
                    // download stopped because, say, a commissioning session was left running.
                    ["downloadPrompts"] = prompts.DeepClone()
                }
            };
        }

        private static void CollectDownloadMessages(
            IEnumerable? messages,
            List<string> errors,
            List<string> warnings)
        {
            if (messages == null) return;
            foreach (var obj in messages)
            {
                if (obj == null) continue;
                try
                {
                    var msgText = obj.GetType().GetProperty("Message")?.GetValue(obj) as string ?? string.Empty;
                    var stateObj = obj.GetType().GetProperty("State")?.GetValue(obj);
                    var stateName = stateObj?.ToString() ?? string.Empty;

                    if (stateName == "Error" && !string.IsNullOrWhiteSpace(msgText))
                        errors.Add(msgText);
                    else if (stateName == "Warning" && !string.IsNullOrWhiteSpace(msgText))
                        warnings.Add(msgText);

                    // Recurse into nested Messages
                    var nested = obj.GetType().GetProperty("Messages")?.GetValue(obj) as IEnumerable;
                    if (nested != null)
                        CollectDownloadMessages(nested, errors, warnings);
                }
                catch { }
            }
        }

        #endregion
    }
}
