#!/bin/bash

# --- Настройки симуляторов ---
SIM1="iPhone 17 Pro"
SIM2="iPhone 17 Pro Max"

# --- Настройки проекта ---
WORKSPACE="ios/sklad.xcworkspace"
SCHEME="sklad"
BUNDLE_ID="com.umed1.sklad"

echo "🔍 Ищем симуляторы…"
UDID1=$(xcrun simctl list devices | grep "$SIM1 (" | awk -F '[()]' '{print $4}')
UDID2=$(xcrun simctl list devices | grep "$SIM2 (" | awk -F '[()]' '{print $4}')

echo "📱 Симулятор 1: $SIM1 ($UDID1)"
echo "📱 Симулятор 2: $SIM2 ($UDID2)"

echo "🚀 Запуск симуляторов…"
open -a Simulator --args -CurrentDeviceUDID $UDID1
open -a Simulator --args -CurrentDeviceUDID $UDID2

echo "🔧 Сборка приложения…"
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -derivedDataPath ios/build

APP_PATH=$(find ios/build -name "*.app" | head -n 1)

if [ -z "$APP_PATH" ]; then
  echo "❌ Ошибка: .app файл не найден!"
  echo "Путь искался в: ios/build"
  exit 1
fi

echo "📦 Устанавливаем приложение..."
xcrun simctl install $UDID1 "$APP_PATH"
xcrun simctl install $UDID2 "$APP_PATH"

echo "▶️ Запуск приложения…"
xcrun simctl launch $UDID1 $BUNDLE_ID
xcrun simctl launch $UDID2 $BUNDLE_ID

echo "✅ Готово!"
