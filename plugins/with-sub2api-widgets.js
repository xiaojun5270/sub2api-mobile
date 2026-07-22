const fs = require('fs');
const path = require('path');

const {
  IOSConfig,
  withAndroidManifest,
  withDangerousMod,
  withEntitlementsPlist,
  withMainApplication,
  withPlugins,
  withXcodeProject,
} = require('@expo/config-plugins');

const SNAPSHOT_KEY = 'sub2api_home_widget_snapshot';
const ANDROID_PREFS_NAME = 'sub2api_widget_data';
const IOS_WIDGET_TARGET = 'Sub2ApiWidgets';

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function androidPackagePath(androidPackage) {
  return androidPackage.replace(/\./g, '/');
}

function getAndroidPackage(config) {
  return config.android?.package || 'com.ppx.sub2apimobile';
}

function getIosBundleIdentifier(config) {
  return config.ios?.bundleIdentifier || 'com.ppx.sub2apimobile';
}

function getIosAppGroupIdentifier(config) {
  return `group.${getIosBundleIdentifier(config)}`;
}

function getIosProjectName(config) {
  return (config.name || 'sub2api-mobile').replace(/[\W_]+/g, '');
}

function createAndroidManifestReceiver(name, widgetInfo, label) {
  return {
    $: {
      'android:name': name,
      'android:exported': 'true',
      'android:label': label,
    },
    'intent-filter': [
      {
        action: [
          {
            $: {
              'android:name': 'android.appwidget.action.APPWIDGET_UPDATE',
            },
          },
        ],
      },
    ],
    'meta-data': [
      {
        $: {
          'android:name': 'android.appwidget.provider',
          'android:resource': widgetInfo,
        },
      },
    ],
  };
}

function withSub2ApiAndroidManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) return config;

    const receivers = application.receiver ?? [];
    application.receiver = receivers.filter((receiver) => {
      const name = receiver.$?.['android:name'];
      return name !== '.widgets.Sub2ApiSummaryWidgetProvider'
        && name !== '.widgets.Sub2ApiGroupWidgetProvider';
    });

    application.receiver.push(
      createAndroidManifestReceiver(
        '.widgets.Sub2ApiSummaryWidgetProvider',
        '@xml/sub2api_summary_widget_info',
        'Sub2API 概览'
      ),
      createAndroidManifestReceiver(
        '.widgets.Sub2ApiGroupWidgetProvider',
        '@xml/sub2api_group_widget_info',
        '分组使用分布'
      )
    );

    return config;
  });
}

