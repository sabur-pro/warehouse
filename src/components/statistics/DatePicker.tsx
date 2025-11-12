// src/components/statistics/DatePicker.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { PeriodType } from '../../hooks/useStatistics';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../../constants/theme';

interface DatePickerProps {
  periodType: PeriodType;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  visible: boolean;
  onClose: () => void;
}

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const DatePicker: React.FC<DatePickerProps> = ({
  periodType,
  selectedDate,
  onDateChange,
  visible,
  onClose,
}) => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const [tempDate, setTempDate] = useState(new Date(selectedDate));
  
  const accentColor = isDark ? colors.primary.gold : '#3b82f6';

  const renderDatePicker = () => {
    const year = tempDate.getFullYear();
    const month = tempDate.getMonth();
    const day = tempDate.getDate();

    // Получаем количество дней в месяце
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();

    const days: (number | null)[] = [];
    
    // Добавляем пустые ячейки для выравнивания
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    
    // Добавляем дни месяца
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    return (
      <View>
        <View style={styles.monthYearSelector}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setTempDate(new Date(year, month - 1, day))}
          >
            <MaterialIcons name="chevron-left" size={24} color={accentColor} />
          </TouchableOpacity>
          
          <Text style={[styles.monthYearText, { color: colors.text.normal }]}>
            {MONTHS[month]} {year}
          </Text>
          
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setTempDate(new Date(year, month + 1, day))}
          >
            <MaterialIcons name="chevron-right" size={24} color={accentColor} />
          </TouchableOpacity>
        </View>

        <View style={styles.weekDays}>
          {['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'].map((dayName, index) => (
            <Text key={index} style={[styles.weekDayText, { color: colors.text.muted }]}>{dayName}</Text>
          ))}
        </View>

        <View style={styles.daysGrid}>
          {days.map((d, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.dayCell,
                d === day && [styles.selectedDayCell, { backgroundColor: accentColor }],
                d === null && styles.emptyDayCell,
              ]}
              onPress={() => {
                if (d !== null) {
                  setTempDate(new Date(year, month, d));
                }
              }}
              disabled={d === null}
            >
              {d !== null && (
                <Text style={[
                  styles.dayText,
                  { color: d === day ? '#fff' : colors.text.normal },
                  d === day && styles.selectedDayText,
                ]}>
                  {d}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderMonthPicker = () => {
    const year = tempDate.getFullYear();
    const currentMonth = tempDate.getMonth();

    return (
      <View>
        <View style={styles.yearSelector}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setTempDate(new Date(year - 1, currentMonth, 1))}
          >
            <MaterialIcons name="chevron-left" size={24} color={accentColor} />
          </TouchableOpacity>
          
          <Text style={[styles.monthYearText, { color: colors.text.normal }]}>{year}</Text>
          
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setTempDate(new Date(year + 1, currentMonth, 1))}
          >
            <MaterialIcons name="chevron-right" size={24} color={accentColor} />
          </TouchableOpacity>
        </View>

        <View style={styles.monthsGrid}>
          {MONTHS.map((month, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.monthCell,
                { 
                  backgroundColor: index === currentMonth ? accentColor : (isDark ? colors.background.light : '#f9fafb'),
                  borderColor: index === currentMonth ? accentColor : colors.border.normal
                }
              ]}
              onPress={() => setTempDate(new Date(year, index, 1))}
            >
              <Text style={[
                styles.monthText,
                { color: index === currentMonth ? '#fff' : colors.text.normal },
                index === currentMonth && styles.selectedMonthText,
              ]}>
                {month}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderYearPicker = () => {
    const currentYear = tempDate.getFullYear();
    const startYear = currentYear - 5;
    const years: number[] = [];
    
    for (let i = startYear; i <= currentYear + 5; i++) {
      years.push(i);
    }

    return (
      <ScrollView style={styles.yearsList}>
        {years.map((year) => (
          <TouchableOpacity
            key={year}
            style={[
              styles.yearCell,
              { 
                backgroundColor: year === currentYear ? accentColor : (isDark ? colors.background.light : '#f9fafb'),
                borderColor: year === currentYear ? accentColor : colors.border.normal
              }
            ]}
            onPress={() => setTempDate(new Date(year, 0, 1))}
          >
            <Text style={[
              styles.yearText,
              { color: year === currentYear ? '#fff' : colors.text.normal },
              year === currentYear && styles.selectedYearText,
            ]}>
              {year}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  const handleConfirm = () => {
    onDateChange(tempDate);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={[styles.modalContent, { backgroundColor: colors.background.card }]} onStartShouldSetResponder={() => true}>
          <View style={[styles.header, { borderBottomColor: colors.border.normal }]}>
            <Text style={[styles.headerTitle, { color: colors.text.normal }]}>
              {periodType === 'custom_date' && 'Выберите дату'}
              {periodType === 'custom_month' && 'Выберите месяц'}
              {periodType === 'custom_year' && 'Выберите год'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={24} color={colors.text.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.pickerContainer}>
            {periodType === 'custom_date' && renderDatePicker()}
            {periodType === 'custom_month' && renderMonthPicker()}
            {periodType === 'custom_year' && renderYearPicker()}
          </View>

          <View style={[styles.footer, { borderTopColor: colors.border.normal }]}>
            <TouchableOpacity 
              style={[styles.cancelButton, { backgroundColor: isDark ? colors.background.light : '#f3f4f6' }]} 
              onPress={onClose}
            >
              <Text style={[styles.cancelButtonText, { color: colors.text.normal }]}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.confirmButton, { backgroundColor: accentColor }]} 
              onPress={handleConfirm}
            >
              <Text style={styles.confirmButtonText}>Выбрать</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  pickerContainer: {
    padding: 20,
  },
  monthYearSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  yearSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  navButton: {
    padding: 8,
  },
  monthYearText: {
    fontSize: 18,
    fontWeight: '600',
  },
  weekDays: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  weekDayText: {
    width: 40,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginVertical: 2,
  },
  emptyDayCell: {
    backgroundColor: 'transparent',
  },
  selectedDayCell: {
    // backgroundColor set dynamically
  },
  dayText: {
    fontSize: 14,
  },
  selectedDayText: {
    fontWeight: '600',
  },
  monthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  monthCell: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  selectedMonthCell: {
    // backgroundColor and borderColor set dynamically
  },
  monthText: {
    fontSize: 14,
    fontWeight: '500',
  },
  selectedMonthText: {
    fontWeight: '600',
  },
  yearsList: {
    maxHeight: 300,
  },
  yearCell: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
  },
  selectedYearCell: {
    // backgroundColor and borderColor set dynamically
  },
  yearText: {
    fontSize: 16,
    fontWeight: '500',
  },
  selectedYearText: {
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default DatePicker;

