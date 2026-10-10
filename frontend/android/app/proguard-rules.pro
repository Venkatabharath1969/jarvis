# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Sherpa-ONNX — native JNI classes must not be renamed
-keep class com.k2fsa.sherpa.onnx.** { *; }
-keep class net.siteed.sherpaonnx.** { *; }

# react-native-audio-record
-keep class com.goodatlas.audiorecord.** { *; }

# react-native-background-actions
-keep class com.asterinet.reaction.bgactions.** { *; }

# Expo modules
-keep class expo.modules.** { *; }
-keep class com.jarvis.ceo.** { *; }

# Apache Commons Compress / Brotli — referenced by sherpa-onnx archive utils,
# not present at runtime (we don't use archive download features)
-dontwarn org.brotli.dec.**
-dontwarn org.apache.commons.compress.**
-dontwarn org.tukaani.xz.**