function withSub2ApiMainApplication(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;
    if (!contents.includes('Sub2ApiWidgetPackage()')) {
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        (match) => `${match}\n            add(Sub2ApiWidgetPackage())`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
}

function withSub2ApiAndroidFiles(config) {
  return withDangerousMod(config, ['android', (config) => {
    const androidPackage = getAndroidPackage(config);
    const root = config.modRequest.platformProjectRoot;
    const javaRoot = path.join(root, 'app/src/main/java', androidPackagePath(androidPackage));
    const widgetRoot = path.join(javaRoot, 'widgets');
    const resRoot = path.join(root, 'app/src/main/res');

    writeFile(path.join(javaRoot, 'Sub2ApiWidgetDataModule.kt'), androidModuleTemplate(androidPackage));
    writeFile(path.join(javaRoot, 'Sub2ApiWidgetPackage.kt'), androidPackageTemplate(androidPackage));
    writeFile(path.join(widgetRoot, 'Sub2ApiWidgetModels.kt'), androidModelsTemplate(androidPackage));
    writeFile(path.join(widgetRoot, 'Sub2ApiSummaryWidgetProvider.kt'), androidSummaryProviderTemplate(androidPackage));
    writeFile(path.join(widgetRoot, 'Sub2ApiGroupWidgetProvider.kt'), androidGroupProviderTemplate(androidPackage));
    writeFile(path.join(resRoot, 'layout/sub2api_summary_widget.xml'), androidSummaryLayoutTemplate());
    writeFile(path.join(resRoot, 'layout/sub2api_group_widget.xml'), androidGroupLayoutTemplate());
    writeFile(path.join(resRoot, 'xml/sub2api_summary_widget_info.xml'), androidSummaryWidgetInfoTemplate());
    writeFile(path.join(resRoot, 'xml/sub2api_group_widget_info.xml'), androidGroupWidgetInfoTemplate());
    writeFile(path.join(resRoot, 'values/sub2api_widget_colors.xml'), androidWidgetColorsTemplate(false));
    writeFile(path.join(resRoot, 'values-night/sub2api_widget_colors.xml'), androidWidgetColorsTemplate(true));
    writeFile(path.join(resRoot, 'values/sub2api_widget_strings.xml'), androidWidgetStringsTemplate());
    writeFile(path.join(resRoot, 'drawable/sub2api_widget_bg.xml'), androidWidgetBackgroundTemplate());
    writeFile(path.join(resRoot, 'drawable/sub2api_widget_tile.xml'), androidWidgetTileTemplate());
    writeFile(path.join(resRoot, 'drawable/sub2api_widget_progress.xml'), androidWidgetProgressTemplate());

    return config;
  }]);
}

function withSub2ApiIosEntitlements(config) {
  return withEntitlementsPlist(config, (config) => {
    const appGroup = getIosAppGroupIdentifier(config);
    const key = 'com.apple.security.application-groups';
    const existing = Array.isArray(config.modResults[key]) ? config.modResults[key] : [];
    config.modResults[key] = Array.from(new Set([...existing, appGroup]));
    return config;
  });
}

function withSub2ApiIosFiles(config) {
  return withDangerousMod(config, ['ios', (config) => {
    const root = config.modRequest.platformProjectRoot;
    const projectName = getIosProjectName(config);
    const appGroup = getIosAppGroupIdentifier(config);

    writeFile(path.join(root, projectName, 'Sub2ApiWidgetData.m'), iosNativeModuleTemplate(appGroup));
    writeFile(path.join(root, projectName, 'Sub2ApiWidgetReloader.swift'), iosWidgetReloaderSwiftTemplate());
    writeFile(path.join(root, IOS_WIDGET_TARGET, `${IOS_WIDGET_TARGET}-Info.plist`), iosWidgetInfoPlistTemplate());
    writeFile(path.join(root, IOS_WIDGET_TARGET, `${IOS_WIDGET_TARGET}.entitlements`), iosWidgetEntitlementsTemplate(appGroup));
    writeFile(path.join(root, IOS_WIDGET_TARGET, `${IOS_WIDGET_TARGET}.swift`), iosWidgetSwiftTemplate(appGroup));

    return config;
  }]);
}

function findTargetUuid(project, targetName) {
  if (typeof project.findTargetKey === 'function') {
    return project.findTargetKey(targetName);
  }

  const targets = project.pbxNativeTargetSection();
  return Object.keys(targets).find((key) => {
    if (key.endsWith('_comment')) return false;
    const name = targets[key]?.name;
    return name === `"${targetName}"` || name === targetName;
  });
}

function ensureBuildPhase(project, targetUuid, phaseType, comment) {
  const target = project.pbxNativeTargetSection()[targetUuid];
  const hasPhase = target.buildPhases?.some((phase) => phase.comment === comment);
  if (!hasPhase) {
    project.addBuildPhase([], phaseType, comment, targetUuid);
  }
}

function setTargetBuildSettings(project, targetUuid, settings) {
  const nativeTarget = project.pbxNativeTargetSection()[targetUuid];
  const configurationList = project.pbxXCConfigurationList()[nativeTarget.buildConfigurationList];
  const buildConfigurationIds = configurationList.buildConfigurations.map((item) => item.value);
  const buildConfigurations = project.pbxXCBuildConfigurationSection();

  buildConfigurationIds.forEach((id) => {
    buildConfigurations[id].buildSettings = {
      ...buildConfigurations[id].buildSettings,
      ...settings,
    };
  });
}

function addSourceFileOnce(project, filePath, targetUuid, groupName) {
  if (!project.hasFile(filePath)) {
    IOSConfig.XcodeUtils.ensureGroupRecursively(project, groupName);
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: filePath,
      groupName,
      project,
      targetUuid,
    });
  }
}

