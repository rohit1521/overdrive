import { jsx, jsxs } from 'react/jsx-runtime';
import { useState } from 'react';
import { Text, View, VirtualList } from '@ps5-react/core';
import { URLDialog } from '../downloads/URLDialog.jsx';
import { useT } from '../i18n/index.js';
import { clearTorBoxKey, setTorBoxKey, torboxError, torboxKey, useTorBox, useTorBoxHosts } from '../state/torbox-session.js';
import { Button2 } from './Button.jsx';
import { FocusRing } from './FocusRing.jsx';
import { Icon } from './Icon.jsx';
import { SideSheet } from './SideSheet.jsx';
import { SourceVerification } from './SourceVerification.jsx';
import { colors } from './colors.js';

const BODY = { width: 660, fontFamily: "Inter-Regular", fontSize: 21, color: colors.muted, lineHeight: 30 };

function Platforms({ onClose }) {
  const t = useT();
  const { hosts, loading, error, disabled, refresh, toggle } = useTorBoxHosts();
  const [failure, setFailure] = useState("");
  return jsx(SideSheet, { title: t("torbox.platforms"), onClose, children: jsxs(View, {
    style: { padding: 9, gap: 18, paddingBottom: 48 }, children: [
      jsx(Text, { style: BODY, children: t("torbox.platformsDetail") }),
      jsx(Button2, { label: t("torbox.refreshHosts"), onPress: refresh }),
      loading ? jsx(SourceVerification, { state: "checking" }) : null,
      error || failure ? jsx(Text, { style: [BODY, { color: colors.warn }], children: error || failure }) : null,
      !loading && !error && !hosts.length ? jsx(Text, { style: BODY, children: t("torbox.noHosts") }) : null,
      jsx(VirtualList, {
        data: hosts, numColumns: 1, itemHeight: 90, rowGap: 6,
        keyExtractor: (host) => host.id,
        renderItem: ({ item: host, index }) => {
          const checked = !disabled.includes(host.id);
          return jsxs(View, {
            focusKey: `torbox-host:${host.id}`, autoFocus: index === 0,
            onPress: () => {
              try { toggle(host.id); setFailure(""); } catch (error) { setFailure(error.message); }
            },
            style: ({ focused }) => ({ height: 90, flexDirection: "row", alignItems: "center", gap: 18,
              borderRadius: 12, paddingHorizontal: 18, backgroundColor: focused ? colors.surface2 : colors.canvas }),
            children: [
              jsx(FocusRing, {}),
              jsx(View, { style: { width: 27, height: 27, borderRadius: 4, borderWidth: 2, borderColor: colors.muted,
                alignItems: "center", justifyContent: "center" }, children: checked ? jsx(Icon, { name: "check", size: 18, color: colors.fg }) : null }),
              jsxs(View, { style: { gap: 3 }, children: [
                jsx(Text, { style: { ...BODY, width: 570, color: colors.fg, numberOfLines: 1, ellipsizeMode: "tail" }, children: host.name }),
                jsx(Text, { style: { ...BODY, width: 570, fontSize: 18, numberOfLines: 1, ellipsizeMode: "tail" },
                  children: host.available ? host.id : `${host.id} · ${t("torbox.hostUnavailable")}` })
              ] })
            ]
          });
        }
      })
    ]
  }) });
}

export function TorBoxSettings({ onClose }) {
  const t = useT(), enabled = useTorBox();
  const [page, setPage] = useState("settings");
  const [failure, setFailure] = useState(torboxError);
  if (page === "key") return jsx(URLDialog, {
    title: t("torbox.apiKey"), detail: t("torbox.detail"), initial: torboxKey(),
    confirmLabel: t("torbox.save"), pendingLabel: t("torbox.checking"),
    submit: setTorBoxKey, onClose: () => { setPage("settings"); setFailure(torboxError()); }
  });
  if (page === "platforms") return jsx(Platforms, { onClose: () => setPage("settings") });
  return jsx(SideSheet, { title: t("torbox.title"), onClose, children: jsxs(View, {
    style: { gap: 18, padding: 9, paddingBottom: 48 }, children: [
      jsx(Button2, { label: t("torbox.apiKey"), onPress: () => setPage("key") }),
      jsx(Text, { style: BODY, children: t(enabled ? "torbox.enabled" : "torbox.detail") }),
      enabled ? jsx(Button2, { label: t("torbox.remove"), onPress: () => {
        try { clearTorBoxKey(); setFailure(""); } catch (error) { setFailure(error.message); }
      } }) : null,
      jsx(Button2, { label: t("torbox.platforms"), onPress: () => setPage("platforms") }),
      failure ? jsx(Text, { style: [BODY, { color: colors.warn }], children: failure }) : null
    ]
  }) });
}
