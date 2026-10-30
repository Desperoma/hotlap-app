import { usePathname } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';

import { NotificationBell } from '@/components/NotificationBell';
import { TabBar } from '@/components/TabBar';
import { colors } from '@/theme';

export default function TabsLayout() {
  // Cloche sur tous les onglets sauf la carte, qui a sa propre barre en haut.
  const pathname = usePathname();
  const showBell = pathname !== '/map';
  return (
    <View style={{ flex: 1 }}>
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="performance" />
      <Tabs.Screen name="record" />
      <Tabs.Screen name="map" />
      <Tabs.Screen name="profile" />
    </Tabs>
    {showBell && <NotificationBell />}
    </View>
  );
}