function withSub2ApiXcodeProject(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = getIosProjectName(config);
    const bundleIdentifier = getIosBundleIdentifier(config);
    const appGroup = getIosAppGroupIdentifier(config);
    const appTarget = project.getTarget('com.apple.product-type.application') || project.getFirstTarget();

    if (appTarget?.uuid) {
      addSourceFileOnce(project, `${projectName}/Sub2ApiWidgetData.m`, appTarget.uuid, projectName);
      addSourceFileOnce(project, `${projectName}/Sub2ApiWidgetReloader.swift`, appTarget.uuid, projectName);
    }

    let widgetTargetUuid = findTargetUuid(project, IOS_WIDGET_TARGET);
    if (!widgetTargetUuid) {
      const target = project.addTarget(
        IOS_WIDGET_TARGET,
        'app_extension',
        IOS_WIDGET_TARGET,
        `${bundleIdentifier}.widgets`
      );
      widgetTargetUuid = target.uuid;
    }

    ensureBuildPhase(project, widgetTargetUuid, 'PBXSourcesBuildPhase', 'Sources');
    ensureBuildPhase(project, widgetTargetUuid, 'PBXFrameworksBuildPhase', 'Frameworks');
    ensureBuildPhase(project, widgetTargetUuid, 'PBXResourcesBuildPhase', 'Resources');
    addSourceFileOnce(project, `${IOS_WIDGET_TARGET}/${IOS_WIDGET_TARGET}.swift`, widgetTargetUuid, IOS_WIDGET_TARGET);

    if (!project.hasFile('WidgetKit.framework')) {
      project.addFramework('WidgetKit.framework', { target: widgetTargetUuid });
    }
    if (!project.hasFile('SwiftUI.framework')) {
      project.addFramework('SwiftUI.framework', { target: widgetTargetUuid });
    }

    setTargetBuildSettings(project, widgetTargetUuid, {
      APPLICATION_EXTENSION_API_ONLY: 'YES',
      ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: 'AccentColor',
      CODE_SIGN_ENTITLEMENTS: `${IOS_WIDGET_TARGET}/${IOS_WIDGET_TARGET}.entitlements`,
      CURRENT_PROJECT_VERSION: '1',
      GENERATE_INFOPLIST_FILE: 'NO',
      INFOPLIST_FILE: `${IOS_WIDGET_TARGET}/${IOS_WIDGET_TARGET}-Info.plist`,
      IPHONEOS_DEPLOYMENT_TARGET: '17.0',
      MARKETING_VERSION: config.version || '1.0',
      PRODUCT_BUNDLE_IDENTIFIER: `${bundleIdentifier}.widgets`,
      PRODUCT_NAME: `"${IOS_WIDGET_TARGET}"`,
      SKIP_INSTALL: 'YES',
      SWIFT_VERSION: '5.0',
      TARGETED_DEVICE_FAMILY: '"1,2"',
    });

    if (appTarget?.uuid) {
      setTargetBuildSettings(project, appTarget.uuid, {
        ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES: 'YES',
        CODE_SIGN_ENTITLEMENTS: `${projectName}/${projectName}.entitlements`,
        SWIFT_VERSION: '5.0',
      });
    }

    return config;
  });
}

function androidModuleTemplate(androidPackage) {
  return `package ${androidPackage}

import ${androidPackage}.widgets.Sub2ApiWidgetUpdater
import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class Sub2ApiWidgetDataModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "Sub2ApiWidgetData"

  @ReactMethod
  fun saveSnapshot(json: String, promise: Promise) {
    try {
      reactContext
        .getSharedPreferences("${ANDROID_PREFS_NAME}", Context.MODE_PRIVATE)
        .edit()
        .putString("${SNAPSHOT_KEY}", json)
        .apply()

      Sub2ApiWidgetUpdater.updateAll(reactContext)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("ERR_SUB2API_WIDGET_DATA", error.message, error)
    }
  }
}
`;
}

function androidPackageTemplate(androidPackage) {
  return `package ${androidPackage}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class Sub2ApiWidgetPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(Sub2ApiWidgetDataModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;
}

function androidModelsTemplate(androidPackage) {
  return `package ${androidPackage}.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

object Sub2ApiWidgetStore {
  private const val prefsName = "${ANDROID_PREFS_NAME}"
  private const val snapshotKey = "${SNAPSHOT_KEY}"

  fun snapshot(context: Context): JSONObject? {
    val raw = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE).getString(snapshotKey, null)
    if (raw.isNullOrBlank()) return null

    return try {
      JSONObject(raw)
    } catch (_: Exception) {
      null
    }
  }

  fun metric(snapshot: JSONObject?, key: String): JSONObject? {
    return snapshot?.optJSONObject("summary")?.optJSONObject(key)
  }

  fun groups(snapshot: JSONObject?): JSONArray {
    return snapshot?.optJSONArray("groups") ?: JSONArray()
  }

  fun text(source: JSONObject?, key: String, fallback: String = "--"): String {
    val value = source?.optString(key)?.trim()
    return if (value.isNullOrBlank()) fallback else value
  }

  fun updatedLabel(snapshot: JSONObject?): String {
    val label = snapshot?.optString("updatedAtLabel")?.trim()
    return if (label.isNullOrBlank()) "等待刷新" else "更新 " + label
  }

  fun openAppIntent(context: Context): PendingIntent {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent(Intent.ACTION_MAIN).setPackage(context.packageName)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }

    return PendingIntent.getActivity(context, 1207, intent, flags)
  }
}

