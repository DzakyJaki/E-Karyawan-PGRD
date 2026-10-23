import React from 'react';
import { LeaveScreen } from '../../features/leave/screens/LeaveScreen';
import { SwipeableTabView } from '../../components/SwipeableTabView';

export default function Leave() {
  return (
    <SwipeableTabView currentTab="leave">
      <LeaveScreen />
    </SwipeableTabView>
  );
}