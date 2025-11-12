// src/screens/StatisticsScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useStatistics, PeriodType } from '../hooks/useStatistics';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../../constants/theme';
import StatCard from '../components/common/StatCard';
import CombinedStatCard from '../components/common/CombinedStatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import PeriodSelector from '../components/statistics/PeriodSelector';
import BarChart from '../components/charts/BarChart';
import ImprovedPieChart from '../components/charts/ImprovedPieChart';
import ProgressBar from '../components/charts/ProgressBar';
import CircularProgress from '../components/charts/CircularProgress';

const StatisticsScreen: React.FC = () => {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('daily');
  const [customDate, setCustomDate] = useState<Date>(new Date());

  const { statistics, loading, error, refetch } = useStatistics(selectedPeriod, customDate);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]}>
        <View style={[styles.header, { backgroundColor: colors.background.card, borderBottomColor: colors.border.normal }]}>
          <Text style={[styles.headerTitle, { color: colors.text.normal }]}>Статистика</Text>
          <MaterialIcons name="analytics" size={24} color={isDark ? colors.primary.gold : colors.primary.blue} />
        </View>
        <LoadingSpinner text="Загрузка статистики..." />
      </SafeAreaView>
    );
  }

  if (error || !statistics) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]}>
        <View style={[styles.header, { backgroundColor: colors.background.card, borderBottomColor: colors.border.normal }]}>
          <Text style={[styles.headerTitle, { color: colors.text.normal }]}>Статистика</Text>
          <MaterialIcons name="analytics" size={24} color={isDark ? colors.primary.gold : colors.primary.blue} />
        </View>
        <EmptyState
          icon="error"
          title="Ошибка загрузки"
          description={error || 'Не удалось загрузить статистику'}
          iconColor="#ef4444"
        />
      </SafeAreaView>
    );
  }

  // Подготовка данных для графиков
  const boxDistributionData = statistics.boxDistribution.map((item, index) => ({
    label: `${item.pairsCount} пар`,
    value: item.boxCount,
    color: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'][index % 6],
  }));

  const periodData = [
    {
      label: 'Продажи',
      value: statistics.periodStats.sales,
      color: '#3b82f6',
    },
    {
      label: 'Прибыль',
      value: statistics.periodStats.profit,
      color: '#10b981',
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.screen }]}>
      <View style={[styles.header, { backgroundColor: colors.background.card, borderBottomColor: colors.border.normal }]}>
        <Text style={[styles.headerTitle, { color: colors.text.normal }]}>Статистика</Text>
        <MaterialIcons name="analytics" size={24} color={isDark ? colors.primary.gold : colors.primary.blue} />
      </View>
      
      <ScrollView 
        style={[styles.content, { backgroundColor: colors.background.screen }]} 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refetch}
            colors={isDark ? [colors.primary.gold] : [colors.primary.blue]}
            tintColor={isDark ? colors.primary.gold : colors.primary.blue}
            title="Обновление статистики..."
            titleColor={colors.text.muted}
          />
        }
      >
        {/* Общая статистика */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Общая статистика</Text>
          <View style={styles.statsGrid}>
            <CombinedStatCard
              items={[
                {
                  icon: 'inventory',
                  title: 'Всего товаров',
                  value: statistics.totalItems.toString(),
                  subtitle: 'наименований',
                },
                {
                  icon: 'inventory-2',
                  title: 'Всего коробок',
                  value: statistics.totalBoxes.toString(),
                  subtitle: 'коробок',
                },
              ]}
              color="#3b82f6"
            />
            
            <StatCard
              icon="monetization-on"
              title="Общая стоимость"
              value={`${statistics.totalValue.toFixed(2)}`}
              color="#10b981"
              subtitle="сомонӣ"
            />
            
            <CombinedStatCard
              items={[
                {
                  icon: 'inventory-2',
                  title: 'Общее количество',
                  value: `${statistics.totalQuantity}`,
                  subtitle: 'пар',
                },
                {
                  icon: 'warehouse',
                  title: 'Складов',
                  value: statistics.warehouseCount.toString(),
                  subtitle: 'активных',
                },
              ]}
              color="#f59e0b"
            />
          </View>
        </View>

        {/* Анализ продаж - переместили выше */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Анализ продаж</Text>
          <PeriodSelector
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
            customDate={customDate}
            onCustomDateChange={setCustomDate}
          />
        </View>

        {/* Показатели за период */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Показатели за период</Text>
          
          <View style={styles.statsGrid}>
            <CombinedStatCard
              items={[
                {
                  icon: 'shopping-cart',
                  title: 'Продажи',
                  value: `${statistics.periodStats.sales.toFixed(2)}`,
                  subtitle: 'сомонӣ',
                },
                {
                  icon: 'trending-up',
                  title: 'Прибыль',
                  value: `${statistics.periodStats.profit.toFixed(2)}`,
                  subtitle: 'сомонӣ',
                },
              ]}
              color="#3b82f6"
            />
            
            <CombinedStatCard
              items={[
                {
                  icon: 'percent',
                  title: 'Рентабельность',
                  value: `${statistics.periodStats.profitMargin.toFixed(1)}%`,
                  subtitle: 'маржа',
                },
                {
                  icon: 'attach-money',
                  title: 'Средняя прибыль',
                  value: `${statistics.periodStats.averageProfit.toFixed(2)}`,
                  subtitle: 'за продажу',
                },
              ]}
              color="#10b981"
            />
            
            <CombinedStatCard
              items={[
                {
                  icon: 'checkroom',
                  title: 'Продано обуви',
                  value: `${statistics.periodStats.shoesQuantity}`,
                  subtitle: 'пар',
                },
                {
                  icon: 'style',
                  title: 'Продано одежды',
                  value: `${statistics.periodStats.clothesQuantity}`,
                  subtitle: 'шт.',
                },
              ]}
              color="#f59e0b"
            />
          </View>
        </View>

        {/* Графики периода */}
        {statistics.periodStats.salesCount > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Визуализация продаж</Text>
            
            <BarChart
              data={periodData}
              title="Продажи и прибыль за период"
              height={250}
            />
            
            <View style={styles.chartSpacing} />
            
            {/* Диаграмма соотношения обуви и одежды */}
            {(statistics.periodStats.shoesQuantity > 0 || statistics.periodStats.clothesQuantity > 0) && (
              <>
                <ImprovedPieChart
                  data={[
                    {
                      label: 'Обувь',
                      value: statistics.periodStats.shoesQuantity,
                      color: '#3b82f6',
                    },
                    {
                      label: 'Одежда',
                      value: statistics.periodStats.clothesQuantity,
                      color: '#f59e0b',
                    },
                  ].filter(item => item.value > 0)}
                  title="Соотношение проданных товаров"
                  size={200}
                />
                <View style={styles.chartSpacing} />
              </>
            )}
            
            <View style={styles.chartSpacing} />
            
            {/* Прогресс-бары */}
            <View style={[styles.progressContainer, { backgroundColor: colors.background.card }]}>
              <ProgressBar
                label="Продажи"
                value={statistics.periodStats.sales}
                maxValue={statistics.totalSales > 0 ? statistics.totalSales : statistics.periodStats.sales}
                color="#3b82f6"
                unit="сомонӣ"
              />
              <ProgressBar
                label="Прибыль"
                value={statistics.periodStats.profit}
                maxValue={statistics.totalProfit > 0 ? statistics.totalProfit : statistics.periodStats.profit}
                color="#10b981"
                unit="сомонӣ"
              />
              <ProgressBar
                label="Рентабельность"
                value={statistics.periodStats.profitMargin}
                maxValue={100}
                color="#f59e0b"
                unit="%"
              />
            </View>

            <View style={styles.chartSpacing} />

            {/* Круговые диаграммы */}
            <View style={[styles.circularContainer, { backgroundColor: colors.background.card }]}>
              <CircularProgress
                percentage={statistics.periodStats.profitMargin}
                color="#10b981"
                label="Рентабельность"
                value={`${statistics.periodStats.profitMargin.toFixed(1)}%`}
                size={140}
              />
              <CircularProgress
                percentage={
                  statistics.totalSales > 0
                    ? (statistics.periodStats.sales / statistics.totalSales) * 100
                    : 0
                }
                color="#3b82f6"
                label="От общих продаж"
                value={`${statistics.periodStats.salesCount} продаж`}
                size={140}
              />
            </View>
          </View>
        )}

        {/* Распределение коробок - переместили вниз */}
        {statistics.boxDistribution.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text.normal }]}>Распределение коробок по парам</Text>
            <BarChart
              data={boxDistributionData}
              title="Количество коробок"
              height={240}
            />
            <View style={styles.chartSpacing} />
            <ImprovedPieChart
              data={boxDistributionData}
              title="Доли коробок"
              size={200}
            />
          </View>
        )}

        {/* Сообщение если нет продаж */}
        {statistics.periodStats.salesCount === 0 && (
          <View style={styles.section}>
            <View style={[styles.emptyPeriodContainer, { backgroundColor: colors.background.card }]}>
              <MaterialIcons name="info-outline" size={48} color={colors.text.muted} />
              <Text style={[styles.emptyPeriodText, { color: colors.text.muted }]}>
                За выбранный период нет продаж
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  statsGrid: {
    gap: 16,
  },
  chartSpacing: {
    height: 16,
  },
  progressContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  circularContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  emptyPeriodContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  emptyPeriodText: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 12,
    textAlign: 'center',
  },
});

export default StatisticsScreen;
