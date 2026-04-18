package com.ha.dashboard;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * ONE-TIME SETUP after installing APK:
 *   adb shell dpm set-device-owner com.ha.dashboard/.KioskDeviceAdminReceiver
 *
 * To exit kiosk:
 *   adb shell dpm remove-active-admin com.ha.dashboard/.KioskDeviceAdminReceiver
 */
public class KioskDeviceAdminReceiver extends DeviceAdminReceiver {
    @Override
    public void onEnabled(Context context, Intent intent) { super.onEnabled(context, intent); }
    @Override
    public void onDisabled(Context context, Intent intent) { super.onDisabled(context, intent); }
}
