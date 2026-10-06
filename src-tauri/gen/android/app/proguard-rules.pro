# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
# PaperBoard: Rust 쪽에서 클래스 이름으로 찾아 만드는(register_android_plugin) 플러그인이라
# 릴리스 축소(R8)에서 이름이 바뀌거나 지워지지 않게 한다. 명령·콜백 메서드도 리플렉션으로 호출된다.
-keep class com.paperboard.app.BundlePickerPlugin {
  public <init>(android.app.Activity);
  @app.tauri.annotation.Command public *;
  @app.tauri.annotation.ActivityCallback public *;
}
