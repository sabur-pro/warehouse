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
      // Пытаемся определить, является ли транзакция продажей (обычной или оптовой)
      if (tx.action === 'sale' || tx.action === 'wholesale' || tx.action === 'update') {
        try {
          const details = JSON.parse(tx.details || '{}');

          // Проверка на обычную продажу
          const isRetailSale = details.sale || (tx.action === 'sale') || (details.type === 'sale');
          // Проверка на оптовую продажу
          const isWholesaleSale = details.wholesale || (tx.action === 'wholesale') || (details.type === 'wholesale');

          if (isRetailSale && !isWholesaleSale) {
            const sale = details.sale || details; // Пытаемся взять из вложенного объекта или из корня
            const quantity = Number(sale.quantity || 0);
            const salePrice = Number(sale.salePrice || 0);
            const saleAmount = salePrice * quantity;
            const profit = Number(sale.profit || 0);

            if (quantity > 0 || salePrice > 0) {
              totalSales += saleAmount;
              totalProfit += profit;
              salesCount++;
            }
          } else if (isWholesaleSale) {
            const wholesale = details.wholesale || details;
            totalSales += Number(wholesale.totalSalePrice || wholesale.salePrice || 0);
            totalProfit += Number(wholesale.totalProfit || wholesale.profit || 0);
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

    // Создаем карту товаров для быстрого поиска с приведением ID к строке для надежности
    const itemsMap = new Map<string, Item>();
    items.forEach(item => itemsMap.set(String(item.id), item));

    transactions.forEach(tx => {
      if (tx.timestamp >= startTimestamp && tx.timestamp <= endTimestamp) {
        // Пытаемся определить, является ли транзакция продажей
        if (tx.action === 'sale' || tx.action === 'wholesale' || tx.action === 'update') {
          try {
            const details = JSON.parse(tx.details || '{}');

            // Проверка на обычную продажу
            const isRetailSale = details.sale || (tx.action === 'sale') || (details.type === 'sale');
            // Проверка на оптовую продажу
            const isWholesaleSale = details.wholesale || (tx.action === 'wholesale') || (details.type === 'wholesale');

            if (isRetailSale && !isWholesaleSale) {
              const sale = details.sale || details;
              const quantity = Number(sale.quantity || 0);
              const salePrice = Number(sale.salePrice || 0);
              const saleProfit = Number(sale.profit || 0);

              sales += salePrice * quantity;
              profit += saleProfit;
              salesCount++;

              // Подсчет по типам товаров
              let itemType: string | undefined = undefined;

              // 1. Пытаемся взять тип из транзакции (если сохранено в корень или в sale)
              itemType = details.itemType || sale.itemType;

              // 2. Если нет в транзакции, ищем в карте товаров
              if (!itemType && tx.itemId !== undefined && tx.itemId !== null) {
                const item = itemsMap.get(String(tx.itemId));
                if (item) {
                  itemType = item.itemType;
                }
              }

              // 3. Категоризируем (проверяем разные варианты написания)
              if (itemType) {
                const normalizedType = itemType.trim().toLowerCase();
                // Проверяем на одежду (включая варианты с разными регистрами и возможные опечатки)
                if (normalizedType === 'одежда' || normalizedType.includes('одежд')) {
                  clothesQuantity += quantity;
                } else {
                  // Все остальное (включая обувь и неопознанное) считаем обувью
                  shoesQuantity += quantity;
                }
              } else {
                // Если тип вообще не найден, считаем обувью по умолчанию
                shoesQuantity += quantity;
              }
            } else if (isWholesaleSale) {
              const wholesale = details.wholesale || details;
              const totalSalePrice = Number(wholesale.totalSalePrice || wholesale.salePrice || 0);
              const totalProfitAmt = Number(wholesale.totalProfit || wholesale.profit || 0);

              sales += totalSalePrice;
              profit += totalProfitAmt;
              salesCount++;

              // Подсчет по типам товаров для оптовых продаж
              let itemType: string | undefined = undefined;
              const totalQuantity = Number(wholesale.totalQuantity || wholesale.quantity || 0);

              // 1. Пытаемся взять тип из транзакции
              itemType = details.itemType || wholesale.itemType;

              // 2. Если нет в транзакции, ищем в карте товаров
              if (!itemType && tx.itemId !== undefined && tx.itemId !== null) {
                const item = itemsMap.get(String(tx.itemId));
                if (item) {
                  itemType = item.itemType;
                }
              }

              // 3. Категоризируем (проверяем разные варианты написания)
              if (itemType) {
                const normalizedType = itemType.trim().toLowerCase();
                // Проверяем на одежду (включая варианты с разными регистрами и возможные опечатки)
                if (normalizedType === 'одежда' || normalizedType.includes('одежд')) {
                  clothesQuantity += totalQuantity;
                } else {
                  // Все остальное (включая обувь и неопознанное) считаем обувью
                  shoesQuantity += totalQuantity;
                }
              } else {
                shoesQuantity += totalQuantity;
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

