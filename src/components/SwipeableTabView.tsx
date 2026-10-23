import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';

export type TabName = 'index' | 'leave' | 'attendance' | 'salary' | 'profile';

const TAB_ROUTES: Record<TabName, string> = {
  index: '/(tabs)',
  leave: '/(tabs)/leave',
  attendance: '/(tabs)/attendance',
  salary: '/(tabs)/salary',
  profile: '/(tabs)/profile',
};

const TAB_ORDER: TabName[] = ['index', 'leave', 'attendance', 'salary', 'profile'];

interface SwipeableTabViewProps {
  currentTab: TabName;
  children: React.ReactNode;
}

export function SwipeableTabView({ currentTab, children }: SwipeableTabViewProps) {
  const router = useRouter();

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-30, 30])
    .failOffsetY([-18, 18])
    .onEnd((e) => {
      const currentIndex = TAB_ORDER.indexOf(currentTab);
      if (currentIndex === -1) return;

      const isFastSwipe = Math.abs(e.velocityX) > 350 && Math.abs(e.translationX) > 30;
      const isLongSwipe = Math.abs(e.translationX) > 70;

      if (!isFastSwipe && !isLongSwipe) return;

      // Geser ke Kiri (Jari bergerak dari kanan ke kiri, translationX < 0) -> Tab Berikutnya
      if (e.translationX < 0) {
        if (currentIndex < TAB_ORDER.length - 1) {
          const nextTab = TAB_ORDER[currentIndex + 1];
          router.navigate(TAB_ROUTES[nextTab] as any);
        }
      }
      // Geser ke Kanan (Jari bergerak dari kiri ke kanan, translationX > 0) -> Tab Sebelumnya
      else if (e.translationX > 0) {
        if (currentIndex > 0) {
          const prevTab = TAB_ORDER[currentIndex - 1];
          router.navigate(TAB_ROUTES[prevTab] as any);
        }
      }
    });

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.container}>{children}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
