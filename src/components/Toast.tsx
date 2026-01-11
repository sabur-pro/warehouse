// src/components/Toast.tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ToastProps {
    visible: boolean;
    message: string;
    type?: 'success' | 'error' | 'warning' | 'info';
    onHide: () => void;
    duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
    visible,
    message,
    type = 'info',
    onHide,
    duration = 2500,
}) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(-100)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.spring(slideAnim, {
                    toValue: 0,
                    friction: 8,
                    tension: 40,
                    useNativeDriver: true,
                }),
            ]).start();

            const timer = setTimeout(() => {
                Animated.parallel([
                    Animated.timing(fadeAnim, {
                        toValue: 0,
                        duration: 200,
                        useNativeDriver: true,
                    }),
                    Animated.timing(slideAnim, {
                        toValue: -100,
                        duration: 200,
                        useNativeDriver: true,
                    }),
                ]).start(() => onHide());
            }, duration);

            return () => clearTimeout(timer);
        }
    }, [visible, duration]);

    if (!visible) return null;

    const getTypeConfig = () => {
        switch (type) {
            case 'success':
                return {
                    backgroundColor: '#22c55e',
                    icon: 'checkmark-circle' as const,
                };
            case 'error':
                return {
                    backgroundColor: '#ef4444',
                    icon: 'close-circle' as const,
                };
            case 'warning':
                return {
                    backgroundColor: '#f59e0b',
                    icon: 'warning' as const,
                };
            case 'info':
            default:
                return {
                    backgroundColor: '#3b82f6',
                    icon: 'information-circle' as const,
                };
        }
    };

    const config = getTypeConfig();

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    backgroundColor: config.backgroundColor,
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                },
            ]}
        >
            <Ionicons name={config.icon} size={22} color="#fff" style={styles.icon} />
            <Text style={styles.message}>{message}</Text>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 60,
        left: 16,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
        zIndex: 9999,
    },
    icon: {
        marginRight: 10,
    },
    message: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
    },
});
