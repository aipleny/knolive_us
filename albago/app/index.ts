import { registerRootComponent } from 'expo';
import * as Notifications from 'expo-notifications';
import './src/geofence'; // defines the background geofence task at module top level
import App from './App';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
});

registerRootComponent(App);
