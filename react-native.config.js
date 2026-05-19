// react-native.config.js
//
// react-native-bluetooth-classic нужен только Android — он использует
// Bluetooth Classic / RFCOMM, который iOS блокирует для не-MFi устройств
// (XPrinter не сертифицирован). На iOS его native init к тому же падает
// при старте на Simulator (Swift assertion в RNBluetoothClassic.init,
// ставит External Accessory framework без оборудования).
// Исключаем библиотеку из автолинковки iOS — на iOS печать идёт через BLE
// (react-native-ble-plx).
module.exports = {
  dependencies: {
    'react-native-bluetooth-classic': {
      platforms: {
        ios: null,
      },
    },
  },
};
