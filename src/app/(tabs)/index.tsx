import React from 'react';
import { HomeScreen } from '../../features/home/screens/HomeScreen';
import { SwipeableTabView } from '../../components/SwipeableTabView';

export default function Index() {
  return (
    <SwipeableTabView currentTab="index">
      <HomeScreen />
    </SwipeableTabView>
  );
}