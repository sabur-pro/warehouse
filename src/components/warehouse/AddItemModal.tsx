// src/components/warehouse/AddItemModal.tsx
import React, { useState } from 'react';
import { Modal, View, StyleSheet } from 'react-native';
import { AddItemButton } from '../../../components/AddItemButton';

interface AddItemModalProps {
  visible: boolean;
  onClose: () => void;
}

const AddItemModal: React.FC<AddItemModalProps> = ({ visible, onClose }) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <AddItemButton />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
});

export default AddItemModal;