object Sub2ApiWidgetUpdater {
  fun updateAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)

    manager.getAppWidgetIds(android.content.ComponentName(context, Sub2ApiSummaryWidgetProvider::class.java))
      .forEach { Sub2ApiSummaryWidgetProvider.updateWidget(context, manager, it) }

    manager.getAppWidgetIds(android.content.ComponentName(context, Sub2ApiGroupWidgetProvider::class.java))
      .forEach { Sub2ApiGroupWidgetProvider.updateWidget(context, manager, it) }
  }
}
`;
}

function androidSummaryProviderTemplate(androidPackage) {
  return `package ${androidPackage}.widgets

import ${androidPackage}.R
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

class Sub2ApiSummaryWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    appWidgetIds.forEach { updateWidget(context, appWidgetManager, it) }
  }

  companion object {
    fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
      val snapshot = Sub2ApiWidgetStore.snapshot(context)
      val views = RemoteViews(context.packageName, R.layout.sub2api_summary_widget)
      val requests = Sub2ApiWidgetStore.metric(snapshot, "requests")
      val tokens = Sub2ApiWidgetStore.metric(snapshot, "tokens")
      val cost = Sub2ApiWidgetStore.metric(snapshot, "cost")
      val accounts = Sub2ApiWidgetStore.metric(snapshot, "accounts")

      views.setOnClickPendingIntent(R.id.sub2api_summary_root, Sub2ApiWidgetStore.openAppIntent(context))
      views.setTextViewText(R.id.sub2api_summary_title, Sub2ApiWidgetStore.text(snapshot, "title", "Sub2API"))
      views.setTextViewText(R.id.sub2api_summary_updated, Sub2ApiWidgetStore.updatedLabel(snapshot))
      views.setTextViewText(R.id.sub2api_metric_requests_label, Sub2ApiWidgetStore.text(requests, "label", "今日请求"))
      views.setTextViewText(R.id.sub2api_metric_requests_value, Sub2ApiWidgetStore.text(requests, "value"))
      views.setTextViewText(R.id.sub2api_metric_requests_detail, Sub2ApiWidgetStore.text(requests, "detail", "打开 App 刷新"))
      views.setTextViewText(R.id.sub2api_metric_tokens_label, Sub2ApiWidgetStore.text(tokens, "label", "今日 Token"))
      views.setTextViewText(R.id.sub2api_metric_tokens_value, Sub2ApiWidgetStore.text(tokens, "value"))
      views.setTextViewText(R.id.sub2api_metric_tokens_detail, Sub2ApiWidgetStore.text(tokens, "detail", "输出 --"))
      views.setTextViewText(R.id.sub2api_metric_cost_label, Sub2ApiWidgetStore.text(cost, "label", "今日成本"))
      views.setTextViewText(R.id.sub2api_metric_cost_value, Sub2ApiWidgetStore.text(cost, "value"))
      views.setTextViewText(R.id.sub2api_metric_cost_detail, Sub2ApiWidgetStore.text(cost, "detail", "TPM --"))
      views.setTextViewText(R.id.sub2api_metric_accounts_label, Sub2ApiWidgetStore.text(accounts, "label", "账号状态"))
      views.setTextViewText(R.id.sub2api_metric_accounts_value, Sub2ApiWidgetStore.text(accounts, "value"))
      views.setTextViewText(R.id.sub2api_metric_accounts_detail, Sub2ApiWidgetStore.text(accounts, "detail", "异常 -- · 限流 --"))

      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }
}
`;
}

function androidGroupProviderTemplate(androidPackage) {
  return `package ${androidPackage}.widgets

import ${androidPackage}.R
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

