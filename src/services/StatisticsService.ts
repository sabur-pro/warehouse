// src/services/StatisticsService.ts
import { Item, Transaction } from '../../database/types';

export interface BoxDistribution {
  pairsCount: number;
  boxCount: number;
}

export interface StatisticsCalculation {
  totalItems: number;
  totalValue: number;
  totalQuantity: number;
  totalBoxes: number;
  boxDistribution: BoxDistribution[];
  totalSales: number;
  totalProfit: number;
  warehouseCount: number;
  recentTransactions: number;
  averageProfit: number;
  profitMargin: number;
}

export interface PeriodStatistics {
  sales: number;
  profit: number;
  profitMargin: number;
  averageProfit: number;
  salesCount: number;
  shoesQuantity: number; // количество проданной обуви
  clothesQuantity: number; // количество проданной одежды
}

export class StatisticsService {
  static calculateStatistics(
    items: Item[],
    transactions: Transaction[],
    warehouseCount: number
  ): StatisticsCalculation {
    // Подсчитываем основную статистику по товарам
    const totalItems = items.length;
    
    // Исключаем товары без цены (totalValue = 0) из общей стоимости
    const totalValue = items.reduce((sum, item) => {
      if (item.totalValue > 0) {
        return sum + item.totalValue;
      }
      return sum;
    }, 0);
    
    const totalQuantity = items.reduce((sum, item) => sum + item.totalQuantity, 0);
    
    // Подсчитываем коробки
    const totalBoxes = items.reduce((sum, item) => sum + item.numberOfBoxes, 0);
    
    // Распределение коробок по количеству пар
    const boxDistribution = this.calculateBoxDistribution(items);
    
    // Подсчитываем продажи и прибыль
    let totalSales = 0;
    let totalProfit = 0;
    let salesCount = 0;
    
    transactions.forEach(tx => {
      if (tx.action === 'sale' || tx.action === 'wholesale' || (tx.action === 'update' && tx.details)) {
        try {
          const details = JSON.parse(tx.details || '{}');
          if (details.sale) {
            const saleAmount = details.sale.salePrice * details.sale.quantity;
            totalSales += saleAmount;
            totalProfit += details.sale.profit || 0;
            salesCount++;
          }
          // Обработка оптовых продаж
          if (details.wholesale) {
            totalSales += details.wholesale.totalSalePrice || 0;
            totalProfit += details.wholesale.totalProfit || 0;
            salesCount++;
          }
        } catch (e) {
          // Игнорируем ошибки парсинга
        }
      }
    });
    
    // Подсчитываем транзакции за последнюю неделю
    const weekAgo = Date.now() / 1000 - 7 * 24 * 60 * 60;
    const recentTransactions = transactions.filter(tx => tx.timestamp > weekAgo).length;

    // Вычисляем дополнительные метрики
    const averageProfit = salesCount > 0 ? totalProfit / salesCount : 0;
    const profitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

    return {
      totalItems,
      totalValue,
      totalQuantity,
      totalBoxes,
      boxDistribution,
      totalSales,
      totalProfit,
      warehouseCount,
      recentTransactions,
      averageProfit,
      profitMargin,
    };
  }

  /**
   * Рассчитывает распределение коробок по количеству пар
   */
  static calculateBoxDistribution(items: Item[]): BoxDistribution[] {
    const distributionMap = new Map<number, number>();
    
    items.forEach(item => {
      try {
        const boxSizeQuantities = JSON.parse(item.boxSizeQuantities);
        
        // boxSizeQuantities - это массив коробок, где каждая коробка - массив размеров
        if (Array.isArray(boxSizeQuantities)) {
          boxSizeQuantities.forEach((box: any) => {
            if (Array.isArray(box)) {
              // Считаем количество пар в коробке
              const pairsInBox = box.reduce((sum: number, sizeItem: any) => {
                return sum + (sizeItem.quantity || 0);
              }, 0);
              
              // Добавляем в распределение
              const currentCount = distributionMap.get(pairsInBox) || 0;
              distributionMap.set(pairsInBox, currentCount + 1);
            }
          });
        }
      } catch (e) {
        console.warn('Ошибка парсинга boxSizeQuantities для товара', item.id);
      }
    });
    
    // Преобразуем в массив и сортируем по количеству пар
    return Array.from(distributionMap.entries())
      .map(([pairsCount, boxCount]) => ({ pairsCount, boxCount }))
      .sort((a, b) => a.pairsCount - b.pairsCount);
  }

  /**
   * Рассчитывает статистику за определенный период
   */
  static calculatePeriodStatistics(
    transactions: Transaction[],
    startTimestamp: number,
    endTimestamp: number,
    items: Item[] = []
  ): PeriodStatistics {
    let sales = 0;
    let profit = 0;
    let salesCount = 0;
    let shoesQuantity = 0;
    let clothesQuantity = 0;
    
    // Создаем карту товаров для быстрого поиска
    const itemsMap = new Map<number, Item>();
    items.forEach(item => itemsMap.set(item.id, item));
    
    transactions.forEach(tx => {
      if (tx.timestamp >= startTimestamp && tx.timestamp <= endTimestamp) {
        if (tx.action === 'sale' || tx.action === 'wholesale' || (tx.action === 'update' && tx.details)) {
          try {
            const details = JSON.parse(tx.details || '{}');
            if (details.sale) {
              const saleAmount = details.sale.salePrice * details.sale.quantity;
              sales += saleAmount;
              profit += details.sale.profit || 0;
              salesCount++;
              
              // Подсчет по типам товаров
              if (tx.itemId) {
                const item = itemsMap.get(tx.itemId);
                if (item) {
                  const quantity = details.sale.quantity || 0;
                  if (item.itemType === 'обувь') {
                    shoesQuantity += quantity;
                  } else if (item.itemType === 'одежда') {
                    clothesQuantity += quantity;
                  }
                }
              }
            }
            // Обработка оптовых продаж
            if (details.wholesale) {
              sales += details.wholesale.totalSalePrice || 0;
              profit += details.wholesale.totalProfit || 0;
              salesCount++;
              
              // Подсчет по типам товаров для оптовых продаж
              if (tx.itemId) {
                const item = itemsMap.get(tx.itemId);
                if (item && details.wholesale.soldItems) {
                  // Считаем количество проданных единиц
                  const totalQuantity = details.wholesale.soldItems.reduce(
                    (sum: number, soldItem: any) => sum + (soldItem.quantity || 0),
                    0
                  );
                  if (item.itemType === 'обувь') {
                    shoesQuantity += totalQuantity;
                  } else if (item.itemType === 'одежда') {
                    clothesQuantity += totalQuantity;
                  }
                }
              }
            }
          } catch (e) {
            // Игнорируем ошибки парсинга
          }
        }
      }
    });
    
    const averageProfit = salesCount > 0 ? profit / salesCount : 0;
    const profitMargin = sales > 0 ? (profit / sales) * 100 : 0;
    
    return {
      sales,
      profit,
      profitMargin,
      averageProfit,
      salesCount,
      shoesQuantity,
      clothesQuantity,
    };
  }

  static formatCurrency(amount: number): string {
    return `${amount.toFixed(2)} сомонӣ`;
  }

  static formatPercentage(percentage: number): string {
    return `${percentage.toFixed(1)}%`;
  }

  static formatQuantity(quantity: number): string {
    return `${quantity} шт.`;
  }
}

