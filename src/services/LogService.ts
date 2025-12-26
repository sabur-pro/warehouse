import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Максимальное количество логов в памяти
const MAX_LOGS = 1000;

class LogService {
    private logs: string[] = [];
    private originalConsole: {
        log: typeof console.log;
        warn: typeof console.warn;
        error: typeof console.error;
        info: typeof console.info;
    };
    private initialized = false;

    constructor() {
        // Сохраняем оригинальные методы console
        this.originalConsole = {
            log: console.log.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console),
            info: console.info.bind(console),
        };
    }

    /**
     * Инициализировать перехват логов
     */
    initialize(): void {
        if (this.initialized) return;

        // Перехватываем console методы
        console.log = (...args: any[]) => {
            this.addLog('LOG', args);
            this.originalConsole.log(...args);
        };

        console.warn = (...args: any[]) => {
            this.addLog('WARN', args);
            this.originalConsole.warn(...args);
        };

        console.error = (...args: any[]) => {
            this.addLog('ERROR', args);
            this.originalConsole.error(...args);
        };

        console.info = (...args: any[]) => {
            this.addLog('INFO', args);
            this.originalConsole.info(...args);
        };

        this.initialized = true;
        this.addLog('INFO', ['📱 LogService initialized']);
    }

    /**
     * Добавить лог запись
     */
    private addLog(level: string, args: any[]): void {
        const timestamp = new Date().toISOString();
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');

        const logEntry = `[${timestamp}] [${level}] ${message}`;
        this.logs.push(logEntry);

        // Ограничиваем количество логов
        if (this.logs.length > MAX_LOGS) {
            this.logs = this.logs.slice(-MAX_LOGS);
        }
    }

    /**
     * Получить все логи как строку
     */
    getLogsAsString(): string {
        return this.logs.join('\n');
    }

    /**
     * Получить количество логов
     */
    getLogsCount(): number {
        return this.logs.length;
    }

    /**
     * Очистить логи
     */
    clearLogs(): void {
        this.logs = [];
        this.addLog('INFO', ['🗑️ Logs cleared']);
    }

    /**
     * Сохранить логи в файл и поделиться
     */
    async shareLogsFile(): Promise<void> {
        const logsContent = this.getLogsAsString();

        if (!logsContent) {
            throw new Error('Нет логов для экспорта');
        }

        const fileName = `app_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        const filePath = `${FileSystem.documentDirectory}${fileName}`;

        // Записываем в файл
        await FileSystem.writeAsStringAsync(filePath, logsContent, {
            encoding: FileSystem.EncodingType.UTF8,
        });

        // Проверяем, доступно ли sharing
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(filePath, {
                mimeType: 'text/plain',
                dialogTitle: 'Поделиться логами приложения',
            });
        } else {
            throw new Error('Sharing недоступен на этом устройстве');
        }
    }

    /**
     * Получить последние N логов
     */
    getLastLogs(count: number = 100): string[] {
        return this.logs.slice(-count);
    }
}

export default new LogService();
