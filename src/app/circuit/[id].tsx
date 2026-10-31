import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { CircuitMap } from '@/components/CircuitMap';
import { VehicleSelect } from '@/components/VehicleSelect';
import { Button, Card, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { TrackIcon } from '@/components/TrackIcon';
import { CATEGORIES, categoryOf, devSetCircuitCategory, getCircuit, type CircuitDetail } from '@/features/circuit/api';
import { Dropdown } from '@/components/Dropdown';
import { startLineOnPath, type LL } from '@/features/circuit/laps';
import { simulateCircuitPoints, playSimulation } from '@/features/circuit/simulate';
import { TEST_TOOLS } from '@/features/drives/simulate';
import { checkRecording, refusalMessage } from '@/features/recording/authorization';
import { useRecorder } from '@/features/recording/useRecorder';
import { colors, fonts, spacing, type } from '@/theme';

/**
 * Fiche d'un circuit : plan fixe (tracé, emprise, ligne de départ), puis « Drive » pour lancer un
 * drive chronométré au tour. La ligne de départ se place là où le drive démarre, perpendiculaire
 * au tracé ; un circuit sans tracé apprend le sien au premier drive.
 */
export default function CircuitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, primaryVehicle } = useAuth();
  const { status, recorder } = useRecorder();
  const [circuit, setCircuit] = useState<CircuitDetail | null | undefined>(undefined);
  const [me, setMe] = useState<LL | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const chosenVehicle = vehicleId === undefined ? primaryVehicle?.id ?? null : vehicleId;

  // Au retour de l'éditeur de tracé (dev), la fiche se recharge.
  useFocusEffect(useCallback(() => {
    if (!id) return;
    getCircuit(id).then(setCircuit).catch(() => setCircuit(null));
    Location.getLastKnownPositionAsync().then((p) => p && setMe(p.coords)).catch(() => {});
  }, [id]));

  const path = useMemo(() => circuit?.path.flat() ?? [], [circuit]);
  // Aperçu de la ligne de départ : là où je suis si je suis sur le circuit, sinon au début du tracé.
  const previewLine = useMemo(() => {
    if (!circuit || path.length < 2) return circuit?.startLine ?? null;
    return startLineOnPath(path, me ?? path[0]);
  }, [circuit, path, me]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/map'));

  if (circuit === undefined) return <Screen style={styles.center}><ActivityIndicator color={colors.accent} /></Screen>;
  if (!circuit) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.muted}>Circuit introuvable.</Text>
        <Button title="Back" variant="secondary" onPress={back} />
      </Screen>
    );
  }

  const cat = categoryOf(circuit.category);
  const playable = circuit.area.length > 0 || path.length > 1;
  const recording = status !== 'idle';

  const drive = async () => {
    if (recording) return router.push('/circuit/live');
    const perm = await recorder.requestPermissions();
    if (perm === 'denied') return Alert.alert('Localisation refusée', 'Active la localisation dans les réglages.');
    setBusy(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const ctx = await checkRecording(pos.coords, profile);
      if (!ctx.allowed) return Alert.alert('Enregistrement indisponible ici', refusalMessage(ctx));
      if (ctx.circuitId !== circuit.id) {
        return Alert.alert('Pas sur ce circuit', `Rends-toi sur ${circuit.name} pour lancer un drive chronométré : le départ doit se faire dans l’enceinte du circuit.`);
      }
      await recorder.start('circuit', { circuitId: circuit.id, circuitName: circuit.name });
      router.push({ pathname: '/circuit/live', params: { vehicle: chosenVehicle ?? '' } });
    } catch (e) {
      Alert.alert('Drive impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Outils de test : drive simulé en temps réel sur le tracé (x1 ou x5) ; sans tracé, le long de l'emprise.
  const simulate = (speedup: number) => {
    const simPath = path.length > 2 ? path : circuit.area[0] ?? [];
    if (simPath.length < 3) return Alert.alert('Simulation impossible', 'Ce circuit n’a ni tracé ni emprise.');
    const pts = simulateCircuitPoints(simPath, { laps: 3, start: simPath[0] });
    recorder.startSimulated('circuit', (push) => playSimulation(pts, push, () => {}, speedup), { circuitId: circuit.id, circuitName: circuit.name });
    router.push({ pathname: '/circuit/live', params: { vehicle: chosenVehicle ?? '' } });
  };

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View style={styles.topBar}>
        <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back" style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
      </View>

      <View style={{ gap: 6 }}>
        <View style={[styles.cat, { backgroundColor: cat.color }]}>
          <TrackIcon category={cat.key} size={18} style={{ borderRadius: 5 }} />
          <Text style={styles.catText}>{cat.label.toUpperCase()}</Text>
        </View>
        <Text style={styles.title}>{circuit.name}</Text>
        <Text style={styles.muted}>
          {[circuit.city, circuit.countryCode, circuit.lapLengthM ? `${(circuit.lapLengthM / 1000).toFixed(2)} km` : null].filter(Boolean).join(' · ')}
        </Text>
      </View>

      <CircuitMap circuit={circuit} startLine={previewLine} car={me} style={{ height: 340 }} />
      <Text style={styles.hint}>
        {path.length > 1
          ? 'Trait rouge : ligne de départ. Elle se place là où tu démarres, perpendiculaire au tracé.'
          : 'Pas encore de tracé : la ligne se place à ton départ, et ton meilleur tour deviendra le tracé du circuit.'}
        {circuit.pathSource === 'drive' ? ' Tracé appris d’un drive.' : circuit.pathSource === 'manual' ? ' Tracé corrigé par l’équipe.' : ''}
      </Text>

      {playable ? (
        <Card style={{ gap: spacing.md }}>
          <VehicleSelect compact label="Car" value={chosenVehicle} onChange={setVehicleId} />
          <Button title={recording ? 'BACK TO DRIVE' : 'DRIVE'} icon="flag" trailingIcon="arrow-forward" onPress={drive} loading={busy} />
          <Text style={styles.hint}>Démarre dans l’enceinte du circuit. Tours chronométrés à chaque passage de la ligne.</Text>
          {TEST_TOOLS && !recording && (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button title="Simulate (real time)" variant="ghost" icon="flask-outline" style={{ flex: 1 }} onPress={() => simulate(1)} />
              <Button title="×5" variant="ghost" style={{ width: 70 }} onPress={() => simulate(5)} />
            </View>
          )}
        </Card>
      ) : (
        <Text style={styles.muted}>Ni tracé ni emprise connus pour ce circuit : il n’est pas encore jouable.</Text>
      )}

      {profile?.is_dev && (
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.devTitle}>DEV</Text>
          <Dropdown label="Track category" value={circuit.category} style={{ flex: 0 }}
            options={CATEGORIES.map((c) => ({ key: c.key, label: c.label, left: <TrackIcon category={c.key} size={20} /> }))}
            onChange={async (v) => {
              try { await devSetCircuitCategory(circuit.id, v); setCircuit({ ...circuit, category: v }); }
              catch (e) { Alert.alert('Erreur', e instanceof Error ? e.message : String(e)); }
            }} />
          <Button title="Edit track path" variant="secondary" icon="create-outline"
            onPress={() => router.push({ pathname: '/circuit/edit', params: { id: circuit.id } })} />
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button title="Leaderboard" variant="secondary" icon="podium-outline" style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/leaderboard', params: { circuit: circuit.id, circuitName: circuit.name } })} />
        {circuit.website ? (
          <Button title="Website" variant="secondary" icon="open-outline" style={{ flex: 1 }} onPress={() => Linking.openURL(circuit.website!)} />
        ) : null}
      </View>
      <Text style={styles.credit}>Circuit data © OpenStreetMap contributors, Wikidata</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  topBar: { flexDirection: 'row', alignItems: 'center' },
  title: { ...type.h1, color: colors.text },
  muted: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  hint: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  cat: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  catText: { color: '#0B0B0B', fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1 },
  devTitle: { color: '#F59E0B', fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1 },
  credit: { color: colors.textFaint, fontFamily: fonts.regular, fontSize: 10 },
});
