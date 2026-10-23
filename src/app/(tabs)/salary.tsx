import React from 'react';
import SalaryScreen from './profile/salary';
import { SwipeableTabView } from '../../components/SwipeableTabView';

export default function SalaryTab() {
  return (
    <SwipeableTabView currentTab="salary">
      <SalaryScreen />
    </SwipeableTabView>
  );
}
