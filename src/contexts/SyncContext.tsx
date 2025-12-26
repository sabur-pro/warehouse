// src/contexts/SyncContext.tsx
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

interface SyncContextType {
    // Регистрация callback для обновления экрана
    registerRefreshCallback: (key: string, callback: () => void) => void;
    unregisterRefreshCallback: (key: string) => void;
    // Вызов всех зарегистрированных callbacks после синхронизации
    triggerRefreshAll: () => void;
    // Счётчик синхронизаций (для useEffect зависимостей)
    syncVersion: number;
}

const SyncContext = createContext<SyncContextType | null>(null);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [syncVersion, setSyncVersion] = useState(0);
    const callbacksRef = useRef<Map<string, () => void>>(new Map());

    const registerRefreshCallback = useCallback((key: string, callback: () => void) => {
        callbacksRef.current.set(key, callback);
    }, []);

    const unregisterRefreshCallback = useCallback((key: string) => {
        callbacksRef.current.delete(key);
    }, []);

    const triggerRefreshAll = useCallback(() => {
        console.log('🔄 Triggering refresh for all registered screens...');
        // Увеличиваем версию синхронизации
        setSyncVersion(prev => prev + 1);
        // Вызываем все зарегистрированные callbacks
        callbacksRef.current.forEach((callback, key) => {
            console.log(`  - Refreshing: ${key}`);
            try {
                callback();
            } catch (error) {
                console.error(`Error refreshing ${key}:`, error);
            }
        });
    }, []);

    return (
        <SyncContext.Provider value={{
            registerRefreshCallback,
            unregisterRefreshCallback,
            triggerRefreshAll,
            syncVersion,
        }}>
            {children}
        </SyncContext.Provider>
    );
};

export const useSyncContext = () => {
    const context = useContext(SyncContext);
    if (!context) {
        throw new Error('useSyncContext must be used within a SyncProvider');
    }
    return context;
};

// Хук для автоматической регистрации callback при монтировании компонента
export const useSyncRefresh = (key: string, callback: () => void) => {
    const { registerRefreshCallback, unregisterRefreshCallback, syncVersion } = useSyncContext();

    // Регистрируем callback при монтировании
    React.useEffect(() => {
        registerRefreshCallback(key, callback);
        return () => unregisterRefreshCallback(key);
    }, [key, callback, registerRefreshCallback, unregisterRefreshCallback]);

    return { syncVersion };
};
