import React from 'react';
import { AttendanceScreen } from '../../features/attendance/screens/AttendanceScreen';
import { SwipeableTabView } from '../../components/SwipeableTabView';

export default function Attendance() {
  return (
    <SwipeableTabView currentTab="attendance">
      <AttendanceScreen />
    </SwipeableTabView>
  );
}