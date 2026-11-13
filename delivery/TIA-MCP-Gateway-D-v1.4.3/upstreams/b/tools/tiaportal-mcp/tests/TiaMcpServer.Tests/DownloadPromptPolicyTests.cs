using System;
using System.Collections.Generic;
using System.Linq;
using TiaMcpServer.Siemens;

namespace TiaMcpServer.Tests
{
    /// <summary>
    /// How DownloadToPlc answers TIA's download prompts. Every answer must be a member of the
    /// selection enum the V21 Openness manual documents for that prompt: a non-member never applies,
    /// the prompt stays unanswered and the download fails without a stated reason - which is exactly
    /// what "KeepActualValues"/"Reinitialize" did for DataBlockReinitialization.
    /// </summary>
    internal static class DownloadPromptPolicyTests
    {
        // Selection enums as documented in "TIA Portal Openness: API for automation of engineering
        // workflows" V21 (03/2026), download configuration table.
        private static readonly Dictionary<string, string[]> Documented = new Dictionary<string, string[]>
        {
            ["StopModules"] = new[] { "NoAction", "StopAll" },
            ["StartModules"] = new[] { "NoAction", "StartModule" },
            ["AllBlocksDownload"] = new[] { "DownloadAllBlocks" },
            ["ConsistentBlocksDownload"] = new[] { "ConsistentDownload" },
            ["DataBlockReinitialization"] = new[] { "StopPlcAndReinitialize", "NoAction" },
            ["ActiveTestCanBeAborted"] = new[] { "NoAction", "AcceptAll" },
            ["ActiveTestCanPreventDownload"] = new[] { "NoAction", "AcceptAll" },
            ["DifferentTargetConfiguration"] = new[] { "NoAction", "AcceptAll" },
            // Checked against the V21 PublicAPI by reflection: these three are selections or plain
            // messages, not check boxes, so a Checked answer never applied.
            ["AlarmTextLibrariesDownload"] = new[] { "ConsistentDownload", "NoAction" },
            ["UserManagementDownload"] = new[] { "KeepOnlineUserManagementData", "UpdateUserManagementDataButKeepOnlinePassword", "DownloadAllUserManagementDataResetToProject" },
            ["ResetModule"] = new[] { "NoAction", "DeleteAll" },
            ["InitializeMemory"] = new[] { "NoAction", "AcceptAll" },
            ["OverwriteOnMemoryCard"] = new[] { "NoAction", "Load" },
            ["WaitOnReboot"] = new[] { "NoAction", "Wait" },
        };

        // Selection prompts must be answered with a selection; a Checked answer silently does nothing.
        private static readonly string[] SelectionPrompts =
            { "AlarmTextLibrariesDownload", "UserManagementDownload", "DifferentTargetConfiguration" };

