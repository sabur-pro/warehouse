// src/utils/formatters.ts
export const formatCurrency = (amount: number): string => {
  return `${amount.toFixed(2)} сомонӣ`;
};

export const formatPercentage = (percentage: number): string => {
  return `${percentage.toFixed(1)}%`;
};

export const formatQuantity = (quantity: number): string => {
  return `${quantity} шт.`;
};

export const formatDate = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const formatTime = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDateTime = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleString('ru-RU');
};

