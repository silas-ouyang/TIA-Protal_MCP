using System;
using System.Collections.Generic;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace TiaMcpServer.Siemens
{
    /// <summary>How DownloadToPlc was asked to answer the download dialog's questions.</summary>
    public sealed class DownloadPromptOptions
    {
        public bool KeepActualValues { get; set; } = true;
        public bool StartAfterDownload { get; set; } = true;
        public bool StopBeforeDownload { get; set; } = true;
        public bool ConsistentBlocksOnly { get; set; } = true;
        /// <summary>Accept cancelling active test and commissioning functions (a running trace,
        /// a forced value, a commissioning session) so the download can go ahead.</summary>
        public bool AbortActiveTests { get; set; }
        /// <summary>True when Hardware is included in DownloadOptions (allows OverwriteSystemData / ExpandDownload).</summary>
        public bool IncludesHardware { get; set; }
        /// <summary>True when downloading to a PLCSIM / PLCSIM Advanced route.</summary>
        public bool IsPlcsimTarget { get; set; }
        /// <summary>Opt-in: allow downloading when CPU protection level decreases (ContinueDownloading).</summary>
        public bool AllowProtectionDowngrade { get; set; }
        /// <summary>Opt-in: accept downloading unencrypted sensitive configuration data when no master secret is configured.</summary>
        public bool AcceptUnencryptedSensitiveData { get; set; }
    }

    /// <summary>
    /// Version-neutral mirror of Siemens.Engineering.Download.DownloadOptions so mode parsing
    /// stays covered by offline unit tests without referencing Siemens.Engineering.dll.
    /// </summary>
    [Flags]
    public enum DownloadOptionFlags
    {
        None = 0,
        Hardware = 1,
        Software = 2,
        SoftwareOnlyChanges = 4,
    }

    /// <summary>Parsed DownloadOptions bitmask + human-readable label (or validation error).</summary>
    public sealed class DownloadModeResolution
    {
        public DownloadOptionFlags Flags { get; set; }
        public string Label { get; set; } = "";
        public string? Error { get; set; }
    }

    /// <summary>One answer to one download prompt. <see cref="Selection"/> is a CurrentSelection enum
    /// member name, <see cref="Checked"/> a DownloadCheckConfiguration value; both null = leave the
    /// prompt unanswered, which makes TIA refuse the download for prompts that need an answer.</summary>
    public sealed class DownloadPromptDecision
    {
        public string TypeName { get; set; } = "";
        public string? Selection { get; set; }
        public bool? Checked { get; set; }
        public string Why { get; set; } = "";
        public bool Answers => Selection != null || Checked != null;
    }

    /// <summary>
    /// The answers DownloadToPlc gives to the pre-download prompts, by configuration type name.
    /// Selection names are the enum members documented in the V21 Openness manual
    /// ("Download configurations"). Kept free of Siemens.Engineering so the offline suite can pin it.
    /// </summary>
    public static class DownloadPromptPolicy
    {
        public static DownloadPromptDecision Decide(string typeName, DownloadPromptOptions o)
        {
            if (o == null) throw new ArgumentNullException(nameof(o));
            var d = new DownloadPromptDecision { TypeName = typeName ?? "" };
            switch (typeName)
            {
                case "StopModules":
                    // StopModulesSelections = { NoAction, StopAll } — not "StopModule".
                    return Select(d, o.StopBeforeDownload ? "StopAll" : "NoAction", "stopBeforeDownload=" + o.StopBeforeDownload);
                case "StopHSystemOrModule":
                    return Select(d, o.StopBeforeDownload ? "StopModule" : "NoAction", "stopBeforeDownload=" + o.StopBeforeDownload);
                case "StopHSystem":
                    return Select(d, o.StopBeforeDownload ? "StopHSystem" : "NoAction", "stopBeforeDownload=" + o.StopBeforeDownload);
                case "StartModules":
                case "StartBackupModules":
                    return Select(d, o.StartAfterDownload ? "StartModule" : "NoAction", "startAfterDownload=" + o.StartAfterDownload);
                case "DataBlockReinitialization":
                    // DataBlockReinitializationSelections = { StopPlcAndReinitialize, NoAction } (V21 manual).
                    // It is asked when the program cannot be loaded WITHOUT reinitializing, so keeping
                    // actual values means declining - the download is then refused, not the values lost.
                    // The old answers "KeepActualValues"/"Reinitialize" are not members of this enum, so
                    // they never applied and the download failed without saying why.
                    return o.KeepActualValues
                        ? Select(d, "NoAction", "keepActualValues=true: do not reinitialize; TIA refuses the download instead")
                        : Select(d, "StopPlcAndReinitialize", "keepActualValues=false: stop the PLC and reset all values, including retain data");
                case "DataBlockReinitializationOrKeepActualValues":
                    return Select(d, o.KeepActualValues ? "KeepActualValues" : "StopPlcAndReinitialize", "keepActualValues=" + o.KeepActualValues);
                case "ResetModule":
                    // ResetModuleSelections = { NoAction, DeleteAll }. Asked when replacing blocks or
                    // incompatible module contents require deleting/resetting online program data.
                    return o.KeepActualValues
                        ? Select(d, "NoAction", "keepActualValues=true: do not delete/reset online module contents; TIA refuses the download instead")
                        : Select(d, "DeleteAll", "keepActualValues=false: reset/delete online module contents so the download can proceed");
                case "InitializeMemory":
                    // InitializeMemorySelections = { NoAction, AcceptAll }.
                    return o.KeepActualValues
                        ? Select(d, "NoAction", "keepActualValues=true: decline initializing target memory")
                        : Select(d, "AcceptAll", "keepActualValues=false: accept initializing target memory during download");
                case "OverwriteOnMemoryCard":
                    // OverwriteOnMemoryCardSelections = { NoAction, Load }.
                    return (!o.KeepActualValues || o.IncludesHardware)
                        ? Select(d, "Load", "allow overwriting memory card contents during download")
                        : Select(d, "NoAction", "keepActualValues=true: do not overwrite memory card");
                case "WaitOnReboot":
                    // WaitOnRebootSelections = { NoAction, Wait }.
                    return o.IncludesHardware
                        ? Select(d, "Wait", "includesHardware=true: wait for target reboot during hardware download")
                        : Select(d, "NoAction", "includesHardware=false: do not wait on reboot");
                case "ConsistentBlocksDownload":
                    return Select(d, "ConsistentDownload", "download the consistent program");
                case "AllBlocksDownload":
                    if (o.ConsistentBlocksOnly)
                    {
                        d.Why = "consistentBlocksOnly=true: left unanswered";
                        return d;
                    }
                    return Select(d, "DownloadAllBlocks", "consistentBlocksOnly=false");
                case "CheckBeforeDownload":
                    // The only one of these that is a check box (DownloadCheckConfiguration).
                    d.Checked = true;
                    d.Why = "include in the download";
                    return d;
                case "AlarmTextLibrariesDownload":
                    // AlarmTextLibrariesDownloadSelections = { ConsistentDownload, NoAction }. A
                    // selection, not a check box: answering Checked never applied.
                    return Select(d, "ConsistentDownload", "download the alarm text libraries with the program");
                case "UserManagementDownload":
                    // UserManagementPreDownloadSelections = { KeepOnlineUserManagementData,
                    // UpdateUserManagementDataButKeepOnlinePassword, DownloadAllUserManagementDataResetToProject }.
                    // Users and passwords on the CPU are not the program's to overwrite.
                    return Select(d, "KeepOnlineUserManagementData", "keep the user management data already on the CPU");
                case "DownloadCertificate":
                    // Only Parent and Message: an information prompt, there is nothing to answer.
                    d.Why = "information only, nothing to answer";
                    return d;
                case "DifferentTargetConfiguration":
                    return Select(d, "AcceptAll", "download although the online modules differ from the configured ones");
                case "ActiveTestCanBeAborted":
                case "ActiveTestCanPreventDownload":
                    // The manual: AcceptAll cancels active test and commissioning functions during the
                    // load. That is somebody else's live session on the machine, so it is opt-in.
                    return o.AbortActiveTests
                        ? Select(d, "AcceptAll", "abortActiveTests=true: active tests/commissioning functions are cancelled")
                        : Select(d, "NoAction", "abortActiveTests=false: the download stops rather than cancel active tests");
                case "OverwriteSystemData":
                    if (o.IncludesHardware)
                        return Select(d, "Overwrite", "includesHardware=true: overwrite system data on target");
                    d.Why = "not handled by the server: TIA's default applies (the download may be refused)";
                    return d;
                case "ExpandDownload":
                    if (o.IncludesHardware)
                        return Select(d, "Download", "includesHardware=true: expand download scope when required for hardware/system data");
                    d.Why = "not handled by the server: TIA's default applies (the download may be refused)";
                    return d;
                case "TargetForSoftware":
                    if (o.IsPlcsimTarget)
                        return Select(d, "PlcSimulationAdvanced", "targeting PLCSIM Advanced route");
                    d.Why = "not handled by the server: TIA's default applies (the download may be refused)";
                    return d;
                case "ProtectionLevelChanged":
                    if (o.AllowProtectionDowngrade)
                        return Select(d, "ContinueDownloading", "allowProtectionDowngrade=true: continue downloading even though CPU protection level lowers");
                    d.Why = "not handled by the server: TIA's default applies (the download may be refused)";
                    return d;
                case "AcceptDownloadOfUnencryptedSensitiveData":
                    if (o.AcceptUnencryptedSensitiveData || o.IncludesHardware)
                    {
                        d.Checked = true;
                        d.Why = "accept unencrypted sensitive configuration data during download";
                        return d;
                    }
                    d.Why = "not handled by the server: TIA's default applies (the download may be refused)";
                    return d;
                default:
                    d.Why = "not handled by the server: TIA's default applies (the download may be refused)";
                    return d;
            }
        }

        /// <summary>
        /// Parses caller-facing <paramref name="downloadMode"/> + <paramref name="includeHardware"/>
        /// into a valid <see cref="DownloadOptionFlags"/> combination while keeping default calls
        /// mapped to Software-only for full backward compatibility.
        /// </summary>
        public static DownloadModeResolution ResolveDownloadMode(string? downloadMode, bool includeHardware = false)
        {
            var raw = (downloadMode ?? string.Empty).Trim();
            var norm = raw.ToLowerInvariant()
                .Replace("_", string.Empty)
                .Replace("-", string.Empty)
                .Replace(" ", string.Empty)
                .Replace("+", "and")
                .Replace("|", "and")
                .Replace(",", "and");

            DownloadOptionFlags flags;
            switch (norm)
            {
                case "":
                case "software":
                case "sw":
                case "softwareall":
                    flags = DownloadOptionFlags.Software;
                    break;
                case "softwareonlychanges":
                case "softwarechanges":
                case "changes":
                case "delta":
                case "swchanges":
                    flags = DownloadOptionFlags.SoftwareOnlyChanges;
                    break;
                case "hardware":
                case "hw":
                case "hardwareonly":
                    flags = DownloadOptionFlags.Hardware;
                    break;
                case "all":
                case "both":
                case "full":
                case "hwsw":
                case "swhw":
                case "hardwareandsoftware":
                case "softwareandhardware":
                case "hwandsw":
                case "swandhw":
                    flags = DownloadOptionFlags.Hardware | DownloadOptionFlags.Software;
                    break;
                case "hardwareandsoftwarechanges":
                case "hardwareandsoftwareonlychanges":
                case "softwarechangesandhardware":
                case "hwandswchanges":
                    flags = DownloadOptionFlags.Hardware | DownloadOptionFlags.SoftwareOnlyChanges;
                    break;
                default:
                    return new DownloadModeResolution
                    {
                        Error = $"Unsupported downloadMode '{downloadMode}'. Use 'software' (default), 'hardware_and_software' ('all'), 'hardware', 'software_changes', or 'hardware_and_software_changes'."
                    };
            }

            if (includeHardware)
                flags |= DownloadOptionFlags.Hardware;

            var parts = new System.Collections.Generic.List<string>(2);
            if ((flags & DownloadOptionFlags.Hardware) != 0) parts.Add("Hardware");
            if ((flags & DownloadOptionFlags.Software) != 0) parts.Add("Software");
            if ((flags & DownloadOptionFlags.SoftwareOnlyChanges) != 0) parts.Add("SoftwareOnlyChanges");

            return new DownloadModeResolution
            {
                Flags = flags,
                Label = string.Join(" | ", parts)
            };
        }

        private static DownloadPromptDecision Select(DownloadPromptDecision d, string selection, string why)
        {
            d.Selection = selection;
            d.Why = why;
            return d;
        }

        /// <summary>
        /// True when a Download / GoOnline failure happened before any pre-download prompt was raised
        /// and appears to be an online connection / TLS legitimation issue rather than a user-program error.
        /// </summary>
        public static bool ShouldRetryConnectionBeforePrompts(int promptCount, Exception? ex)
        {
            if (promptCount > 0 || ex == null)
                return false;

            for (var cur = ex; cur != null; cur = cur.InnerException)
            {
                var msg = cur.Message ?? string.Empty;
                if (msg.IndexOf("compile", StringComparison.OrdinalIgnoreCase) >= 0
                    || msg.IndexOf("编译", StringComparison.OrdinalIgnoreCase) >= 0
                    || msg.IndexOf("protection level", StringComparison.OrdinalIgnoreCase) >= 0
                    || msg.IndexOf("password", StringComparison.OrdinalIgnoreCase) >= 0)
                    return false;
            }
            return true;
        }
    }

    /// <summary>Snapshot of one local IPv4 network interface used for zero-Openness route matching tests.</summary>
    public sealed class HostNicInfo
    {
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public bool IsUp { get; set; }
        public string Address { get; set; } = "";
        public string SubnetMask { get; set; } = "";
    }

    /// <summary>
    /// Pure (zero-Openness) IPv4 host NIC & V20 target-address route selection helpers.
    /// Compiled directly into both TiaMcpServer and TiaMcpServer.Tests.
    /// </summary>
    public static class DownloadRoutePolicy
    {
        public static string NormalizePgPcAdapterName(string? name)
        {
            var s = (name ?? string.Empty).Trim();
            if (s.Length == 0) return string.Empty;

            // TIA appends ".1", ".2" suffixes for multi-instance bindings on the same Windows NIC.
            int dot = s.LastIndexOf('.');
            if (dot > 0 && dot < s.Length - 1)
            {
                bool allDigits = true;
                for (int i = dot + 1; i < s.Length; i++)
                {
                    if (!char.IsDigit(s[i])) { allDigits = false; break; }
                }
                if (allDigits) s = s.Substring(0, dot).Trim();
            }
            return s;
        }

        public static bool IsSameIPv4Subnet(string? ipA, string? ipB, string? subnetMask)
        {
            if (string.IsNullOrWhiteSpace(ipA) || string.IsNullOrWhiteSpace(ipB))
                return false;
            if (!IPAddress.TryParse(ipA!.Trim(), out var a) || a == null || a.AddressFamily != AddressFamily.InterNetwork)
                return false;
            if (!IPAddress.TryParse(ipB!.Trim(), out var b) || b == null || b.AddressFamily != AddressFamily.InterNetwork)
                return false;

            byte[] maskBytes;
            if (!string.IsNullOrWhiteSpace(subnetMask)
                && IPAddress.TryParse(subnetMask!.Trim(), out var mask)
                && mask != null
                && mask.AddressFamily == AddressFamily.InterNetwork)
            {
                maskBytes = mask.GetAddressBytes();
            }
            else
            {
                maskBytes = new byte[] { 255, 255, 255, 0 };
            }

            byte[] ab = a.GetAddressBytes();
            byte[] bb = b.GetAddressBytes();
            for (int i = 0; i < 4; i++)
            {
                if ((ab[i] & maskBytes[i]) != (bb[i] & maskBytes[i]))
                    return false;
            }
            return true;
        }

        public static int ComputeHostNicSubnetScore(string? pcInterfaceName, string? targetIpAddress, IReadOnlyList<HostNicInfo>? hostNics)
        {
            if (string.IsNullOrWhiteSpace(pcInterfaceName)
                || string.IsNullOrWhiteSpace(targetIpAddress)
                || hostNics == null
                || hostNics.Count == 0)
                return 0;

            string normRoute = NormalizePgPcAdapterName(pcInterfaceName);
            int best = 0;
            foreach (var nic in hostNics)
            {
                if (!IsSameIPv4Subnet(targetIpAddress, nic.Address, nic.SubnetMask))
                    continue;

                string normDesc = NormalizePgPcAdapterName(nic.Description);
                string normName = NormalizePgPcAdapterName(nic.Name);
                bool exact = string.Equals(normRoute, normDesc, StringComparison.OrdinalIgnoreCase)
                             || string.Equals(normRoute, normName, StringComparison.OrdinalIgnoreCase);
                bool partial = !exact && (
                    (!string.IsNullOrEmpty(normDesc) && (normRoute.IndexOf(normDesc, StringComparison.OrdinalIgnoreCase) >= 0
                                                         || normDesc.IndexOf(normRoute, StringComparison.OrdinalIgnoreCase) >= 0))
                    || (!string.IsNullOrEmpty(normName) && (normRoute.IndexOf(normName, StringComparison.OrdinalIgnoreCase) >= 0
                                                            || normName.IndexOf(normRoute, StringComparison.OrdinalIgnoreCase) >= 0)));

                if (!exact && !partial)
                    continue;

                int score = (nic.IsUp ? 250 : 80) + (exact ? 50 : 0);
                if (score > best) best = score;
            }
            return best;
        }

        public static List<HostNicInfo> ReadHostIPv4Nics()
        {
            var result = new List<HostNicInfo>();
            try
            {
                foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (nic.NetworkInterfaceType == NetworkInterfaceType.Loopback)
                        continue;
                    IPInterfaceProperties props;
                    try { props = nic.GetIPProperties(); }
                    catch { continue; }

                    foreach (var ua in props.UnicastAddresses)
                    {
                        if (ua.Address.AddressFamily != AddressFamily.InterNetwork)
                            continue;
                        result.Add(new HostNicInfo
                        {
                            Name = nic.Name ?? "",
                            Description = nic.Description ?? "",
                            IsUp = nic.OperationalStatus == OperationalStatus.Up,
                            Address = ua.Address.ToString(),
                            SubnetMask = ua.IPv4Mask?.ToString() ?? "255.255.255.0"
                        });
                    }
                }
            }
            catch { }
            return result;
        }

        /// <summary>
        /// Openness V15-V20 leaves ConfigurationTargetInterface.Addresses empty while V21 populates them.
        /// Allow falling back to unpopulated candidates only when either ALL candidates are unpopulated (V20)
        /// or an unpopulated candidate binds to a host NIC in the target IPv4 subnet.
        /// </summary>
        public static bool ShouldKeepUnpopulatedFallback(
            bool allPoolRoutesUnpopulated,
            IReadOnlyList<string> unpopulatedPcInterfaces,
            string? targetIpAddress,
            IReadOnlyList<HostNicInfo>? hostNics)
        {
            if (unpopulatedPcInterfaces == null || unpopulatedPcInterfaces.Count == 0)
                return false;
            if (allPoolRoutesUnpopulated)
                return true;
            if (hostNics == null || string.IsNullOrWhiteSpace(targetIpAddress))
                return false;

            foreach (var pc in unpopulatedPcInterfaces)
            {
                if (ComputeHostNicSubnetScore(pc, targetIpAddress, hostNics) > 0)
                    return true;
            }
            return false;
        }
    }
}