        internal static void Run(Action<bool, string> check)
        {
            var defaults = new DownloadPromptOptions();
            var all = new List<DownloadPromptOptions>
            {
                defaults,
                new DownloadPromptOptions { KeepActualValues = false, StartAfterDownload = false, StopBeforeDownload = false, ConsistentBlocksOnly = false, AbortActiveTests = true },
            };

            foreach (var kv in Documented)
                foreach (var o in all)
                {
                    var d = DownloadPromptPolicy.Decide(kv.Key, o);
                    check(d.Selection == null || kv.Value.Contains(d.Selection),
                        kv.Key + ": answer '" + d.Selection + "' is a documented " + kv.Key + "Selections member");
                }

            // Active tests are somebody's live session on the machine: never cancelled by default.
            foreach (var t in new[] { "ActiveTestCanBeAborted", "ActiveTestCanPreventDownload" })
            {
                check(DownloadPromptPolicy.Decide(t, defaults).Selection == "NoAction", t + ": default declines to cancel active tests");
                check(DownloadPromptPolicy.Decide(t, new DownloadPromptOptions { AbortActiveTests = true }).Selection == "AcceptAll",
                    t + ": cancelled only when abortActiveTests=true");
            }

            check(DownloadPromptPolicy.Decide("StopModules", defaults).Selection == "StopAll", "StopModules: stopBeforeDownload answers StopAll (not StopModule)");
            check(DownloadPromptPolicy.Decide("StartModules", defaults).Selection == "StartModule", "StartModules: startAfterDownload answers StartModule");
            check(DownloadPromptPolicy.Decide("StartModules", new DownloadPromptOptions { StartAfterDownload = false }).Selection == "NoAction",
                "StartModules: startAfterDownload=false leaves the CPU in STOP");

            check(DownloadPromptPolicy.Decide("DataBlockReinitialization", defaults).Selection == "NoAction",
                "DataBlockReinitialization: keepActualValues=true declines, so values are never wiped by default");
            check(DownloadPromptPolicy.Decide("DataBlockReinitialization", new DownloadPromptOptions { KeepActualValues = false }).Selection == "StopPlcAndReinitialize",
                "DataBlockReinitialization: keepActualValues=false reinitializes");
            check(DownloadPromptPolicy.Decide("DataBlockReinitializationOrKeepActualValues", defaults).Selection == "KeepActualValues",
                "DataBlockReinitializationOrKeepActualValues: keeps actual values by default (manual example)");
            check(DownloadPromptPolicy.Decide("ResetModule", defaults).Selection == "NoAction",
                "ResetModule: keepActualValues=true declines DeleteAll by default");
            check(DownloadPromptPolicy.Decide("ResetModule", new DownloadPromptOptions { KeepActualValues = false }).Selection == "DeleteAll",
                "ResetModule: keepActualValues=false selects DeleteAll to replace online module contents");
            check(DownloadPromptPolicy.Decide("InitializeMemory", defaults).Selection == "NoAction",
                "InitializeMemory: keepActualValues=true declines AcceptAll");
            check(DownloadPromptPolicy.Decide("InitializeMemory", new DownloadPromptOptions { KeepActualValues = false }).Selection == "AcceptAll",
                "InitializeMemory: keepActualValues=false selects AcceptAll");
            check(DownloadPromptPolicy.Decide("OverwriteOnMemoryCard", defaults).Selection == "NoAction",
                "OverwriteOnMemoryCard: defaults to NoAction");
            check(DownloadPromptPolicy.Decide("WaitOnReboot", new DownloadPromptOptions { IncludesHardware = true }).Selection == "Wait",
                "WaitOnReboot: IncludesHardware=true waits on reboot");

            check(!DownloadPromptPolicy.Decide("AllBlocksDownload", defaults).Answers, "AllBlocksDownload: unanswered with consistentBlocksOnly=true");
            var check1 = DownloadPromptPolicy.Decide("CheckBeforeDownload", defaults);
            check(check1.Checked == true && check1.Selection == null, "CheckBeforeDownload is a check, not a selection");
            foreach (var t in SelectionPrompts)
            {
                var sel = DownloadPromptPolicy.Decide(t, defaults);
                check(sel.Selection != null && sel.Checked == null, t + ": answered with a selection, not Checked");
            }
            check(DownloadPromptPolicy.Decide("UserManagementDownload", defaults).Selection == "KeepOnlineUserManagementData",
                "UserManagementDownload: users and passwords on the CPU are kept");
            var cert = DownloadPromptPolicy.Decide("DownloadCertificate", defaults);
            check(!cert.Answers && cert.Why.Contains("information"), "DownloadCertificate is information only: nothing to answer");

            var unknown = DownloadPromptPolicy.Decide("ProtectionLevelChanged", defaults);
            check(!unknown.Answers && unknown.Why.Contains("not handled"),
                "an unhandled prompt is left alone and says so (lowering CPU protection is never auto-accepted)");

            // Hardware prompt policies stay opted-in via IncludesHardware=true; ProtectionLevelChanged stays unhandled.
            check(!DownloadPromptPolicy.Decide("OverwriteSystemData", defaults).Answers,
                "OverwriteSystemData is left unhandled on software-only downloads");
            check(!DownloadPromptPolicy.Decide("ExpandDownload", defaults).Answers,
                "ExpandDownload is left unhandled on software-only downloads");
            var hwPromptOpts = new DownloadPromptOptions { IncludesHardware = true };
            check(DownloadPromptPolicy.Decide("OverwriteSystemData", hwPromptOpts).Selection == "Overwrite",
                "OverwriteSystemData answers Overwrite when IncludesHardware=true");
            check(DownloadPromptPolicy.Decide("ExpandDownload", hwPromptOpts).Selection == "Download",
                "ExpandDownload answers Download when IncludesHardware=true");
            check(!DownloadPromptPolicy.Decide("ProtectionLevelChanged", hwPromptOpts).Answers,
                "ProtectionLevelChanged stays unhandled even when IncludesHardware=true");
            check(DownloadPromptPolicy.Decide("ProtectionLevelChanged", new DownloadPromptOptions { AllowProtectionDowngrade = true }).Selection == "ContinueDownloading",
                "ProtectionLevelChanged answers ContinueDownloading when AllowProtectionDowngrade=true");
            check(!DownloadPromptPolicy.Decide("AcceptDownloadOfUnencryptedSensitiveData", defaults).Answers,
                "AcceptDownloadOfUnencryptedSensitiveData stays unhandled by default");
            check(DownloadPromptPolicy.Decide("AcceptDownloadOfUnencryptedSensitiveData", hwPromptOpts).Checked == true,
                "AcceptDownloadOfUnencryptedSensitiveData checks true when IncludesHardware=true");

            // Download mode resolution (backward-compatible Software default + Hardware | Software combos)
            var mDefault = DownloadPromptPolicy.ResolveDownloadMode(null);
            check(mDefault.Error == null && mDefault.Flags == DownloadOptionFlags.Software,
                "null/empty downloadMode resolves to Software");
            var mSwHw = DownloadPromptPolicy.ResolveDownloadMode("software", includeHardware: true);
            check(mSwHw.Error == null && mSwHw.Flags == (DownloadOptionFlags.Hardware | DownloadOptionFlags.Software),
                "software + includeHardware=true resolves to Hardware | Software");
            foreach (var alias in new[] { "hardware_and_software", "hardware+software", "all", "both", "HARDWARE|SOFTWARE" })
            {
                var r = DownloadPromptPolicy.ResolveDownloadMode(alias);
                check(r.Error == null && r.Flags == (DownloadOptionFlags.Hardware | DownloadOptionFlags.Software),
                    $"downloadMode '{alias}' resolves to Hardware | Software");
            }
            var mHwOnly = DownloadPromptPolicy.ResolveDownloadMode("hardware");
            check(mHwOnly.Error == null && mHwOnly.Flags == DownloadOptionFlags.Hardware,
                "downloadMode 'hardware' resolves to Hardware only");
            var mDeltaHw = DownloadPromptPolicy.ResolveDownloadMode("software_changes", includeHardware: true);
            check(mDeltaHw.Error == null && mDeltaHw.Flags == (DownloadOptionFlags.Hardware | DownloadOptionFlags.SoftwareOnlyChanges),
                "software_changes + includeHardware=true resolves to Hardware | SoftwareOnlyChanges");
            var mBad = DownloadPromptPolicy.ResolveDownloadMode("bogus");
            check(mBad.Error != null && mBad.Flags == DownloadOptionFlags.None,
                "invalid downloadMode returns error and Flags=None");

            // V20 host NIC subnet matching & unpopulated ConfigurationAddress fallback
            check(DownloadRoutePolicy.NormalizePgPcAdapterName("Siemens PLCSIM Virtual Ethernet Adapter.1") == "Siemens PLCSIM Virtual Ethernet Adapter",
                "NormalizePgPcAdapterName strips TIA .1 instance suffix");
            check(DownloadRoutePolicy.NormalizePgPcAdapterName("my.adapter.v2") == "my.adapter.v2",
                "NormalizePgPcAdapterName preserves non-numeric dot suffix");
            check(DownloadRoutePolicy.IsSameIPv4Subnet("192.168.250.10", "192.168.250.1", "255.255.255.0"),
                "192.168.250.10 shares /24 subnet with 192.168.250.1");
            check(!DownloadRoutePolicy.IsSameIPv4Subnet("192.168.250.10", "192.168.1.1", "255.255.255.0"),
                "192.168.250.10 does not match 192.168.1.0/24");

            var fakeNics = new List<HostNicInfo>
            {
                new HostNicInfo { Name = "WLAN", Description = "Intel Wi-Fi 6", IsUp = true, Address = "192.168.1.50", SubnetMask = "255.255.255.0" },
                new HostNicInfo { Name = "以太网 4", Description = "Siemens PLCSIM Virtual Ethernet Adapter", IsUp = true, Address = "192.168.250.1", SubnetMask = "255.255.255.0" },
            };
            int plcsimScore = DownloadRoutePolicy.ComputeHostNicSubnetScore("Siemens PLCSIM Virtual Ethernet Adapter.1", "192.168.250.10", fakeNics);
            int wifiScore = DownloadRoutePolicy.ComputeHostNicSubnetScore("Intel Wi-Fi 6", "192.168.250.10", fakeNics);
            check(plcsimScore >= 300 && wifiScore == 0,
                $"matching PLCSIM NIC gets top subnet score ({plcsimScore} vs {wifiScore})");

            // V20 all-unpopulated routes allow fallback; V21 mixed populated routes only allow matching host-subnet NIC
            check(DownloadRoutePolicy.ShouldKeepUnpopulatedFallback(true, new[] { "Siemens PLCSIM Virtual Ethernet Adapter" }, "192.168.250.10", fakeNics),
                "V20 all-unpopulated routes allow IP assignment fallback");
            check(!DownloadRoutePolicy.ShouldKeepUnpopulatedFallback(false, new[] { "Intel Wi-Fi 6" }, "192.168.250.10", fakeNics),
                "V21 populated mismatch does not silently fall back to unrelated NIC");
            check(DownloadRoutePolicy.ShouldKeepUnpopulatedFallback(false, new[] { "Siemens PLCSIM Virtual Ethernet Adapter" }, "192.168.250.10", fakeNics),
                "unpopulated route with matching host subnet is kept");

            // Pre-prompt connection retry guard
            check(DownloadPromptPolicy.ShouldRetryConnectionBeforePrompts(0, new InvalidOperationException("连接到模块 PLC_1 失败。")),
                "connection error before any prompt permits safe retry");
            check(!DownloadPromptPolicy.ShouldRetryConnectionBeforePrompts(1, new InvalidOperationException("连接到模块 PLC_1 失败。")),
                "error after prompts started never retries blindly");
            check(!DownloadPromptPolicy.ShouldRetryConnectionBeforePrompts(0, new InvalidOperationException("Project compile error")),
                "compile error never triggers connection retry");

            // TargetForSoftware stays unhandled for real CPU, chooses PlcSimulationAdvanced for PLCSIM routes
            check(!DownloadPromptPolicy.Decide("TargetForSoftware", defaults).Answers,
                "TargetForSoftware left unhandled for non-PLCSIM target");
            check(DownloadPromptPolicy.Decide("TargetForSoftware", new DownloadPromptOptions { IsPlcsimTarget = true }).Selection == "PlcSimulationAdvanced",
                "TargetForSoftware answers PlcSimulationAdvanced when IsPlcsimTarget=true");
        }
    }
}