class Sub2ApiGroupWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    appWidgetIds.forEach { updateWidget(context, appWidgetManager, it) }
  }

  companion object {
    private val rowIds = arrayOf(
      intArrayOf(R.id.sub2api_group_row_1, R.id.sub2api_group_name_1, R.id.sub2api_group_meta_1, R.id.sub2api_group_progress_1),
      intArrayOf(R.id.sub2api_group_row_2, R.id.sub2api_group_name_2, R.id.sub2api_group_meta_2, R.id.sub2api_group_progress_2),
      intArrayOf(R.id.sub2api_group_row_3, R.id.sub2api_group_name_3, R.id.sub2api_group_meta_3, R.id.sub2api_group_progress_3),
      intArrayOf(R.id.sub2api_group_row_4, R.id.sub2api_group_name_4, R.id.sub2api_group_meta_4, R.id.sub2api_group_progress_4),
      intArrayOf(R.id.sub2api_group_row_5, R.id.sub2api_group_name_5, R.id.sub2api_group_meta_5, R.id.sub2api_group_progress_5),
      intArrayOf(R.id.sub2api_group_row_6, R.id.sub2api_group_name_6, R.id.sub2api_group_meta_6, R.id.sub2api_group_progress_6),
    )

    fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
      val snapshot = Sub2ApiWidgetStore.snapshot(context)
      val views = RemoteViews(context.packageName, R.layout.sub2api_group_widget)
      val groups = Sub2ApiWidgetStore.groups(snapshot)

      views.setOnClickPendingIntent(R.id.sub2api_group_root, Sub2ApiWidgetStore.openAppIntent(context))
      views.setTextViewText(R.id.sub2api_group_title, "分组使用分布")
      views.setTextViewText(R.id.sub2api_group_subtitle, Sub2ApiWidgetStore.text(snapshot, "rangeLabel", "今日") + " · " + Sub2ApiWidgetStore.updatedLabel(snapshot))
      views.setViewVisibility(R.id.sub2api_group_empty, if (groups.length() == 0) View.VISIBLE else View.GONE)

      rowIds.forEachIndexed { index, ids ->
        val group = groups.optJSONObject(index)
        bindRow(views, ids, group)
      }

      appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun bindRow(views: RemoteViews, ids: IntArray, group: JSONObject?) {
      if (group == null) {
        views.setViewVisibility(ids[0], View.GONE)
        return
      }

      val name = group.optString("name").ifBlank { "未命名分组" }
      val tokens = group.optString("tokens").ifBlank { "--" }
      val cost = group.optString("cost").ifBlank { "--" }
      val requests = group.optString("requests").ifBlank { "--" }
      val percent = group.optInt("percent", 0).coerceIn(0, 100)

      views.setViewVisibility(ids[0], View.VISIBLE)
      views.setTextViewText(ids[1], name)
      views.setTextViewText(ids[2], tokens + " · " + cost + " · " + requests + " req")
      views.setProgressBar(ids[3], 100, percent, false)
    }
  }
}
`;
}

function androidSummaryLayoutTemplate() {
  return `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/sub2api_summary_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:background="@drawable/sub2api_widget_bg"
  android:orientation="vertical"
  android:padding="14dp">

  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:gravity="center_vertical"
    android:orientation="horizontal">

    <TextView
      android:id="@+id/sub2api_summary_title"
      android:layout_width="0dp"
      android:layout_height="wrap_content"
      android:layout_weight="1"
      android:ellipsize="end"
      android:maxLines="1"
      android:text="Sub2API"
      android:textColor="@color/sub2api_widget_text"
      android:textSize="15sp"
      android:textStyle="bold" />

    <TextView
      android:id="@+id/sub2api_summary_updated"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:text="等待刷新"
      android:textColor="@color/sub2api_widget_subtext"
      android:textSize="11sp" />
  </LinearLayout>

  <GridLayout
    android:layout_width="match_parent"
    android:layout_height="0dp"
    android:layout_marginTop="10dp"
    android:layout_weight="1"
    android:columnCount="2"
    android:rowCount="2">

    ${androidMetricTileXml('requests')}
    ${androidMetricTileXml('tokens')}
    ${androidMetricTileXml('cost')}
    ${androidMetricTileXml('accounts')}
  </GridLayout>
</LinearLayout>
`;
}

function androidMetricTileXml(key) {
  return `<LinearLayout
      android:layout_width="0dp"
      android:layout_height="0dp"
      android:layout_columnWeight="1"
      android:layout_rowWeight="1"
      android:layout_margin="4dp"
      android:background="@drawable/sub2api_widget_tile"
      android:orientation="vertical"
      android:paddingHorizontal="10dp"
      android:paddingVertical="8dp">

      <TextView
        android:id="@+id/sub2api_metric_${key}_label"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:textColor="@color/sub2api_widget_subtext"
        android:textSize="10sp" />

      <TextView
        android:id="@+id/sub2api_metric_${key}_value"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="2dp"
        android:ellipsize="end"
        android:maxLines="1"
        android:textColor="@color/sub2api_widget_text"
        android:textSize="17sp"
        android:textStyle="bold" />

      <TextView
        android:id="@+id/sub2api_metric_${key}_detail"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="1dp"
        android:ellipsize="end"
        android:maxLines="1"
        android:textColor="@color/sub2api_widget_primary"
        android:textSize="9sp" />
    </LinearLayout>`;
}

function androidGroupLayoutTemplate() {
  return `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/sub2api_group_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:background="@drawable/sub2api_widget_bg"
  android:orientation="vertical"
  android:padding="14dp">

  <TextView
    android:id="@+id/sub2api_group_title"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:text="分组使用分布"
    android:textColor="@color/sub2api_widget_text"
    android:textSize="15sp"
    android:textStyle="bold" />

  <TextView
    android:id="@+id/sub2api_group_subtitle"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="2dp"
    android:text="今日 · 等待刷新"
    android:textColor="@color/sub2api_widget_subtext"
    android:textSize="11sp" />

  <TextView
    android:id="@+id/sub2api_group_empty"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="20dp"
    android:gravity="center"
    android:text="打开 App 后刷新分组数据"
    android:textColor="@color/sub2api_widget_subtext"
    android:textSize="12sp" />

  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="0dp"
    android:layout_marginTop="10dp"
    android:layout_weight="1"
    android:orientation="vertical">

    ${[1, 2, 3, 4, 5, 6].map(androidGroupRowXml).join('\n')}
  </LinearLayout>
