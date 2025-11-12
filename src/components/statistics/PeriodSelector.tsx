// src/components/statistics/PeriodSelector.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../../constants/theme';
import DatePicker from './DatePicker';

export type PeriodType = 'daily' | '3day' | 'weekly' | 'monthly' | 'yearly' | 'custom_date' | 'custom_month' | 'custom_year';

interface PeriodSelectorProps {
  selectedPeriod: PeriodType;
  onPeriodChange: (period: PeriodType) => void;
  customDate?: Date;
  onCustomDateChange?: (date: Date) => void;
}

const PERIOD_OPTIONS: { type: PeriodType; label: string; icon: string }[] = [
  { type: 'daily', label: 'Дневной', icon: 'today' },
  { type: '3day', label: '3-дневный', icon: 'date-range' },
  { type: 'weekly', label: 'Недельный', icon: 'view-week' },
  { type: 'monthly', label: 'Месячный', icon: 'calendar-today' },
  { type: 'yearly', label: 'Годовой', icon: 'calendar-view-month' },
  { type: 'custom_date', label: 'Выбор даты', icon: 'event' },
  { type: 'custom_month', label: 'Выбор месяца', icon: 'event-note' },
  { type: 'custom_year', label: 'Выбор года', icon: 'calendar-month' },
];

const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  selectedPeriod,
  onPeriodChange,
  customDate = new Date(),
  onCustomDateChange = () => {},
}) => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);

  const selectedOption = PERIOD_OPTIONS.find(opt => opt.type === selectedPeriod);

  const handlePeriodSelect = (period: PeriodType) => {
    if (period === 'custom_date' || period === 'custom_month' || period === 'custom_year') {
      onPeriodChange(period);
      setIsModalVisible(false);
      setIsDatePickerVisible(true);
    } else {
      onPeriodChange(period);
      setIsModalVisible(false);
    }
  };

  const getDisplayText = () => {
    if (selectedPeriod === 'custom_date') {
      return `${customDate.toLocaleDateString('ru-RU')}`;
    } else if (selectedPeriod === 'custom_month') {
      return `${customDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`;
    } else if (selectedPeriod === 'custom_year') {
      return `${customDate.getFullYear()}`;
    }
    return selectedOption?.label || 'Выберите период';
  };

  const accentColor = isDark ? colors.primary.gold : colors.primary.blue;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.text.normal }]}>Период</Text>
      <TouchableOpacity
        style={[styles.selector, { backgroundColor: colors.background.card, borderColor: colors.border.normal }]}
        onPress={() => setIsModalVisible(true)}
      >
        <View style={styles.selectorContent}>
          <MaterialIcons name={selectedOption?.icon as any || 'today'} size={20} color={accentColor} />
          <Text style={[styles.selectorText, { color: colors.text.normal }]}>{getDisplayText()}</Text>
        </View>
        <MaterialIcons name="arrow-drop-down" size={24} color={colors.text.muted} />
      </TouchableOpacity>

      <DatePicker
        periodType={selectedPeriod}
        selectedDate={customDate}
        onDateChange={onCustomDateChange}
        visible={isDatePickerVisible}
        onClose={() => setIsDatePickerVisible(false)}
      />

      <Modal
        visible={isModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsModalVisible(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.background.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border.normal }]}>
              <Text style={[styles.modalTitle, { color: colors.text.normal }]}>Выберите период</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.muted} />
              </TouchableOpacity>
            </View>
            
            {PERIOD_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.type}
                style={[
                  styles.option,
                  { borderBottomColor: colors.border.light },
                  selectedPeriod === option.type && [styles.selectedOption, { backgroundColor: isDark ? 'rgba(212, 175, 55, 0.1)' : '#eff6ff' }],
                ]}
                onPress={() => handlePeriodSelect(option.type)}
              >
                <MaterialIcons
                  name={option.icon as any}
                  size={22}
                  color={selectedPeriod === option.type ? accentColor : colors.text.muted}
                />
                <Text
                  style={[
                    styles.optionText,
                    { color: colors.text.normal },
                    selectedPeriod === option.type && [styles.selectedOptionText, { color: accentColor }],
                  ]}
                >
                  {option.label}
                </Text>
                {selectedPeriod === option.type && (
                  <MaterialIcons name="check" size={22} color={accentColor} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  selectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectorText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  selectedOption: {
    backgroundColor: '#eff6ff',
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },
  selectedOptionText: {
    color: '#3b82f6',
    fontWeight: '600',
  },
});

export default PeriodSelector;

