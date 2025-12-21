// src/hooks/useStatistics.ts
import { useState, useEffect } from 'react';
import { useDatabase } from '../../hooks/useDatabase';
import { StatisticsService, StatisticsCalculation, PeriodStatistics } from '../services/StatisticsService';
import { Item, Transaction } from '../../database/types';

export type PeriodType = 'daily' | '3day' | 'weekly' | 'monthly' | 'yearly' | 'custom_date' | 'custom_month' | 'custom_year';

export interface StatisticsData extends StatisticsCalculation {
  periodStats: PeriodStatistics;
  transactions: Transaction[];
}

export const useStatistics = (selectedPeriod: PeriodType = 'daily', customDate?: Date) => {
  const [statistics, setStatistics] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { getItemsPage, getAllItems, getTransactionsPage, getDistinctWarehouses } = useDatabase();
  const [allItems, setAllItems] = useState<Item[]>([]); // Added allItems state

  const getPeriodTimestamps = (period: PeriodType, date?: Date): { start: number; end: number } => {
    const now = Date.now();
    const endTimestamp = Math.floor(now / 1000);
    let startTimestamp: number;

    const currentDate = date || new Date();

    switch (period) {
      case 'daily':
        // Текущий день (с 00:00 до 23:59)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        return {
          start: Math.floor(todayStart.getTime() / 1000),
          end: Math.floor(todayEnd.getTime() / 1000),
        };
        break;
      case '3day':
        // Последние 3 дня
        startTimestamp = endTimestamp - 3 * 24 * 60 * 60;
        break;
      case 'weekly':
        // Последние 7 дней
        startTimestamp = endTimestamp - 7 * 24 * 60 * 60;
        break;
      case 'monthly':
        // Последние 30 дней
        startTimestamp = endTimestamp - 30 * 24 * 60 * 60;
        break;
      case 'yearly':
        // Последние 365 дней
        startTimestamp = endTimestamp - 365 * 24 * 60 * 60;
        break;
      case 'custom_date':
        // Конкретная дата (весь день)
        const dateStart = new Date(currentDate);
        dateStart.setHours(0, 0, 0, 0);
        const dateEnd = new Date(currentDate);
        dateEnd.setHours(23, 59, 59, 999);
        return {
          start: Math.floor(dateStart.getTime() / 1000),
          end: Math.floor(dateEnd.getTime() / 1000),
        };
      case 'custom_month':
        // Конкретный месяц
        const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
        return {
          start: Math.floor(monthStart.getTime() / 1000),
          end: Math.floor(monthEnd.getTime() / 1000),
        };
      case 'custom_year':
        // Конкретный год
        const yearStart = new Date(currentDate.getFullYear(), 0, 1);
        const yearEnd = new Date(currentDate.getFullYear(), 11, 31, 23, 59, 59);
        return {
          start: Math.floor(yearStart.getTime() / 1000),
          end: Math.floor(yearEnd.getTime() / 1000),
        };
      default:
        startTimestamp = endTimestamp - 24 * 60 * 60;
    }

    return { start: startTimestamp, end: endTimestamp };
  };

  const loadStatistics = async () => {
    try {
      setLoading(true);
      setError(null);

      // Получаем все товары (включая удаленные) для корректного маппинга в статистике
      const fetchedAllItems = await getAllItems();
      setAllItems(fetchedAllItems);

      // Получаем активные товары для подсчета текущих запасов
      const { items: activeItems } = await getItemsPage(10000, 0, '', 'Все');

      // Получаем все транзакции (или достаточно большое количество)
      const { transactions } = await getTransactionsPage(50000, 0);

      // Получаем список складов
      const warehouses = await getDistinctWarehouses();

      // Используем сервис для вычисления общей статистики
      const calculatedStats = StatisticsService.calculateStatistics(
        activeItems,
        transactions,
        warehouses.length
      );

      // Вычисляем статистику за выбранный период
      const { start, end } = getPeriodTimestamps(selectedPeriod, customDate);
      const periodStats = StatisticsService.calculatePeriodStatistics(
        transactions,
        start,
        end,
        fetchedAllItems // Используем все товары для маппинга
      );

      setStatistics({
        ...calculatedStats,
        periodStats,
        transactions,
      });
    } catch (error) {
      console.error('Failed to load statistics:', error);
      setError('Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatistics();
  }, [selectedPeriod, customDate]);

  const refetch = () => {
    loadStatistics();
  };

  return {
    statistics,
    loading,
    error,
    refetch,
  };
};