</LinearLayout>
`;
}

function androidGroupRowXml(index) {
  return `<LinearLayout
      android:id="@+id/sub2api_group_row_${index}"
      android:layout_width="match_parent"
      android:layout_height="0dp"
      android:layout_weight="1"
      android:gravity="center_vertical"
      android:orientation="vertical">

      <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:gravity="center_vertical"
        android:orientation="horizontal">

        <TextView
          android:id="@+id/sub2api_group_name_${index}"
          android:layout_width="0dp"
          android:layout_height="wrap_content"
          android:layout_weight="1"
          android:ellipsize="end"
          android:maxLines="1"
          android:textColor="@color/sub2api_widget_text"
          android:textSize="11sp"
          android:textStyle="bold" />

        <TextView
          android:id="@+id/sub2api_group_meta_${index}"
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:ellipsize="end"
          android:maxLines="1"
          android:textColor="@color/sub2api_widget_subtext"
          android:textSize="10sp" />
      </LinearLayout>

      <ProgressBar
        android:id="@+id/sub2api_group_progress_${index}"
        style="?android:attr/progressBarStyleHorizontal"
        android:layout_width="match_parent"
        android:layout_height="5dp"
        android:layout_marginTop="4dp"
        android:max="100"
        android:progress="0"
        android:progressDrawable="@drawable/sub2api_widget_progress" />
    </LinearLayout>`;
}

function androidSummaryWidgetInfoTemplate() {
  return `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:initialLayout="@layout/sub2api_summary_widget"
  android:minWidth="250dp"
  android:minHeight="120dp"
  android:resizeMode="horizontal|vertical"
  android:updatePeriodMillis="1800000"
  android:widgetCategory="home_screen" />
`;
}

function androidGroupWidgetInfoTemplate() {
  return `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:initialLayout="@layout/sub2api_group_widget"
  android:minWidth="250dp"
  android:minHeight="160dp"
  android:resizeMode="horizontal|vertical"
  android:updatePeriodMillis="1800000"
  android:widgetCategory="home_screen" />
`;
}

function androidWidgetColorsTemplate(night) {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="sub2api_widget_bg">${night ? '#101820' : '#F8FAFC'}</color>
  <color name="sub2api_widget_tile">${night ? '#162232' : '#FFFFFF'}</color>
  <color name="sub2api_widget_text">${night ? '#E5EEF8' : '#0F172A'}</color>
  <color name="sub2api_widget_subtext">${night ? '#93A4B7' : '#64748B'}</color>
  <color name="sub2api_widget_border">${night ? '#26384C' : '#E2E8F0'}</color>
  <color name="sub2api_widget_primary">${night ? '#60A5FA' : '#2563EB'}</color>
  <color name="sub2api_widget_progress_track">${night ? '#243244' : '#E8EEF6'}</color>
</resources>
`;
}

function androidWidgetStringsTemplate() {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="sub2api_summary_widget_name">Sub2API 概览</string>
  <string name="sub2api_group_widget_name">分组使用分布</string>
</resources>
`;
}

function androidWidgetBackgroundTemplate() {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <solid android:color="@color/sub2api_widget_bg" />
  <stroke android:width="1dp" android:color="@color/sub2api_widget_border" />
  <corners android:radius="24dp" />
</shape>
`;
}

