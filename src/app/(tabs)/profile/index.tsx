import React from 'react';
import { ProfileScreen } from '../../../features/profile/screens/ProfileScreen';
import { SwipeableTabView } from '../../../components/SwipeableTabView';

export default function Profile() {
  return (
    <SwipeableTabView currentTab="profile">
      <ProfileScreen />
    </SwipeableTabView>
  );
}