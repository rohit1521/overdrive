import { jsx, jsxs } from 'react/jsx-runtime';
import { Text, View, motion } from '@ps5-react/core';
import { useT } from '../i18n/index.js';
import { Icon } from './Icon.jsx';
import { colors } from './colors.js';

export function SourceVerification({ state }) {
  const t = useT();
  if (state !== "checking" && state !== "available" && state !== "missing") return null;
  if (state === "checking") return jsx(View, {
    style: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
    children: jsx(motion.View, {
      style: { width: 18, height: 18 }, initial: { rotate: 0 }, animate: { rotate: 360 },
      transition: { type: "tween", duration: 1.1, ease: "linear", repeat: Infinity },
      children: jsx(Icon, { name: "loader", size: 18, color: colors.fg })
    })
  });
  return jsxs(View, {
    style: { borderRadius: 30, backgroundColor: state === "available" ? colors.fg : colors.surface2,
      paddingHorizontal: 9, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 6 },
    children: [
      jsx(Icon, { name: state === "available" ? "check" : "alert", size: 15, color: state === "available" ? colors.canvas : colors.warn }),
      jsx(Text, { style: { fontFamily: "Inter-Regular", fontSize: 18, lineHeight: 24, color: state === "available" ? colors.canvas : colors.warn },
        children: t(state === "available" ? "sources.verified" : "sources.check.missing") })
    ]
  });
}