function androidWidgetTileTemplate() {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <solid android:color="@color/sub2api_widget_tile" />
  <stroke android:width="1dp" android:color="@color/sub2api_widget_border" />
  <corners android:radius="16dp" />
</shape>
`;
}

function androidWidgetProgressTemplate() {
  return `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:id="@android:id/background">
    <shape>
      <solid android:color="@color/sub2api_widget_progress_track" />
      <corners android:radius="999dp" />
    </shape>
  </item>
  <item android:id="@android:id/progress">
    <clip>
      <shape>
        <solid android:color="@color/sub2api_widget_primary" />
        <corners android:radius="999dp" />
      </shape>
    </clip>
  </item>
</layer-list>
`;
}

function iosNativeModuleTemplate(appGroup) {
  return `#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@interface Sub2ApiWidgetData : NSObject <RCTBridgeModule>
@end

@implementation Sub2ApiWidgetData

RCT_EXPORT_MODULE();

RCT_REMAP_METHOD(saveSnapshot,
                 saveSnapshot:(NSString *)json
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSUserDefaults *defaults = [[NSUserDefaults alloc] initWithSuiteName:@"${appGroup}"];
  if (defaults == nil) {
    reject(@"ERR_SUB2API_WIDGET_DATA", @"Unable to open Sub2API widget app group.", nil);
    return;
  }

  [defaults setObject:json forKey:@"${SNAPSHOT_KEY}"];
  [defaults synchronize];

  Class reloader = NSClassFromString(@"Sub2ApiWidgetReloader");
  SEL selector = NSSelectorFromString(@"reload");
  if (reloader != nil && [reloader respondsToSelector:selector]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
    [reloader performSelector:selector];
#pragma clang diagnostic pop
  }

  resolve([NSNull null]);
}

@end
`;
}

function iosWidgetReloaderSwiftTemplate() {
  return `import Foundation
import WidgetKit

@objc(Sub2ApiWidgetReloader)
class Sub2ApiWidgetReloader: NSObject {
  @objc static func reload() {
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
`;
}

function iosWidgetInfoPlistTemplate() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>Sub2API</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>XPC!</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>MinimumOSVersion</key>
  <string>17.0</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.widgetkit-extension</string>
  </dict>
</dict>
</plist>
`;
}

function iosWidgetEntitlementsTemplate(appGroup) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${appGroup}</string>
  </array>
</dict>
</plist>
`;
}

function iosWidgetSwiftTemplate(appGroup) {
  return `import SwiftUI
import WidgetKit

private let appGroupIdentifier = "${appGroup}"
private let snapshotKey = "${SNAPSHOT_KEY}"

struct WidgetMetric: Codable {
  let label: String
  let value: String
  let detail: String?
}

struct WidgetGroupUsage: Codable, Identifiable {
  let id: String
  let name: String
  let requests: String
  let tokens: String
  let cost: String
  let percent: Int
}

struct WidgetSummary: Codable {
  let requests: WidgetMetric
  let tokens: WidgetMetric
  let cost: WidgetMetric
  let accounts: WidgetMetric
}

struct WidgetSnapshot: Codable {
  let version: Int
  let title: String
  let rangeLabel: String
  let updatedAt: String
  let updatedAtLabel: String
  let summary: WidgetSummary
  let groups: [WidgetGroupUsage]

  static let placeholder = WidgetSnapshot(
    version: 1,
    title: "Sub2API",
    rangeLabel: "今日",
    updatedAt: "",
    updatedAtLabel: "等待刷新",
    summary: WidgetSummary(
      requests: WidgetMetric(label: "今日请求", value: "--", detail: "打开 App 刷新"),
      tokens: WidgetMetric(label: "今日 Token", value: "--", detail: "输出 --"),
      cost: WidgetMetric(label: "今日成本", value: "--", detail: "TPM --"),
      accounts: WidgetMetric(label: "账号状态", value: "--/--", detail: "异常 -- · 限流 --")
    ),
    groups: []
  )
}

struct Sub2ApiEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot
}

struct Sub2ApiWidgetProvider: TimelineProvider {
  func placeholder(in context: Context) -> Sub2ApiEntry {
    Sub2ApiEntry(date: Date(), snapshot: .placeholder)
  }

  func getSnapshot(in context: Context, completion: @escaping (Sub2ApiEntry) -> Void) {
    completion(Sub2ApiEntry(date: Date(), snapshot: loadSnapshot()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<Sub2ApiEntry>) -> Void) {
    let entry = Sub2ApiEntry(date: Date(), snapshot: loadSnapshot())
    let next = Calendar.current.date(byAdding: .minute, value: 20, to: Date()) ?? Date().addingTimeInterval(1200)
    completion(Timeline(entries: [entry], policy: .after(next)))
  }

  private func loadSnapshot() -> WidgetSnapshot {
    guard
      let defaults = UserDefaults(suiteName: appGroupIdentifier),
      let raw = defaults.string(forKey: snapshotKey),
      let data = raw.data(using: .utf8),
      let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    else {
      return .placeholder
    }

    return snapshot
  }
}

struct WidgetCard<Content: View>: View {
  @Environment(\\.colorScheme) private var colorScheme
  let content: Content

  init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  var body: some View {
    content
      .padding(14)
      .containerBackground(for: .widget) {
        LinearGradient(
          colors: colorScheme == .dark
            ? [Color(red: 0.06, green: 0.09, blue: 0.13), Color(red: 0.08, green: 0.13, blue: 0.18)]
            : [Color(red: 0.98, green: 0.99, blue: 1.0), Color(red: 0.93, green: 0.96, blue: 0.99)],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
      }
  }
}

struct MetricBlock: View {
  let metric: WidgetMetric
  let accent: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(metric.label)
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.secondary)
        .lineLimit(1)
      Text(metric.value)
        .font(.system(size: 18, weight: .bold, design: .rounded))
        .foregroundStyle(.primary)
        .minimumScaleFactor(0.72)
        .lineLimit(1)
      if let detail = metric.detail {
        Text(detail)
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(accent)
          .minimumScaleFactor(0.75)
          .lineLimit(1)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(9)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}

struct Sub2ApiSummaryWidgetView: View {
  @Environment(\\.widgetFamily) private var family
  let entry: Sub2ApiEntry

  var body: some View {
    WidgetCard {
      VStack(alignment: .leading, spacing: 10) {
        header

        if family == .systemSmall {
          VStack(spacing: 8) {
            MetricBlock(metric: entry.snapshot.summary.requests, accent: .blue)
            MetricBlock(metric: entry.snapshot.summary.tokens, accent: .orange)
          }
        } else {
          LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
            MetricBlock(metric: entry.snapshot.summary.requests, accent: .green)
            MetricBlock(metric: entry.snapshot.summary.tokens, accent: .orange)
            MetricBlock(metric: entry.snapshot.summary.cost, accent: .blue)
            MetricBlock(metric: entry.snapshot.summary.accounts, accent: .purple)
          }
        }
      }
    }
  }

  private var header: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(entry.snapshot.title)
        .font(.headline.weight(.bold))
        .foregroundStyle(.primary)
        .lineLimit(1)
      Spacer()
      Text("更新 " + entry.snapshot.updatedAtLabel)
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
  }
}

struct GroupRow: View {
  let item: WidgetGroupUsage

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack(spacing: 8) {
        Text(item.name)
          .font(.caption.weight(.bold))
          .foregroundStyle(.primary)
          .lineLimit(1)
        Spacer(minLength: 4)
        Text(item.tokens + " · " + item.cost)
          .font(.caption2.weight(.medium))
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }

      GeometryReader { proxy in
        ZStack(alignment: .leading) {
          Capsule().fill(Color.primary.opacity(0.10))
          Capsule()
            .fill(Color.blue.gradient)
            .frame(width: max(5, proxy.size.width * CGFloat(max(0, min(item.percent, 100))) / 100))
        }
      }
      .frame(height: 5)
    }
  }
}

