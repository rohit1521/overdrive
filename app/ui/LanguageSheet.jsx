// ../pub-game-store/native/ui/LanguageSheet.jsx
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED: the sheet is the app's settings: a download speed limit, navigation vibration, then the languages.

import '../assets/Inter-Regular.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useState } from 'react';
import { TorBoxSettings } from './TorBoxSettings.jsx';
import { formatPercent2 } from '../i18n/core.js';
import { chooseLanguage, languageChoice, systemLocale, useT } from '../i18n/index.js';
import { LOCALES } from '../i18n/locales.js';
import { FocusRing } from './FocusRing.jsx';
import { Icon } from './Icon.jsx';
import { SideSheet } from './SideSheet.jsx';
import { colors } from './colors.js';
import { LEVELS, setVibrationLevel, useVibrationLevel } from './haptics.js';
import { LIMITS, setSpeedLimit, useSpeedLimit } from '../state/speed-limit.js';
import { setDeletePackages, useDeletePackages } from '../state/package-cleanup.js';
import { useTorBox } from '../state/torbox-session.js';
import { setSourcePreference, useSourcePreference } from '../state/source-preference.js';
import { FORMAT_PREFERENCES, formatLabel } from '../game/source-format.js';
import { Text, View, useIsFocused } from '@ps5-react/core';

  var nameOf = (code) => LOCALES.find((locale2) => locale2.code === code).name;
  function LanguageFace({ name, detail: detail2, checked }) {
    const focused = useIsFocused();
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 3 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 23, fontWeight: 600, color: "#f2f2f3" }, children: name }),
        /* @__PURE__ */ (0, jsx)(Text, { style: [{ fontFamily: "Inter-Regular", fontSize: 21, lineHeight: 30 }, { color: focused ? colors.fg : colors.muted }], children: detail2 })
      ] }),
      checked ? /* @__PURE__ */ (0, jsx)(Icon, { name: "check", color: colors.fg }) : /* @__PURE__ */ (0, jsx)(View, { style: { width: 24, height: 24 } })
    ] });
  }
  function Row4({ code, name, detail: detail2, checked, onPress }) {
    return /* @__PURE__ */ (0, jsx)(View, { focusKey: `language:${code}`, onPress, style: (_state) => [{ position: "relative", flexDirection: "row", alignItems: "center", gap: 24, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 18 }, _state.focused ? { backgroundColor: "#212125" } : null], children: /* @__PURE__ */ (0, jsx)(LanguageFace, { name, detail: detail2, checked }) });
  }
  // One segment of the speed limit (issue #15): every value in view, the chosen one filled. The D-pad
  // moves along the row and Cross picks, so no value has to be typed.
  function SpeedSegment({ limit, chosen }) {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsxs)(View, { focusKey: `settings:speed:${limit}`, autoFocus: chosen, onPress: () => setSpeedLimit(limit), style: { position: "relative", flex: limit ? 1 : 2, height: 60, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: chosen ? colors.fg : colors.surface2 }, children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 21, fontWeight: 600, color: chosen ? colors.accentFg : colors.muted, numberOfLines: 1 }, children: limit ? String(limit) : t2("settings.speedUnlimited") })
    ] });
  }
  function SpeedLimit() {
    const t2 = useT();
    const limit = useSpeedLimit();
    return /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 18, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 18 }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 3 }, children: [
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, children: [
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 23, fontWeight: 600, color: colors.fg }, children: t2("settings.speedLimit") }),
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 21, color: colors.fg }, children: limit ? t2("units.speed", { n: String(limit) }) : t2("settings.speedUnlimited") })
        ] }),
        /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 21, color: colors.muted, lineHeight: 30 }, children: t2("settings.speedLimitDetail") })
      ] }),
      /* @__PURE__ */ (0, jsx)(View, { style: { flexDirection: "row", gap: 9 }, children: LIMITS.map((value) => /* @__PURE__ */ (0, jsx)(SpeedSegment, { limit: value, chosen: value === limit }, value)) })
    ] });
  }
  // Whether a PKG is deleted once installed, laid out like the speed limit: both choices in view.
  function PackagesSegment({ on, chosen }) {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsxs)(View, { focusKey: `settings:packages:${on ? "on" : "off"}`, onPress: () => setDeletePackages(on), style: { position: "relative", flex: 1, height: 60, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: chosen ? colors.fg : colors.surface2 }, children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 21, fontWeight: 600, color: chosen ? colors.accentFg : colors.muted, numberOfLines: 1 }, children: t2(on ? "settings.on" : "settings.off") })
    ] });
  }
  function DeletePackages() {
    const t2 = useT();
    const on = useDeletePackages();
    return /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 18, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 18 }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 3 }, children: [
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, children: [
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 23, fontWeight: 600, color: colors.fg }, children: t2("settings.deletePackages") }),
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 21, color: colors.fg }, children: t2(on ? "settings.on" : "settings.off") })
        ] }),
        /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 21, color: colors.muted, lineHeight: 30 }, children: t2("settings.deletePackagesDetail") })
      ] }),
      /* @__PURE__ */ (0, jsx)(View, { style: { flexDirection: "row", gap: 9 }, children: [true, false].map((value) => /* @__PURE__ */ (0, jsx)(PackagesSegment, { on: value, chosen: value === on }, String(value))) })
    ] });
  }
  // The vibration level (issue #32), laid out like the speed limit: every step in view, Cross picks.
  var levelName = (t2, level) => level ? formatPercent2(level) : t2("settings.vibrationOff");
  function VibrationSegment({ level, chosen }) {
    const t2 = useT();
    return /* @__PURE__ */ (0, jsxs)(View, { focusKey: `settings:vibration:${level}`, onPress: () => setVibrationLevel(level), style: { position: "relative", flex: level ? 1 : 2, height: 60, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: chosen ? colors.fg : colors.surface2 }, children: [
      /* @__PURE__ */ (0, jsx)(FocusRing, {}),
      /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 21, fontWeight: 600, color: chosen ? colors.accentFg : colors.muted, numberOfLines: 1 }, children: levelName(t2, level) })
    ] });
  }
  function VibrationLevel() {
    const t2 = useT();
    const level = useVibrationLevel();
    return /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 18, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 18 }, children: [
      /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 3 }, children: [
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, children: [
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 23, fontWeight: 600, color: colors.fg }, children: t2("settings.vibration") }),
          /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 21, color: colors.fg }, children: levelName(t2, level) })
        ] }),
        /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 21, color: colors.muted, lineHeight: 30 }, children: t2("settings.vibrationDetail") })
      ] }),
      /* @__PURE__ */ (0, jsx)(View, { style: { flexDirection: "row", gap: 9 }, children: LEVELS.map((value) => /* @__PURE__ */ (0, jsx)(VibrationSegment, { level: value, chosen: value === level }, value)) })
    ] });
  }
  function SectionLabel({ icon, title, detail: detail2 }) {
    const text = /* @__PURE__ */ (0, jsxs)(View, { style: { flex: 1, gap: 3 }, children: [
      /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 19, fontWeight: 600, color: colors.muted, letterSpacing: 1.5 }, children: title }),
      detail2 ? /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 19, color: colors.muted, lineHeight: 27 }, children: detail2 }) : null
    ] });
    return /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", alignItems: "flex-start", gap: 18, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 6 }, children: [
      icon ? /* @__PURE__ */ (0, jsx)(Icon, { name: icon, size: 26, color: colors.muted }) : null,
      text
    ] });
  }
  function LanguageSheet({ onClose }) {
    const t2 = useT();
    const torbox = useTorBox();
    const preference = useSourcePreference();
    const [editingTorBox, setEditingTorBox] = useState(false);
    const choice2 = languageChoice();
    const pick2 = (code) => {
      chooseLanguage(code);
      onClose();
    };
    if (editingTorBox) return /* @__PURE__ */ (0, jsx)(TorBoxSettings, { onClose: () => setEditingTorBox(false) });
    // The speed limit and vibration stay open on press, so the change shows (or is felt) at once; a
    // language choice still closes the sheet as before. Focus opens on the chosen speed, at the top.
    return /* @__PURE__ */ (0, jsx)(SideSheet, { title: t2("settings.title"), onClose, children: /* @__PURE__ */ (0, jsxs)(View, { style: { gap: 6, padding: 9, paddingBottom: 48 }, children: [
      /* @__PURE__ */ (0, jsx)(SectionLabel, { icon: "download", title: t2("settings.downloads") }),
      /* @__PURE__ */ (0, jsx)(SpeedLimit, {}),
      /* @__PURE__ */ (0, jsx)(DeletePackages, {}),
      /* @__PURE__ */ (0, jsx)(Row4, { code: "source-format", name: t2("sources.formatPreference"),
        detail: formatLabel(preference), onPress: () => setSourcePreference(FORMAT_PREFERENCES[(FORMAT_PREFERENCES.indexOf(preference) + 1) % FORMAT_PREFERENCES.length]) }),
      /* @__PURE__ */ (0, jsx)(Row4, { code: "torbox", name: t2("torbox.title"),
        detail: t2(torbox ? "torbox.enabled" : "torbox.detail"), checked: torbox,
        onPress: () => setEditingTorBox(true) }),
      /* @__PURE__ */ (0, jsx)(SectionLabel, { title: t2("settings.controller") }),
      /* @__PURE__ */ (0, jsx)(VibrationLevel, {}),
      /* @__PURE__ */ (0, jsx)(SectionLabel, { icon: "languages", title: t2("language.title"), detail: t2("language.subtitle") }),
      /* @__PURE__ */ (0, jsx)(Row4, { code: "system", name: t2("language.system"), detail: nameOf(systemLocale()), checked: choice2 === null, onPress: () => pick2(null) }),
      LOCALES.map(
        ({ code, name }) => /* @__PURE__ */ (0, jsx)(Row4, { code, name, detail: t2(`language.name.${code}`), checked: choice2 === code, onPress: () => pick2(code) }, code)
      )
    ] }) });
  }

export { LanguageSheet };
