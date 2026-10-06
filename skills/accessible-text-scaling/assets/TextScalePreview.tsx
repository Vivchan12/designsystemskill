/*
 * TextScalePreview: a review tool, not part of the app. Delete this file and
 * the lines that use it when the review is done (the audit reminds you).
 *
 * A floating button that opens a panel of every iPhone and Android text-size
 * step. Picking one re-renders the app as if the phone were set to it, through
 * the generated textScale.ts (scaledText / scaledIcon read the preview first).
 * So it shows the agreed scale, not raw system scaling: text that still sets
 * its own size, and icons with a plain number for a size, stay put, which is
 * exactly what to look for.
 *
 * In App.tsx, development only:
 *   import { TextScalePreview } from './src/dev/TextScalePreview';
 *   return __DEV__ ? <TextScalePreview><Root /></TextScalePreview> : <Root />;
 *
 * Check the device setting too before signing off (references/testing.md):
 * this tool can't reach text that doesn't go through the kit.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const SETTINGS: [string, string, number][] = [
  ['iPhone', 'xS', 14 / 17], ['iPhone', 'S', 15 / 17], ['iPhone', 'M', 16 / 17], ['iPhone', 'L', 1],
  ['iPhone', 'xL', 19 / 17], ['iPhone', 'xxL', 21 / 17], ['iPhone', 'xxxL', 23 / 17],
  ['iPhone', 'AX1', 28 / 17], ['iPhone', 'AX2', 33 / 17], ['iPhone', 'AX3', 40 / 17], ['iPhone', 'AX4', 47 / 17], ['iPhone', 'AX5', 53 / 17],
  ['Android', 'Small', 0.85], ['Android', 'Default', 1], ['Android', 'Large', 1.15], ['Android', 'Largest', 1.3],
  ['Android', '150%', 1.5], ['Android', '180%', 1.8], ['Android', '200%', 2],
];

export function TextScalePreview({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState<number | null>(null);   // null: the phone's own setting
  const [open, setOpen] = useState(false);
  const pick = (s: number | null) => {
    (globalThis as any).__TEXT_SCALE_PREVIEW__ = s ?? undefined;
    setScale(s);
  };
  const label = scale === null ? 'Phone' : `${Math.round(scale * 100)}%`;
  return (
    <View style={{ flex: 1 }}>
      {/* A new key remounts the app, so every scaledText() call reads the new size. */}
      <View style={{ flex: 1 }} key={String(scale)}>{children}</View>
      {open && (
        <View style={s.panel}>
          <ScrollView>
            {(['iPhone', 'Android'] as const).map(platform => (
              <View key={platform}>
                <Text allowFontScaling={false} style={s.lab}>{platform}</Text>
                <View style={s.row}>
                  {SETTINGS.filter(x => x[0] === platform).map(([, name, v]) => (
                    <Pressable key={name} onPress={() => pick(v)} style={[s.chip, scale !== null && Math.abs(scale - v) < 0.005 && s.on]}>
                      <Text allowFontScaling={false} style={[s.chipText, scale !== null && Math.abs(scale - v) < 0.005 && s.onText]}>{name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
            <Pressable onPress={() => pick(null)} style={[s.chip, scale === null && s.on, { alignSelf: 'flex-start', marginTop: 6 }]}>
              <Text allowFontScaling={false} style={[s.chipText, scale === null && s.onText]}>Use the phone's setting</Text>
            </Pressable>
            <Text allowFontScaling={false} style={s.note}>Review tool: remove before release.</Text>
          </ScrollView>
        </View>
      )}
      <Pressable onPress={() => setOpen(o => !o)} style={s.fab} accessibilityLabel="Text size review" hitSlop={8}>
        <Text allowFontScaling={false} style={s.fabText}>Aa {label}</Text>
      </Pressable>
    </View>
  );
}

// Fixed sizes on purpose: the tool must stay the same size while it scales the app.
// Named colours, not hex, so a project's colour guard has nothing to flag; keep it in src/dev/.
const s = StyleSheet.create({
  fab: { position: 'absolute', right: 12, bottom: 40, backgroundColor: 'black', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  fabText: { color: 'white', fontSize: 13, fontWeight: '700' },
  panel: { position: 'absolute', left: 12, right: 12, bottom: 88, maxHeight: 320, backgroundColor: 'white', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'silver' },
  lab: { fontSize: 11, color: 'dimgray', marginTop: 6, marginBottom: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { borderWidth: 1, borderColor: 'silver', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: 'whitesmoke' },
  on: { backgroundColor: 'black', borderColor: 'black' },
  chipText: { fontSize: 12, color: 'black' },
  onText: { color: 'white' },
  note: { fontSize: 11, color: 'dimgray', marginTop: 8 },
});