struct Sub2ApiGroupWidgetView: View {
  @Environment(\\.widgetFamily) private var family
  let entry: Sub2ApiEntry

  var body: some View {
    WidgetCard {
      VStack(alignment: .leading, spacing: 10) {
        HStack(alignment: .firstTextBaseline) {
          Text("分组使用分布")
            .font(.headline.weight(.bold))
            .lineLimit(1)
          Spacer()
          Text(entry.snapshot.rangeLabel + " · " + entry.snapshot.updatedAtLabel)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }

        let limit = family == .systemLarge ? 7 : 5
        let groups = Array(entry.snapshot.groups.prefix(limit))
        if groups.isEmpty {
          Text("打开 App 后刷新分组数据")
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        } else {
          VStack(spacing: family == .systemLarge ? 10 : 8) {
            ForEach(groups) { item in
              GroupRow(item: item)
            }
          }
        }
      }
    }
  }
}

struct Sub2ApiSummaryWidget: Widget {
  let kind = "Sub2ApiSummaryWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Sub2ApiWidgetProvider()) { entry in
      Sub2ApiSummaryWidgetView(entry: entry)
    }
    .configurationDisplayName("Sub2API 概览")
    .description("查看今日请求、Token、成本和账号状态。")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct Sub2ApiGroupWidget: Widget {
  let kind = "Sub2ApiGroupWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Sub2ApiWidgetProvider()) { entry in
      Sub2ApiGroupWidgetView(entry: entry)
    }
    .configurationDisplayName("分组使用分布")
    .description("查看 Sub2API 分组 Token、成本和请求排行。")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}

@main
struct Sub2ApiWidgetsBundle: WidgetBundle {
  var body: some Widget {
    Sub2ApiSummaryWidget()
    Sub2ApiGroupWidget()
  }
}
`;
}

module.exports = function withSub2ApiWidgets(config) {
  return withPlugins(config, [
    withSub2ApiAndroidFiles,
    withSub2ApiAndroidManifest,
    withSub2ApiMainApplication,
    withSub2ApiIosEntitlements,
    withSub2ApiIosFiles,
    withSub2ApiXcodeProject,
  ]);
};
