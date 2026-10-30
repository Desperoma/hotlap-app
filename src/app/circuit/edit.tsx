import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE, type MapPressEvent } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { devSetCircuitPath, getCircuit, type CircuitDetail } from '@/features/circuit/api';
import type { LL } from '@/features/circuit/laps';
import { colors, fonts, radius, spacing, type } from '@/theme';

const MAX_POINTS = 150;

/** Garde au plus `max` points, régulièrement espacés (l'éditeur reste fluide). */
const thin = (pts: LL[], max: number) => (pts.length <= max ? pts : pts.filter((_, i) => i % Math.ceil(pts.length / max) === 0));

/**
 * Correction du tracé d'un circuit (comptes dev) : vue satellite, toucher la carte ajoute un point
 * en fin de tracé, glisser un point le déplace, toucher un point le sélectionne (Supprimer).
 * Le tracé enregistré passe en « manual » : ni l'import OSM ni l'apprentissage ne l'écrasent.
 */
export default function CircuitEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const mapRef = useRef<MapView>(null);
  const [circuit, setCircuit] = useState<CircuitDetail | null | undefined>(undefined);
  const [pts, setPts] = useState<LL[]>([]);
  const [history, setHistory] = useState<LL[][]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    getCircuit(id).then((c) => {
      setCircuit(c);
      if (c) setPts(thin(c.path.flat(), MAX_POINTS));
    }).catch(() => setCircuit(null));
  }, [id]);

  const frame = useMemo(() => [...(circuit?.path.flat() ?? []), ...(circuit?.area.flat() ?? [])], [circuit]);
  const fit = () => frame.length > 1 && mapRef.current?.fitToCoordinates(frame, { edgePadding: { top: 120, bottom: 220, left: 40, right: 40 }, animated: false });

  const change = (next: LL[]) => { setHistory((h) => [...h.slice(-30), pts]); setPts(next); };
  const add = (e: MapPressEvent) => { setSel(null); change([...pts, e.nativeEvent.coordinate]); };
  const move = (i: number, c: LL) => change(pts.map((p, k) => (k === i ? c : p)));
  const remove = () => { if (sel == null) return; change(pts.filter((_, k) => k !== sel)); setSel(null); };
  const undo = () => { const prev = history.at(-1); if (!prev) return; setHistory((h) => h.slice(0, -1)); setPts(prev); setSel(null); };
  const closeLoop = () => pts.length > 2 && change([...pts, pts[0]]);

  const save = async () => {
    if (!id || pts.length < 3) return Alert.alert('Tracé trop court', 'Il faut au moins 3 points.');
    setSaving(true);
    try {
      await devSetCircuitPath(id, pts);
      router.back();
    } catch (e) {
      Alert.alert('Enregistrement impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const clear = () => Alert.alert('Effacer le tracé ?', 'Le circuit réapprendra son tracé au prochain meilleur tour.', [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Effacer', style: 'destructive', onPress: async () => { if (id) { await devSetCircuitPath(id, null).catch((e) => Alert.alert('Erreur', String(e))); router.back(); } } },
  ]);

  if (!profile?.is_dev) {
    return <SafeAreaView style={styles.center}><Text style={styles.muted}>Réservé aux comptes développeurs.</Text></SafeAreaView>;
  }
  if (circuit === undefined) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.accent} /></SafeAreaView>;
  if (!circuit) return <SafeAreaView style={styles.center}><Text style={styles.muted}>Circuit introuvable.</Text></SafeAreaView>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <MapView ref={mapRef} style={StyleSheet.absoluteFill} provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        mapType="satellite" onMapReady={fit} onPress={add} rotateEnabled={false} pitchEnabled={false}>
        {circuit.area.map((ring, i) => (
          <Polygon key={`a${i}`} coordinates={ring} strokeColor="rgba(198,244,50,0.5)" fillColor="rgba(198,244,50,0.06)" strokeWidth={1} />
        ))}
        {pts.length > 1 && <Polyline coordinates={pts} strokeColor={colors.accent} strokeWidth={4} lineJoin="round" />}
        {pts.map((p, i) => (
          <Marker key={`${i}-${p.latitude}-${p.longitude}`} coordinate={p} draggable anchor={{ x: 0.5, y: 0.5 }}
            onPress={(e) => { e.stopPropagation(); setSel(i); }} onDragEnd={(e) => move(i, e.nativeEvent.coordinate)}
            tracksViewChanges={false}>
            <View style={[styles.dot, i === 0 && styles.dotFirst, sel === i && styles.dotSel]} />
          </Marker>
        ))}
      </MapView>

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.bar}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.overline}>DEV · EDIT TRACK PATH</Text>
            <Text style={styles.name} numberOfLines={1}>{circuit.name}</Text>
          </View>
          <Text style={styles.count}>{pts.length} pts</Text>
        </View>
        <Text style={styles.help}>Toucher la carte : ajouter un point · glisser : déplacer · toucher un point : le sélectionner</Text>
      </SafeAreaView>

      <View style={styles.panel}>
        <View style={styles.row}>
          <Tool icon="arrow-undo" label="Undo" onPress={undo} disabled={!history.length} />
          <Tool icon="trash-outline" label="Delete pt" onPress={remove} disabled={sel == null} />
          <Tool icon="git-commit-outline" label="Close loop" onPress={closeLoop} disabled={pts.length < 3} />
          <Tool icon="refresh" label="Restart" onPress={() => { change([]); setSel(null); }} disabled={!pts.length} />
        </View>
        <View style={styles.row}>
          <Button title="Remove path" variant="ghost" style={{ flex: 1 }} onPress={clear} />
          <Button title="Save path" icon="checkmark" style={{ flex: 1 }} onPress={save} loading={saving} disabled={pts.length < 3} />
        </View>
      </View>
    </View>
  );
}

function Tool({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.tool, disabled && { opacity: 0.35 }]} accessibilityLabel={label}>
      <Ionicons name={icon} size={18} color={colors.text} />
      <Text style={styles.toolText}>{label}</Text>
    </Pressable>
  );
}

const glass = { backgroundColor: 'rgba(22,25,22,0.92)', borderWidth: 1, borderColor: colors.border };
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, padding: spacing.lg, gap: spacing.sm },
  bar: { ...glass, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md },
  iconBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  overline: { ...type.overline, color: '#F59E0B', fontSize: 10 },
  name: { ...type.h2, color: colors.text, fontSize: 15 },
  count: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 12 },
  help: { ...glass, color: colors.textMuted, fontFamily: fonts.regular, fontSize: 11, padding: 8, borderRadius: 10, overflow: 'hidden' },
  panel: { ...glass, position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 28, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  tool: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.card },
  toolText: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 10 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.accent, borderWidth: 2, borderColor: '#0B0B0B' },
  dotFirst: { backgroundColor: '#EF4444' },
  dotSel: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
});
