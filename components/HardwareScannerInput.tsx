// components/HardwareScannerInput.tsx
//
// Невидимый перехватчик ввода с внешнего HID-сканера (XB-6208RB / XB-D66 / XB-M82
// и любого другого Bluetooth-сканера в HID-режиме).
//
// КАК РАБОТАЕТ
// ───────────
// Сканеры в HID-режиме спарены со смартфоном как BT-клавиатура. Когда сканер
// читает штрихкод, он «печатает» содержимое в сфокусированное поле ввода и в
// конце посылает Enter (CR/LF). Мы монтируем невидимый TextInput, который
// автофокусируется и принимает на себя этот ввод.
//
// КРИТИЧЕСКИЕ МОМЕНТЫ
// ───────────
// 1. `showSoftInputOnFocus={false}` — Android: не показываем экранную клавиатуру,
//    т.к. поле всегда «сфокусировано». iOS: при подключённой BT-клавиатуре iOS
//    САМ скрывает экранную клавиатуру, отдельный флаг не нужен.
// 2. `caretHidden` + opacity 0 + позиционирование за пределами экрана — поле
//    не видно и не мешает UI.
// 3. На blur (юзер тапнул в реальный TextInput) — НЕ возвращаем фокус сразу.
//    Возвращаем через 350мс, проверив что наш input всё ещё смонтирован. Это
//    позволяет нормально вводить текст в формы.
// 4. Heuristic «сканер vs человек»: накапливаем буфер, и при появлении \n
//    (Enter от сканера) проверяем длину. Если буфер был набран медленно через
//    софт-клавиатуру (что невозможно, она не показана), длина обычно мала —
//    отсекаем по `minLength`.

import React, { useEffect, useRef } from 'react';
import { TextInput, View, StyleSheet, AppState, Keyboard } from 'react-native';
import HardwareScannerService from '../src/services/HardwareScannerService';
import { useScannerSettings } from '../src/contexts/ScannerContext';

export const HardwareScannerInput: React.FC = () => {
  const { settings } = useScannerSettings();
  const inputRef = useRef<TextInput>(null);
  const bufferRef = useRef<string>('');
  const lastCharAtRef = useRef<number>(0);
  const refocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Когда видна софт-клавиатура, юзер печатает в РЕАЛЬНОЕ поле — не воруем фокус.
  const softKeyboardVisibleRef = useRef<boolean>(false);

  // Возврат фокуса на наш input. Делается отложенно, чтобы не воевать
  // с фокусом «настоящих» полей ввода.
  const scheduleRefocus = (delay: number) => {
    if (refocusTimerRef.current) clearTimeout(refocusTimerRef.current);
    refocusTimerRef.current = setTimeout(() => {
      refocusTimerRef.current = null;
      if (!settings.enabled) return;
      // Если показана софт-клавиатура — юзер печатает руками в форме. Ждём.
      if (softKeyboardVisibleRef.current) return;
      inputRef.current?.focus();
    }, delay);
  };

  useEffect(() => {
    if (!settings.enabled) {
      inputRef.current?.blur();
      bufferRef.current = '';
      return;
    }
    scheduleRefocus(0);

    // При возврате приложения из фона — снова забираем фокус.
    const appSub = AppState.addEventListener('change', state => {
      if (state === 'active' && settings.enabled) {
        scheduleRefocus(200);
      }
    });

    // Софт-клавиатура: появилась — значит юзер тапнул в реальный TextInput;
    // мы уходим из борьбы. Скрылась — пытаемся вернуть фокус.
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      softKeyboardVisibleRef.current = true;
      // Гарантированно сбрасываем буфер: то, что юзер сейчас введёт,
      // приходит уже не в наш input.
      bufferRef.current = '';
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      softKeyboardVisibleRef.current = false;
      scheduleRefocus(150);
    });

    return () => {
      appSub.remove();
      showSub.remove();
      hideSub.remove();
      if (refocusTimerRef.current) clearTimeout(refocusTimerRef.current);
    };
  }, [settings.enabled]);

  const handleChangeText = (text: string) => {
    const now = Date.now();
    const since = now - lastCharAtRef.current;
    lastCharAtRef.current = now;

    // Если интервал между «событиями ввода» больше maxIntervalMs, считаем что
    // это был человек (через софт-клавиатуру) — сбрасываем буфер и начинаем
    // заново. Сканер шлёт символы пачками за единицы мс.
    if (since > settings.maxIntervalMs && bufferRef.current.length > 0 && !bufferRef.current.includes('\n')) {
      // Слишком долгая пауза — выбрасываем накопленное.
      bufferRef.current = '';
    }

    // Терминатор может прилететь как \n или \r\n. Берём всё ДО терминатора.
    if (text.includes('\n') || text.includes('\r')) {
      const code = text.replace(/[\r\n]+$/g, '').trim();
      bufferRef.current = '';
      // Сбрасываем содержимое поля сразу — TextInput становится снова пустым.
      inputRef.current?.clear();

      if (code.length >= settings.minLength) {
        console.log('📡 HardwareScannerInput: scan', JSON.stringify(code));
        HardwareScannerService.emitScan(code);
      } else {
        console.log('📡 HardwareScannerInput: discarded (too short):', JSON.stringify(code));
      }
      return;
    }

    bufferRef.current = text;
  };

  return (
    <View style={styles.wrapper} pointerEvents="none">
      <TextInput
        ref={inputRef}
        style={styles.input}
        onChangeText={handleChangeText}
        onBlur={() => {
          // Юзер тапнул в реальный TextInput — даём ему ввести, потом
          // через 350мс пытаемся вернуть фокус. Если в этот момент юзер
          // ещё печатает, фокус останется на его поле (TextInput.focus()
          // в RN — мягкий, он не отбирает фокус у активного элемента,
          // пока тот не закрыт).
          scheduleRefocus(350);
        }}
        autoFocus
        caretHidden
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        contextMenuHidden
        showSoftInputOnFocus={false}
        blurOnSubmit={false}
        // Многострочный режим нам не нужен — но мы хотим, чтобы Enter попадал
        // в onChangeText как '\n', а не закрывал поле. RN на iOS по умолчанию
        // НЕ кладёт \n в значение, поэтому используем onSubmitEditing как fallback.
        onSubmitEditing={() => {
          // На некоторых iOS-устройствах Enter с BT-клавиатуры приходит сюда,
          // а в onChangeText \n не попадает. Эмулируем терминатор вручную.
          const buf = bufferRef.current;
          bufferRef.current = '';
          inputRef.current?.clear();
          const code = buf.trim();
          if (code.length >= settings.minLength) {
            console.log('📡 HardwareScannerInput: scan (submit)', JSON.stringify(code));
            HardwareScannerService.emitScan(code);
          }
          // После submit input уходит в blur — refocus через scheduleRefocus.
          scheduleRefocus(100);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    // Уводим за пределы экрана: невидимо, но в иерархии — фокус работает.
    position: 'absolute',
    top: -1000,
    left: -1000,
    width: 1,
    height: 1,
    opacity: 0,
  },
  input: {
    width: 1,
    height: 1,
    color: 'transparent',
  },
});
